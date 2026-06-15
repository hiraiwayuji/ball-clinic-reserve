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
};

function toMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
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
  return schedule.weekdays.includes(date.getDay());
}

/** "yyyy-MM-dd" 文字列で判定（サーバー側で Date を作らず安全に比較したい時用） */
export function isStaffAvailableOnYmd(ymd: string, schedule: StaffSchedule): boolean {
  const override = schedule.dates.find((o) => o.date === ymd);
  if (override) return override.available;
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

/** "yyyy-MM-dd" 文字列で出勤時間を返す（サーバー側用）。 */
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
  return null;
}

/**
 * 時刻スロット一覧（"HH:MM"）を、そのスタッフの出勤時間内だけに絞り込む。
 * 出勤時間が未設定（null）の日はそのまま全スロットを返す（院の営業時間どおり）。
 * 院の営業終了が exclusive なのに合わせ、開始 < 出勤終了 で判定（例: 終了18:00なら最終17:30）。
 */
export function filterSlotsByStaffSchedule(
  slots: string[],
  date: Date,
  schedule: StaffSchedule | null | undefined,
): string[] {
  if (!schedule) return slots;
  const hours = getStaffHoursForDate(date, schedule);
  if (!hours) return slots;
  const startMin = toMin(hours.start);
  const endMin = toMin(hours.end);
  return slots.filter((s) => {
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
  const hours = getStaffHoursForYmd(ymd, schedule);
  if (!hours) return true;
  const t = toMin(time);
  return t >= toMin(hours.start) && t < toMin(hours.end);
}
