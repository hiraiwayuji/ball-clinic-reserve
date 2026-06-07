// 出勤日ベースのスタッフ（さみ整体など）の「その日予約できるか」を判定する共通ロジック。
// 患者予約フォーム（クライアント）と createReservation（サーバー）の両方から使い、判定を一致させる。

export type StaffSchedule = {
  /** 毎週の出勤曜日（0=日..6=土） */
  weekdays: number[];
  /** 個別の出勤日／例外休（available=true 出勤追加 / false 例外休） */
  dates: { date: string; available: boolean }[];
};

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
