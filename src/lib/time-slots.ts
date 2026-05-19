// 予約画面・管理画面で表示する時刻スロットの定義。
// 院ごとの slot_duration_minutes (clinic_settings) で 15 / 20 / 30 分を切替可能。
// 営業時間は曜日ごとに固定（平日 12:00-22:30、土曜 10:00-17:30、日水休）。

export const SCHEDULE = {
  weekday: { start: "12:00", end: "22:30" },
  saturday: { start: "10:00", end: "17:30" },
  admin:   { start: "08:00", end: "23:30" },
} as const;

export type SlotMinutes = 15 | 20 | 30;

/** "HH:MM" 形式の時刻配列を、start〜end (inclusive) の範囲で minutes 刻みに生成 */
function generateSlots(start: string, end: string, minutes: number): string[] {
  const slots: string[] = [];
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  for (let t = startMin; t <= endMin; t += minutes) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return slots;
}

/** 管理画面の「予約枠の制限を外す」モードで使う全時間スロット（30分固定） */
export const ADMIN_TIME_SLOTS = generateSlots(
  SCHEDULE.admin.start,
  SCHEDULE.admin.end,
  30,
);

export type GetTimeSlotsOptions = {
  /** 予約枠サイズ（分）。default 30。clinic_settings.slot_duration_minutes から渡す */
  slotMinutes?: SlotMinutes;
  /** 管理画面で営業時間外も含めるか */
  bypassRestrictions?: boolean;
};

/**
 * 指定日に表示する時刻スロット一覧を返す。
 * 後方互換: 第2引数が boolean の場合は bypassRestrictions として扱う（既存呼び出し維持）。
 *
 * 例:
 *   getTimeSlots(date)                              → 30分刻み（既存挙動）
 *   getTimeSlots(date, true)                        → 30分刻み + admin range（既存挙動）
 *   getTimeSlots(date, { slotMinutes: 20 })         → 20分刻み
 *   getTimeSlots(date, { slotMinutes: 15, bypassRestrictions: true })
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
    return generateSlots(SCHEDULE.admin.start, SCHEDULE.admin.end, slotMinutes);
  }
  const day = date.getDay();
  // 日曜・水曜は休診
  if (day === 0 || day === 3) return [];
  const range = day === 6 ? SCHEDULE.saturday : SCHEDULE.weekday;
  return generateSlots(range.start, range.end, slotMinutes);
}

/** 指定日の最大スロット数（営業時間 / slot_duration から動的計算） */
export function getMaxSlots(date: Date, slotMinutes: SlotMinutes = 30): number {
  const day = date.getDay();
  if (day === 0 || day === 3) return 0;
  const range = day === 6 ? SCHEDULE.saturday : SCHEDULE.weekday;
  const [sh, sm] = range.start.split(":").map(Number);
  const [eh, em] = range.end.split(":").map(Number);
  const totalMin = (eh * 60 + em) - (sh * 60 + sm);
  return Math.floor(totalMin / slotMinutes) + 1;
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
