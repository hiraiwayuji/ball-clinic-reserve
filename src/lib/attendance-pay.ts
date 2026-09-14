/**
 * 勤怠の「働いた時間」と「支給額の目安」の計算（純粋関数・単体テストあり）。
 * 院長の「勤怠一覧・給与」、勤怠管理表（Excel）、スタッフ本人の記録確認が、すべてこの1本を使う。
 *
 * 時間の分け方は勤怠管理表（lib/attendance-excel.ts の数式）と同じ:
 *   総稼働   = 退勤 - 出勤 - 休憩
 *   総残業   = 8時間を超えた分
 *   深夜時間 = 22時〜翌5時に働いた分（総稼働を超えない）
 *   深夜残業 = 深夜時間と総残業の重なり
 *   深夜     = 深夜時間 - 深夜残業
 *   普通残業 = 総残業 - 深夜残業
 *   通常勤務 = 総稼働 - 普通残業 - 深夜残業   ← 深夜（残業でない分）は通常勤務の中に含まれる
 *
 * 支給額の目安 = 時給 ×（通常勤務 ＋ 普通残業×1.25 ＋ 深夜残業×1.5）＋ 時給×0.25×深夜
 *   法定の割増率（残業25%・深夜25%・深夜の残業50%）。深夜は通常勤務に含まれているので上乗せ分(25%)だけ足す。
 *   ※ 休日出勤の割増、交通費・手当は含まない（勤怠管理表と同じ範囲）。
 *
 * 休憩（その日に引く分）:
 *   1. その日の記録がある（0を含む）… その値。0 は「休憩なし」。
 *   2. 記録が無い … その人の「いつもの休憩」（reservation_staff.default_break_minutes）。
 *   3. それも決めていない … 労働基準法の最低ライン（在席6時間まで0分／働いた時間が8時間までなら45分／それ以上60分）。
 *   ⚠ 2026-09-14 まで勤怠管理表は「記録なし・0 はすべて45分」だった。
 *     8月からの打刻は休憩を記録しないので、4時間勤務のパートさんからも45分引かれていた（実データで確認）。
 */

export type BreakSource = "recorded" | "staff" | "legal";

/** 一覧の小さな印に出す言葉 */
export const BREAK_SOURCE_LABEL: Record<BreakSource, string> = {
  recorded: "記録",
  staff: "いつも",
  legal: "自動",
};

export const PAY_RATE = { overtime: 1.25, nightOvertime: 1.5, nightExtra: 0.25 } as const;

const NIGHT_START_MIN = 22 * 60;       // 22:00
const NIGHT_END_NEXT_MIN = 29 * 60;    // 翌5:00
const EARLY_NIGHT_END_MIN = 5 * 60;    // 当日5:00（5時前に出勤した日）
const LEGAL_DAY_MIN = 8 * 60;

/**
 * 深夜（22時〜翌5時）に在席していた分。働いた時間（総稼働）を超えないようにする。
 * 休憩は深夜の時間帯には取らない前提（勤怠管理表と同じ）。
 * 22時より後の出勤・翌5時を越える退勤・5時前の出勤も正しく数える。
 */
export function nightMinutesWithin(inMin: number, outMin: number, total: number): number {
  const overlap = (a: number, b: number) => Math.max(0, Math.min(outMin, b) - Math.max(inMin, a));
  return Math.min(total, overlap(NIGHT_START_MIN, NIGHT_END_NEXT_MIN) + overlap(0, EARLY_NIGHT_END_MIN));
}

/** "HH:mm" → 0時からの分。不正なら null */
export function hmToMinutes(hm: string | null | undefined): number | null {
  if (!hm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 分 → "H:MM"（24時間を超えても桁を落とさない） */
export function formatMinutes(total: number): string {
  const safe = Math.max(0, Math.round(total));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/** 出勤から退勤までの在席時間（分）。どちらかが無ければ null。退勤が出勤より前なら翌日扱い */
export function spanMinutes(clockInHm: string | null, clockOutHm: string | null): number | null {
  const inMin = hmToMinutes(clockInHm);
  const outMin = hmToMinutes(clockOutHm);
  if (inMin == null || outMin == null) return null;
  return outMin >= inMin ? outMin - inMin : outMin + 24 * 60 - inMin;
}

/**
 * 労働基準法の最低ラインの休憩（分）。
 * 働いた時間が6時間を超えるなら45分、8時間を超えるなら60分。
 * 在席時間から休憩を引いた「働いた時間」で判定する（在席8:45なら 8:45-45分=8:00 で45分のまま）。
 */
export function legalBreakMinutes(span: number): number {
  if (span <= 6 * 60) return 0;
  if (span - 45 <= LEGAL_DAY_MIN) return 45;
  return 60;
}

/** その日に引く休憩（分）と、その決まり方 */
export function effectiveBreakMinutes(
  recorded: number | null | undefined,
  staffDefault: number | null | undefined,
  span: number | null,
): { minutes: number; source: BreakSource; isDefault: boolean } {
  if (recorded != null && Number.isFinite(recorded)) {
    return { minutes: Math.max(0, Math.round(recorded)), source: "recorded", isDefault: false };
  }
  if (staffDefault != null && Number.isFinite(staffDefault)) {
    return { minutes: Math.max(0, Math.round(staffDefault)), source: "staff", isDefault: true };
  }
  return { minutes: span == null ? 0 : legalBreakMinutes(span), source: "legal", isDefault: true };
}

export type WorkSplit = {
  total: number;         // 総稼働
  normal: number;        // 通常勤務（深夜の非残業分を含む）
  overtime: number;      // 普通残業
  night: number;         // 深夜（残業でない分）
  nightOvertime: number; // 深夜残業
};

/**
 * 1日ぶんの時間を分ける。出勤か退勤のどちらかが無ければ null（打刻もれ）。
 * 退勤が出勤より前なら日をまたいだ勤務として翌日扱い（勤怠管理表と同じ）。
 * 休憩が在席時間より長いときは 0 にする（勤怠管理表はマイナスになっていた）。
 */
export function splitWorkMinutes(
  clockInHm: string | null,
  clockOutHm: string | null,
  breakMinutes: number,
): WorkSplit | null {
  const inMin = hmToMinutes(clockInHm);
  const span = spanMinutes(clockInHm, clockOutHm);
  if (inMin == null || span == null) return null;
  const outMin = inMin + span;

  const total = Math.max(0, span - Math.max(0, breakMinutes));
  const nightRaw = nightMinutesWithin(inMin, outMin, total);
  const overRaw = Math.max(0, total - LEGAL_DAY_MIN);
  const nightOvertime = Math.min(nightRaw, overRaw);
  const night = nightRaw - nightOvertime;
  const overtime = overRaw - nightOvertime;
  const normal = total - overtime - nightOvertime;
  return { total, normal, overtime, night, nightOvertime };
}

/** 支給額（円・端数そのまま）。時給が無ければ null */
export function payYenRaw(split: WorkSplit, hourlyWage: number | null): number | null {
  if (hourlyWage == null || !Number.isFinite(hourlyWage)) return null;
  const weighted =
    split.normal
    + split.overtime * PAY_RATE.overtime
    + split.nightOvertime * PAY_RATE.nightOvertime
    + split.night * PAY_RATE.nightExtra;
  return (hourlyWage * weighted) / 60;
}

export type LedgerDay = {
  clockIn: string | null;       // "HH:mm"
  clockOut: string | null;      // "HH:mm"
  breakMinutes: number | null;  // その日の記録値（null＝未記録）
};

export type LedgerDayResult = {
  split: WorkSplit | null;
  breakUsed: number;
  breakSource: BreakSource;
  breakIsDefault: boolean;
  /** 出勤か退勤の片方だけ */
  missing: boolean;
  /** 1日ぶんの目安（円・四捨五入）。時給なし・打刻もれは null */
  yen: number | null;
};

export function calcLedgerDay(day: LedgerDay, hourlyWage: number | null, staffDefaultBreak: number | null = null): LedgerDayResult {
  const brk = effectiveBreakMinutes(day.breakMinutes, staffDefaultBreak, spanMinutes(day.clockIn, day.clockOut));
  const split = splitWorkMinutes(day.clockIn, day.clockOut, brk.minutes);
  const raw = split ? payYenRaw(split, hourlyWage) : null;
  return {
    split,
    breakUsed: brk.minutes,
    breakSource: brk.source,
    breakIsDefault: brk.isDefault,
    missing: !!day.clockIn !== !!day.clockOut,
    yen: raw == null ? null : Math.round(raw),
  };
}

export type LedgerSummary = WorkSplit & {
  workDays: number;         // 出勤の打刻がある日数（勤怠管理表の「出勤日数」と同じ数え方）
  missingDays: number;      // 打刻もれの日数
  defaultBreakDays: number; // 休憩の記録が無く「いつもの休憩」か法定の最低ラインを使った日数
  /** 月の支給額の目安（円）。1日ごとの端数を足してから最後に四捨五入。時給なしは null */
  yen: number | null;
};

export function summarizeLedger(days: LedgerDay[], hourlyWage: number | null, staffDefaultBreak: number | null = null): LedgerSummary {
  const sum: LedgerSummary = {
    total: 0, normal: 0, overtime: 0, night: 0, nightOvertime: 0,
    workDays: 0, missingDays: 0, defaultBreakDays: 0, yen: null,
  };
  let rawYen = 0;
  for (const d of days) {
    if (d.clockIn) sum.workDays++;
    const r = calcLedgerDay(d, hourlyWage, staffDefaultBreak);
    if (r.missing) sum.missingDays++;
    if (!r.split) continue;
    if (r.breakIsDefault) sum.defaultBreakDays++;
    sum.total += r.split.total;
    sum.normal += r.split.normal;
    sum.overtime += r.split.overtime;
    sum.night += r.split.night;
    sum.nightOvertime += r.split.nightOvertime;
    rawYen += payYenRaw(r.split, hourlyWage) ?? 0;
  }
  sum.yen = hourlyWage == null ? null : Math.round(rawYen);
  return sum;
}
