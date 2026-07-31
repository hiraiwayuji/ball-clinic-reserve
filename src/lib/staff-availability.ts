// 出勤日ベースのスタッフ（さみ整体など）の「その日予約できるか」を判定する共通ロジック。
// 患者予約フォーム（クライアント）と createReservation（サーバー）の両方から使い、判定を一致させる。

export type StaffScheduleDate = {
  date: string;
  available: boolean;
  /** その日だけの出勤開始時刻 "HH:MM"（NULL=既定の出勤時間に従う） */
  start?: string | null;
  /** その日だけの出勤終了時刻 "HH:MM"（NULL=既定の出勤時間に従う） */
  end?: string | null;
};

export type StaffSchedule = {
  /** 毎週の出勤曜日（0=日..6=土） */
  weekdays: number[];
  /** 個別の出勤日／例外休（available=true 出勤追加 / false 例外休）。任意で時間帯の上書き付き */
  dates: StaffScheduleDate[];
  /** 既定の出勤開始時刻 "HH:MM"（全出勤日に適用。NULL=院の営業時間どおり） */
  defaultStart?: string | null;
  /** 既定の出勤終了時刻 "HH:MM"（全出勤日に適用。NULL=院の営業時間どおり） */
  defaultEnd?: string | null;
  /** 毎日の休憩開始 "HH:MM"（NULL=休憩なし）。この間は予約を受け付けない */
  breakStart?: string | null;
  /** 毎日の休憩終了 "HH:MM"（NULL=休憩なし） */
  breakEnd?: string | null;
  /**
   * 出勤曜日で予約可否を絞るか。
   * true（既定・schedule_based_booking のスタッフ）= 出勤日以外は予約不可。
   * false = 曜日は院の休診日どおり（毎日いる常勤）。受付時間・休憩だけ効かせたいときに使う。
   */
  restrictDays?: boolean;
  /**
   * 勤務表（staff_working_hours）から作った曜日ごとの受付時間・休憩。
   * 0=日..6=土 をキーに、その曜日の勤務がある日だけ入る。
   * 勤務表に行が無い曜日は入らない＝院の営業時間どおり（従来挙動を壊さないため）。
   * defaultStart/defaultEnd（手入力の受付時間）があればそちらが優先。
   */
  weekly?: Record<number, { start: string; end: string; breakStart: string | null; breakEnd: string | null }>;
};

/** staff_working_hours の1行 */
export type StaffWeeklyHoursRow = {
  day_of_week: number | string;
  start_time?: string | null;
  end_time?: string | null;
  break_start?: string | null;
  break_end?: string | null;
};

function toMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/** "HH:MM:SS" / "HH:MM" / null → "HH:MM" / null */
function hhmm(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

/** reservation_staff の1行（スケジュール関連カラムだけ） */
export type StaffScheduleRow = {
  schedule_based_booking?: boolean | null;
  booking_weekdays?: string | null;
  booking_start_time?: string | null;
  booking_end_time?: string | null;
  booking_break_start?: string | null;
  booking_break_end?: string | null;
};

/**
 * reservation_staff の行から StaffSchedule を組み立てる共通ビルダー。
 *
 * 「出勤日だけ予約を受け付ける（schedule_based_booking）」と
 * 「受付時間・休憩（booking_start_time / booking_end_time / booking_break_*）」は別物。
 * 毎日いる常勤スタッフでも、受付時間や休憩だけ効かせたいことがあるため、
 * どちらか一方だけでもスケジュールを返す。
 *
 * どの設定も無い（＝院の営業時間どおり・制限なし）スタッフには null を返す。
 * 呼び出し側は null をそのまま「制限なし」として扱ってよい。
 */
export function buildStaffSchedule(
  row: StaffScheduleRow | null | undefined,
  dates: StaffScheduleDate[] = [],
  weeklyRows: StaffWeeklyHoursRow[] = [],
  prepMinutes: number = 0,
): StaffSchedule | null {
  if (!row) return null;
  const restrictDays = !!row.schedule_based_booking;
  const defaultStart = hhmm(row.booking_start_time);
  const defaultEnd = hhmm(row.booking_end_time);
  const breakStart = hhmm(row.booking_break_start);
  const breakEnd = hhmm(row.booking_break_end);
  const hasHours = !!(defaultStart && defaultEnd);
  const hasBreak = !!(breakStart && breakEnd);
  const weekly = buildWeeklyFromWorkingHours(weeklyRows, prepMinutes);
  const hasWeekly = Object.keys(weekly).length > 0;
  if (!restrictDays && !hasHours && !hasBreak && !hasWeekly) return null;
  return {
    weekdays: String(row.booking_weekdays ?? "")
      .split(",").map((s) => s.trim()).filter(Boolean).map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
    dates,
    defaultStart: hasHours ? defaultStart : null,
    defaultEnd: hasHours ? defaultEnd : null,
    breakStart: hasBreak ? breakStart : null,
    breakEnd: hasBreak ? breakEnd : null,
    restrictDays,
    weekly: hasWeekly ? weekly : undefined,
  };
}

function minToHHMM(n: number): string {
  const c = Math.max(0, Math.min(24 * 60, n));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
}

/**
 * 勤務表（staff_working_hours）→ 曜日ごとの「受付できる時間帯」。
 *
 * 勤務時間の前後 prepMinutes 分は準備・片付け・事務にあてるため受付から外す
 * （からだ鍼灸整骨院: 勤務 9:30〜20:30 → 受付 10:00〜20:00）。
 * 休憩はそのまま引き継ぐ。
 * 前後を削って時間が無くなる短い勤務は、削らずそのまま使う（枠が消えるほうが事故）。
 */
function buildWeeklyFromWorkingHours(
  rows: StaffWeeklyHoursRow[],
  prepMinutes: number,
): Record<number, { start: string; end: string; breakStart: string | null; breakEnd: string | null }> {
  const out: Record<number, { start: string; end: string; breakStart: string | null; breakEnd: string | null }> = {};
  const prep = Number.isFinite(prepMinutes) && prepMinutes > 0 ? Math.floor(prepMinutes) : 0;
  for (const r of rows ?? []) {
    const dow = Number(r.day_of_week);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) continue;
    const s = hhmm(r.start_time);
    const e = hhmm(r.end_time);
    if (!s || !e) continue;
    let startMin = toMin(s) + prep;
    let endMin = toMin(e) - prep;
    if (endMin <= startMin) { startMin = toMin(s); endMin = toMin(e); }
    if (endMin <= startMin) continue;
    out[dow] = {
      start: minToHHMM(startMin),
      end: minToHHMM(endMin),
      breakStart: hhmm(r.break_start),
      breakEnd: hhmm(r.break_end),
    };
  }
  return out;
}

/** "yyyy-MM-dd" → 曜日(0=日..6=土)。不正なら null。 */
function weekdayOfYmd(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay();
}

/** "yyyy-MM-dd"（ローカル日付）を返す。タイムゾーンずれを避けるため getFullYear 等で組み立てる。 */
export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * そのスタッフが date に出勤（＝予約可）か。
 * 個別日(dates)の設定があればそれを最優先（例外休=false で休める）。
 * 無ければ曜日ルール(weekdays)で判定。
 */
export function isStaffAvailableOn(date: Date, schedule: StaffSchedule): boolean {
  const ymd = toYmd(date);
  const override = schedule.dates.find((o) => o.date === ymd);
  if (override) return override.available;
  // 受付時間・休憩だけ設定した常勤スタッフは曜日で絞らない（院の休診日は呼び出し側が判定済み）
  if (schedule.restrictDays === false) return true;
  return schedule.weekdays.includes(date.getDay());
}

/** "yyyy-MM-dd" 文字列で判定（サーバー側で Date を作らず安全に比較したい時用） */
export function isStaffAvailableOnYmd(ymd: string, schedule: StaffSchedule): boolean {
  const override = schedule.dates.find((o) => o.date === ymd);
  if (override) return override.available;
  if (schedule.restrictDays === false) return true;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return false;
  const wd = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay();
  return schedule.weekdays.includes(wd);
}

/**
 * その日にそのスタッフが「何時から何時まで」出勤しているか（出勤時間）を返す。
 * 個別日に時間の上書き(start/end)があればそれを最優先、無ければ既定の出勤時間。
 * どちらも未設定なら null（＝院の営業時間どおりで制限なし）。
 * 注: この関数は「その日に出勤しているか」は見ない（呼び出し側で isStaffAvailableOn を先に判定する想定）。
 */
export function getStaffHoursForDate(
  date: Date,
  schedule: StaffSchedule,
): { start: string; end: string } | null {
  return getStaffHoursForYmd(toYmd(date), schedule);
}

/**
 * "yyyy-MM-dd" 文字列で出勤時間を返す（サーバー側用）。
 * 優先順位: ①個別日の上書き → ②手入力の受付時間 → ③勤務表から作った曜日別 → ④なし（院の営業時間どおり）
 */
export function getStaffHoursForYmd(
  ymd: string,
  schedule: StaffSchedule,
): { start: string; end: string } | null {
  const override = schedule.dates.find((o) => o.date === ymd);
  if (override && override.available && override.start && override.end) {
    return { start: override.start, end: override.end };
  }
  if (schedule.defaultStart && schedule.defaultEnd) {
    return { start: schedule.defaultStart, end: schedule.defaultEnd };
  }
  const wd = weekdayOfYmd(ymd);
  const w = wd === null ? undefined : schedule.weekly?.[wd];
  if (w) return { start: w.start, end: w.end };
  return null;
}

/** その日の休憩（手入力があればそれ、無ければ勤務表の曜日別）。無ければ null。 */
function getStaffBreakForYmd(
  ymd: string,
  schedule: StaffSchedule,
): { start: string; end: string } | null {
  if (schedule.breakStart && schedule.breakEnd) {
    return { start: schedule.breakStart, end: schedule.breakEnd };
  }
  const wd = weekdayOfYmd(ymd);
  const w = wd === null ? undefined : schedule.weekly?.[wd];
  if (w?.breakStart && w?.breakEnd) return { start: w.breakStart, end: w.breakEnd };
  return null;
}

/** その時刻がスタッフの休憩中（breakStart <= t < breakEnd）か。休憩未設定なら常に false。 */
function isDuringStaffBreak(ymd: string, time: string, schedule: StaffSchedule): boolean {
  const b = getStaffBreakForYmd(ymd, schedule);
  if (!b) return false;
  const t = toMin(time);
  return t >= toMin(b.start) && t < toMin(b.end);
}

/**
 * 時刻スロット一覧（"HH:MM"）を、そのスタッフの出勤時間内だけに絞り込む。
 * 出勤時間が未設定（null）の日はそのまま全スロットを返す（院の営業時間どおり）。
 * 院の営業終了が exclusive なのに合わせ、開始 < 出勤終了 で判定（例: 終了18:00なら最終17:30）。
 * 休憩（breakStart〜breakEnd）が設定されていれば、その間の枠は落とす。
 * 休憩をまたぐ長さのコースは、呼び出し側の「連続枠が確保できるか」判定で自動的に弾かれる。
 */
export function filterSlotsByStaffSchedule(
  slots: string[],
  date: Date,
  schedule: StaffSchedule | null | undefined,
): string[] {
  if (!schedule) return slots;
  const ymd = toYmd(date);
  const hours = getStaffHoursForYmd(ymd, schedule);
  const startMin = hours ? toMin(hours.start) : null;
  const endMin = hours ? toMin(hours.end) : null;
  return slots.filter((s) => {
    if (isDuringStaffBreak(ymd, s, schedule)) return false;
    if (startMin === null || endMin === null) return true;
    const t = toMin(s);
    return t >= startMin && t < endMin;
  });
}

/** ある時刻 "HH:MM" がそのスタッフの出勤時間内か（サーバー検証用）。出勤時間未設定なら常に true。 */
export function isTimeWithinStaffHoursYmd(
  ymd: string,
  time: string,
  schedule: StaffSchedule,
): boolean {
  if (isDuringStaffBreak(ymd, time, schedule)) return false;
  const hours = getStaffHoursForYmd(ymd, schedule);
  if (!hours) return true;
  const t = toMin(time);
  return t >= toMin(hours.start) && t < toMin(hours.end);
}

/**
 * 施術の「開始〜終了まで丸ごと」がそのスタッフの受付時間内で、休憩をまたがないか。
 *
 * 開始時刻だけ見ていると、休憩直前の枠から始まる長いメニュー
 * （例: 休憩12:00〜14:00 で 11:20 開始の60分）が通ってしまうため、
 * 予約を確定する前に必ずこちらで検証する。
 */
export function isStaffSpanBookableYmd(
  ymd: string,
  startTime: string,
  durationMinutes: number,
  schedule: StaffSchedule,
): boolean {
  const start = toMin(startTime);
  const end = start + Math.max(1, durationMinutes);
  const hours = getStaffHoursForYmd(ymd, schedule);
  if (hours && (start < toMin(hours.start) || end > toMin(hours.end))) return false;
  const b = getStaffBreakForYmd(ymd, schedule);
  if (b) {
    const bs = toMin(b.start);
    const be = toMin(b.end);
    // 施術時間と休憩が少しでも重なったら不可
    if (start < be && end > bs) return false;
  }
  return true;
}
