/**
 * 日本の祝日を計算する（外部ライブラリ・通信なし）。
 *
 * 予約表・予約サイトで「祝日は平日と違う見た目にする」ために使う（2026-09-21 藤川先生の依頼）。
 * 対象は 2020年以降（現行の祝日法）。それより前の日付は null を返す。
 *
 * 含むもの: 固定の祝日／ハッピーマンデー／春分・秋分（計算式）／振替休日／国民の休日
 */

const pad = (n: number) => String(n).padStart(2, "0");
const ymdOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** y年m月の第n月曜日の「日」 */
function nthMonday(y: number, m: number, n: number): number {
  const firstDow = new Date(y, m - 1, 1).getDay(); // 0=日
  const firstMonday = 1 + ((8 - firstDow) % 7);
  return firstMonday + (n - 1) * 7;
}

/** 春分の日（3月）。1980〜2099年で有効な近似式 */
function shunbun(y: number): number {
  return Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}
/** 秋分の日（9月）。1980〜2099年で有効な近似式 */
function shubun(y: number): number {
  return Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}

/** その年の「本来の祝日」（振替休日・国民の休日を含まない） */
function baseHolidays(y: number): Map<string, string> {
  const h = new Map<string, string>();
  h.set(ymdOf(y, 1, 1), "元日");
  h.set(ymdOf(y, 1, nthMonday(y, 1, 2)), "成人の日");
  h.set(ymdOf(y, 2, 11), "建国記念の日");
  h.set(ymdOf(y, 2, 23), "天皇誕生日");
  h.set(ymdOf(y, 3, shunbun(y)), "春分の日");
  h.set(ymdOf(y, 4, 29), "昭和の日");
  h.set(ymdOf(y, 5, 3), "憲法記念日");
  h.set(ymdOf(y, 5, 4), "みどりの日");
  h.set(ymdOf(y, 5, 5), "こどもの日");
  if (y === 2020) {
    h.set("2020-07-23", "海の日");
    h.set("2020-07-24", "スポーツの日");
    h.set("2020-08-10", "山の日");
  } else if (y === 2021) {
    h.set("2021-07-22", "海の日");
    h.set("2021-07-23", "スポーツの日");
    h.set("2021-08-08", "山の日");
  } else {
    h.set(ymdOf(y, 7, nthMonday(y, 7, 3)), "海の日");
    h.set(ymdOf(y, 8, 11), "山の日");
    h.set(ymdOf(y, 10, nthMonday(y, 10, 2)), "スポーツの日");
  }
  h.set(ymdOf(y, 9, nthMonday(y, 9, 3)), "敬老の日");
  h.set(ymdOf(y, 9, shubun(y)), "秋分の日");
  h.set(ymdOf(y, 11, 3), "文化の日");
  h.set(ymdOf(y, 11, 23), "勤労感謝の日");
  return h;
}

const cache = new Map<number, Map<string, string>>();

function holidaysOfYear(y: number): Map<string, string> {
  const hit = cache.get(y);
  if (hit) return hit;
  const base = baseHolidays(y);
  const all = new Map(base);
  const shift = (ymd: string, days: number) => {
    const [yy, mm, dd] = ymd.split("-").map(Number);
    const d = new Date(yy, mm - 1, dd + days);
    return ymdOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
  };
  // 振替休日: 祝日が日曜なら、その後の最初の「祝日でない日」
  for (const ymd of base.keys()) {
    const [yy, mm, dd] = ymd.split("-").map(Number);
    if (new Date(yy, mm - 1, dd).getDay() !== 0) continue;
    let next = shift(ymd, 1);
    while (base.has(next)) next = shift(next, 1);
    all.set(next, "振替休日");
  }
  // 国民の休日: 前日と翌日が祝日で、その日が祝日でも日曜でもない
  for (const ymd of base.keys()) {
    const mid = shift(ymd, 1);
    const after = shift(ymd, 2);
    if (!base.has(after) || all.has(mid)) continue;
    const [yy, mm, dd] = mid.split("-").map(Number);
    if (new Date(yy, mm - 1, dd).getDay() === 0) continue;
    all.set(mid, "国民の休日");
  }
  cache.set(y, all);
  return all;
}

/** "yyyy-MM-dd" が祝日ならその名前、そうでなければ null */
export function getJpHolidayName(ymd: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const y = Number(m[1]);
  if (y < 2020 || y > 2099) return null;
  return holidaysOfYear(y).get(ymd) ?? null;
}
