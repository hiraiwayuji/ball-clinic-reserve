/**
 * 先生1人だけの予約NG（clinic_blocked_slots.staff_id あり）を、
 * 担当自由メニューの「同時受付人数（定員）」に反映するための共通ロジック。
 *
 * 🚨 背景（2026-09-21 からだ鍼灸整骨院 9/22）:
 *   受付が森藤先生を終日「対応不可」にしても、担当自由のメニュー（保険施術など）の
 *   定員は2人のままだった。その結果、森川先生に予約が入っている時間も患者さんには
 *   「◯空き」に見え、予約すると担当未設定の仮予約が入ってしまう穴があった。
 *
 * 考え方: その時間の実質の定員 = その日の定員 − 「NGだけで塞がっている先生」の人数
 *   ・NGの先生がその時間に自分の予約も持っている場合は、予約数の側ですでに
 *     1人ぶん数えているので、二重に引かない。
 *   ・定員に数えていない先生（ネット受付しない先生）のNGは引かない。
 *
 * 画面（getDailyAvailability）とサーバーの最終ガード（createReservation）の両方で
 * 必ずこの関数を使う。片方だけ直すと「選べるのに登録できない」が再発する。
 */

export type StaffNgBlock = {
  staff_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

/** "HH:MM" / "HH:MM:SS" → 0時からの分。読めなければ null */
export function hmToMin(hm?: string | null): number | null {
  if (!hm) return null;
  const [h, m] = hm.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/**
 * [startMin, endMin) に NG がかかっていて、かつその時間に自分の予約を持っていない
 * 「定員に数えている先生」の人数。
 */
export function countNgOnlyStaff(
  blocks: StaffNgBlock[],
  poolStaffIds: ReadonlySet<string>,
  startMin: number,
  endMin: number,
  busyStaffIds: ReadonlySet<string>,
): number {
  const ng = new Set<string>();
  for (const b of blocks) {
    if (!b.staff_id) continue; // 院ぜんたいの休憩は別で塞いでいる
    if (!poolStaffIds.has(b.staff_id)) continue;
    if (busyStaffIds.has(b.staff_id)) continue;
    const bs = hmToMin(b.start_time);
    const be = hmToMin(b.end_time);
    if (bs === null || be === null) continue;
    if (startMin < be && endMin > bs) ng.add(b.staff_id); // 半開区間で重なり判定
  }
  return ng.size;
}

/**
 * 担当自由メニューの枠が「もう取れない」かどうか。画面とサーバーの最終ガードで同じ式を使う。
 *
 *   ① 全予約数 >= 定員                         … これまでどおりの判定（NGの無い日はこれだけ）
 *   ② NGで減らした定員 <= 定員に数えた先生の予約数 … NGがあるときだけ足す判定
 *
 * 🚨 ②の予約数に「定員に数えていない先生（ネット受付しない藤川院長など）の予約」を入れない。
 *   入れると、院長の予約1件＋森川先生NG で、森藤先生が空いているのに「予約済」になる
 *   （2026-09-21 検品で 9/21 15:20 の実データで再現）。
 *   担当未設定の実予約は、どの先生が受けるか決まっていないので②に数える（安全側）。
 */
export function isPoolFull(p: {
  /** その時間に重なる全予約数（従来の数え方） */
  totalCount: number;
  /** そのうち、定員に数えた先生の予約＋担当未設定の実予約 */
  poolCount: number;
  capacity: number;
  /** countNgOnlyStaff の結果 */
  ngOnly: number;
}): boolean {
  if (p.totalCount >= p.capacity) return true;
  if (p.ngOnly > 0 && p.poolCount >= Math.max(0, p.capacity - p.ngOnly)) return true;
  return false;
}

/** ②に数える予約か（定員に数えた先生の予約、または担当未設定の実予約） */
export function countsTowardPool(
  app: { staff_id?: string | null; status?: string | null },
  poolStaffIds: ReadonlySet<string>,
): boolean {
  if (app.staff_id) return poolStaffIds.has(app.staff_id);
  return app.status !== "waiting"; // キャンセル待ちは枠を持たない
}
