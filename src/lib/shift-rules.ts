// 出勤希望（休み希望）の提出ルール。サーバー・クライアント両方から使う純粋関数。

export type ShiftDayLike = { available: boolean } | undefined | null;

/**
 * 休み希望のうち「同じ曜日を連続週で休む」パターンの曜日ラベルを返す。
 * 例：月曜を2週連続で休み希望 → ["月曜"]。空配列なら問題なし。
 * @param days  { "YYYY-MM-DD": { available: boolean, ... } } 形式
 */
export function findConsecutiveSameWeekdayOffs(
  days: Record<string, ShiftDayLike>,
): string[] {
  const DOW_LABEL = ["日", "月", "火", "水", "木", "金", "土"];
  const byDow = new Map<number, number[]>();
  for (const [dateStr, d] of Object.entries(days ?? {})) {
    if (!d || d.available !== false) continue; // 休み希望（明示）のみ対象
    const ts = Date.parse(`${dateStr}T12:00:00+09:00`);
    if (Number.isNaN(ts)) continue;
    const dow = new Date(`${dateStr}T12:00:00+09:00`).getDay();
    if (!byDow.has(dow)) byDow.set(dow, []);
    byDow.get(dow)!.push(ts);
  }
  const hits: string[] = [];
  for (const [dow, times] of byDow) {
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      // 7日差 = 翌週の同じ曜日（連続）
      if (Math.round((times[i] - times[i - 1]) / 86400000) === 7) {
        hits.push(`${DOW_LABEL[dow]}曜`);
        break;
      }
    }
  }
  return hits;
}
