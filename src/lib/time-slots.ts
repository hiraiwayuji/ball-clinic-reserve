// 予約画面・管理画面で表示する時刻スロットの定義。
// 院ごとの slot_duration_minutes (clinic_settings) で 15 / 20 / 30 分を切替可能。
// 営業時間も clinic_settings.business_open_*/close_*/closed_weekdays で院ごとに変更可能。
// DEFAULT_SCHEDULE は未設定時のフォールバック（既存ボール接骨院互換）。

export const DEFAULT_SCHEDULE = {
  weekday: { start: "12:00", end: "22:30" },
  saturday: { start: "10:00", end: "17:30" },
  // admin: 管理画面グリッドの表示範囲。営業時間外の準備時間も含めて広めに。
  // 実際の営業時間（白セル）は schedule の business_open/close 連動。
  admin:   { start: "09:00", end: "23:00" },
} as const;

/** 後方互換 alias（旧コード参照） */
export const SCHEDULE = DEFAULT_SCHEDULE;

export type Schedule = {
  weekday:  { start: string; end: string };
  saturday: { start: string; end: string };
  closedDays: number[]; // JS getDay(): 0=日, 3=水, ...
};

/** clinic_settings からの値を Schedule に正規化。NULL は DEFAULT で補う。 */
export function buildSchedule(settings: {
  business_open_weekday?: string | null;
  business_close_weekday?: string | null;
  business_open_saturday?: string | null;
  business_close_saturday?: string | null;
  closed_weekdays?: string | null;
} | null | undefined): Schedule {
  const s = settings ?? {};
  const closedRaw = s.closed_weekdays ?? "0,3";
  const closedDays = closedRaw
    .split(",")
    .map((v) => parseInt(v.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return {
    weekday: {
      start: s.business_open_weekday  || DEFAULT_SCHEDULE.weekday.start,
      end:   s.business_close_weekday || DEFAULT_SCHEDULE.weekday.end,
    },
    saturday: {
      start: s.business_open_saturday  || DEFAULT_SCHEDULE.saturday.start,
      end:   s.business_close_saturday || DEFAULT_SCHEDULE.saturday.end,
    },
    closedDays: closedDays.length > 0 ? closedDays : [0, 3],
  };
}

export type SlotMinutes = 15 | 20 | 30;

/**
 * "HH:MM" 形式の時刻配列を、start〜end の範囲で minutes 刻みに生成。
 *
 * end は「営業終了時刻」であり、その時刻に予約を開始すると施術が閉店時間を跨いでしまうため、
 * 最終枠は end - minutes（= start + minutes <= end）で打ち切る。
 *
 * 例:
 *   start='12:00', end='23:00', minutes=30 → 12:00, 12:30, ..., 22:30（23:00 は含まない）
 *   start='10:00', end='18:00', minutes=30 → 10:00, ..., 17:30（18:00 は含まない）
 *
 * 2026-05-23 ぼーるくん指摘で end inclusive → exclusive へ変更。
 */
function generateSlots(start: string, end: string, minutes: number): string[] {
  const slots: string[] = [];
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  for (let t = startMin; t + minutes <= endMin; t += minutes) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return slots;
}

/** 管理画面の「予約枠の制限を外す」モードで使う全時間スロット（30分固定・後方互換用） */
export const ADMIN_TIME_SLOTS = generateSlots(
  SCHEDULE.admin.start,
  SCHEDULE.admin.end,
  30,
);

/** 管理画面用の全時間スロット（slot_duration_minutes 連動）。
 * 表示範囲は admin range と schedule の合算（min(starts), max(ends)）。
 * 営業時間外の準備時間も視野に入るよう admin range 09:00-23:00 を最低保証。
 * 白/灰色判定はこの一覧の各時刻に対して isBusinessHour で別途実施する。 */
export function getAdminTimeSlots(slotMinutes: SlotMinutes = 30, schedule?: Schedule): string[] {
  const toMin = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
  const fromMin = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  const adminStartMin = toMin(DEFAULT_SCHEDULE.admin.start);
  const adminEndMin   = toMin(DEFAULT_SCHEDULE.admin.end);
  if (!schedule) {
    return generateSlots(fromMin(adminStartMin), fromMin(adminEndMin), slotMinutes);
  }
  const startMin = Math.min(adminStartMin, toMin(schedule.weekday.start), toMin(schedule.saturday.start));
  const endMin   = Math.max(adminEndMin,   toMin(schedule.weekday.end),   toMin(schedule.saturday.end));
  return generateSlots(fromMin(startMin), fromMin(endMin), slotMinutes);
}

/** ある時刻文字列 (HH:MM) が指定日の営業時間内かを判定。
 * グリッドの白/灰色判定に使う。closedDays/clinic_holidays 判定は呼び出し側で。 */
export function isWithinBusinessHours(date: Date, timeSlot: string, schedule: Schedule): boolean {
  const day = date.getDay();
  if (schedule.closedDays.includes(day)) return false;
  const range = day === 6 ? schedule.saturday : schedule.weekday;
  const toMin = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
  const slotMin = toMin(timeSlot);
  return slotMin >= toMin(range.start) && slotMin <= toMin(range.end);
}

export type GetTimeSlotsOptions = {
  /** 予約枠サイズ（分）。default 30。clinic_settings.slot_duration_minutes から渡す */
  slotMinutes?: SlotMinutes;
  /** 管理画面で営業時間外も含めるか */
  bypassRestrictions?: boolean;
  /** 院ごとの営業時間。未指定なら DEFAULT_SCHEDULE */
  schedule?: Schedule;
};

/**
 * 指定日に表示する時刻スロット一覧を返す。
 * 後方互換: 第2引数が boolean の場合は bypassRestrictions として扱う（既存呼び出し維持）。
 *
 * 例:
 *   getTimeSlots(date)                              → 30分刻み（既存挙動）
 *   getTimeSlots(date, true)                        → 30分刻み + admin range（既存挙動）
 *   getTimeSlots(date, { slotMinutes: 20 })         → 20分刻み
 *   getTimeSlots(date, { slotMinutes: 20, schedule }) → 院ごとの営業時間で 20分刻み
 */
export function getTimeSlots(
  date: Date | undefined,
  optionsOrBypass: GetTimeSlotsOptions | boolean = {},
): string[] {
  const opts: GetTimeSlotsOptions =
    typeof optionsOrBypass === "boolean"
      ? { bypassRestrictions: optionsOrBypass }
      : optionsOrBypass;
  const slotMinutes: SlotMinutes = opts.slotMinutes ?? 30;
  const bypassRestrictions = opts.bypassRestrictions ?? false;

  if (!date) return [];
  if (bypassRestrictions) {
    return generateSlots(DEFAULT_SCHEDULE.admin.start, DEFAULT_SCHEDULE.admin.end, slotMinutes);
  }
  const sched = opts.schedule ?? buildSchedule(null);
  const day = date.getDay();
  if (sched.closedDays.includes(day)) return [];
  const range = day === 6 ? sched.saturday : sched.weekday;
  return generateSlots(range.start, range.end, slotMinutes);
}

/**
 * 指定日の最大スロット数（営業時間 / slot_duration から動的計算）。
 * end は exclusive（end 時刻自体は予約候補に含めない）なので +1 不要。
 * 2026-05-23 generateSlots と整合させるため修正。
 */
export function getMaxSlots(date: Date, slotMinutes: SlotMinutes = 30, schedule?: Schedule): number {
  const sched = schedule ?? buildSchedule(null);
  const day = date.getDay();
  if (sched.closedDays.includes(day)) return 0;
  const range = day === 6 ? sched.saturday : sched.weekday;
  const [sh, sm] = range.start.split(":").map(Number);
  const [eh, em] = range.end.split(":").map(Number);
  const totalMin = (eh * 60 + em) - (sh * 60 + sm);
  return Math.floor(totalMin / slotMinutes);
}

export function isDateWithinAllowedRange(date: Date, isAdmin: boolean = false): boolean {
  if (isAdmin) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + 30);
  return date >= today && date <= limit;
}

export function isTimeSlotWithinTwoHours(dateStrOrDate: Date | string, timeStr: string, isAdmin: boolean = false): boolean {
  if (isAdmin) return false;
  let dateStr = "";
  if (typeof dateStrOrDate === "string") {
    dateStr = dateStrOrDate;
  } else {
    const year = dateStrOrDate.getFullYear();
    const month = String(dateStrOrDate.getMonth() + 1).padStart(2, "0");
    const day = String(dateStrOrDate.getDate()).padStart(2, "0");
    dateStr = `${year}-${month}-${day}`;
  }
  const slotTimestamp = new Date(`${dateStr}T${timeStr}:00+09:00`).getTime();
  const cutoffTimestamp = Date.now() + 2 * 60 * 60 * 1000;
  return slotTimestamp < cutoffTimestamp;
}
