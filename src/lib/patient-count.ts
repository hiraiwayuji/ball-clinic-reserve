/**
 * 「人数」の数え方をここに一本化する。
 *
 * この院のデータは、同じ患者さんが同じ日に複数の行を持つのが普通にある。
 *  - 予約: 保険施術 → 鍼灸 を担当を分けて連続で受ける（＝appointments が2件）
 *  - 売上: 日計表は列ごとに1行（保険列・鍼灸列・物販列 で最大3行）
 *
 * そのため「行数＝人数」で数えると来院数・新患数・リピート率が水増しになる。
 * 人数を出すときは必ずこのファイルの関数を通すこと。
 */

/**
 * 同一人物の判定キー。
 * 「布川紗帆」と「布川　紗帆」のような空白ゆれ（半角・全角）を同じ人として扱う。
 * 「松浦拓登(タクト)」のような、かっこ書きのふりがなも外して比べる。
 * cash_sales は customer_id を持たず名前の文字列で患者を表すので、ここが要になる。
 */
export function nameKey(name: string | null | undefined): string {
  const base = (name ?? "").normalize("NFKC");
  // かっこ書きしか名前が無い人（「(アモウミ)」等）は、落とすと空になるので元のまま使う
  const withoutReading = base.replace(/[（(][^）)]*[）)]/g, "");
  const picked = withoutReading.replace(/[\s　]/g, "") ? withoutReading : base;
  return picked.replace(/[\s　]/g, "");
}

/** yyyy-MM-dd を取り出す（ISO文字列でも sale_date でも可） */
export function dateKey(value: string | null | undefined): string {
  return (value ?? "").slice(0, 10);
}

/** 患者×日 のキー。「その日その人が来た」を1と数えるための単位 */
export function visitKey(name: string | null | undefined, date: string | null | undefined): string {
  return `${dateKey(date)}__${nameKey(name)}`;
}

type NamedDatedRow = {
  customer_name?: string | null;
  sale_date?: string | null;
  is_first_visit?: boolean | null;
};

/**
 * cash_sales の行から「のべ来院数（患者×日）」を数える。
 * 日計表で1人が3行になっていても1と数える。
 */
export function countVisits(rows: NamedDatedRow[]): number {
  const seen = new Set<string>();
  for (const r of rows) {
    const k = visitKey(r.customer_name, r.sale_date);
    if (k === "__") continue;
    seen.add(k);
  }
  return seen.size;
}

/** cash_sales の行から「実人数（期間内のユニーク患者数）」を数える */
export function countUniquePatients(rows: NamedDatedRow[]): number {
  const seen = new Set<string>();
  for (const r of rows) {
    const k = nameKey(r.customer_name);
    if (!k) continue;
    seen.add(k);
  }
  return seen.size;
}

/**
 * 新患・再来の来院数を患者×日で数える。
 * その日のどれか1行に初診フラグが立っていれば、その来院は新患1件。
 */
export function countNewAndReturnVisits(rows: NamedDatedRow[]): { newVisits: number; returnVisits: number; total: number } {
  const isNewByVisit = new Map<string, boolean>();
  for (const r of rows) {
    const k = visitKey(r.customer_name, r.sale_date);
    if (k === "__") continue;
    isNewByVisit.set(k, (isNewByVisit.get(k) ?? false) || !!r.is_first_visit);
  }
  let newVisits = 0;
  for (const v of isNewByVisit.values()) if (v) newVisits += 1;
  return { newVisits, returnVisits: isNewByVisit.size - newVisits, total: isNewByVisit.size };
}

/**
 * 日ごとの来院数・新患数（患者×日でユニーク化済み）。
 * 経営評価の日別テーブル・グラフはこれを使う。
 */
export function visitsByDate(rows: NamedDatedRow[]): Record<string, { total: number; first: number }> {
  const namesByDate = new Map<string, Map<string, boolean>>();
  for (const r of rows) {
    const d = dateKey(r.sale_date);
    const n = nameKey(r.customer_name);
    if (!d || !n) continue;
    let m = namesByDate.get(d);
    if (!m) { m = new Map(); namesByDate.set(d, m); }
    m.set(n, (m.get(n) ?? false) || !!r.is_first_visit);
  }
  const out: Record<string, { total: number; first: number }> = {};
  for (const [d, m] of namesByDate) {
    let first = 0;
    for (const isNew of m.values()) if (isNew) first += 1;
    out[d] = { total: m.size, first };
  }
  return out;
}

/**
 * 予約から「来院した日数」を数える。
 * 同じ日に複数メニューを受けても1日は1回。リピート判定はこれを使う。
 */
export function countVisitDays(startTimes: (string | null | undefined)[]): number {
  const days = new Set<string>();
  for (const t of startTimes) {
    const d = dateKey(t);
    if (d) days.add(d);
  }
  return days.size;
}
