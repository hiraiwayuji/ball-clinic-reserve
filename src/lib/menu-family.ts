/**
 * メニュー名を「種類」にまとめる（タイムテーブルの月間件数の内訳用）。
 *
 * 依存ゼロ（`@/` エイリアスも使わない）。node --test でそのまま読み込めるようにしてある。
 *
 * メニューは「パーソナルトレーニング 20分／40分／60分」「保険施術（初診）／（再診）」のように
 * 時間や回数ちがいで何行にも分かれている。院長が知りたいのは
 * 「鍼灸が何件・保険施術が何件・トレーニングが何件」なので、
 * 括弧の中と、最初の空白より後ろを落として種類名にする。
 *
 *   保険施術（初診）                         → 保険施術
 *   鍼灸 2部位                               → 鍼灸
 *   整体 半身（上 or 下）                    → 整体
 *   パーソナルトレーニング 40分              → パーソナルトレーニング
 *   院長トータルリメイク 初回80分（カウンセリング込） → 院長トータルリメイク
 */

export const NO_MENU_LABEL = "メニュー未設定";

export function menuFamily(courseName: string | null | undefined): string {
  if (!courseName) return NO_MENU_LABEL;
  const withoutParens = courseName
    .replace(/（[^）]*）/g, " ")
    .replace(/\([^)]*\)/g, " ");
  const first = withoutParens.trim().split(/[\s　]+/)[0] ?? "";
  return first || NO_MENU_LABEL;
}

/** 内訳を件数の多い順に並べる（同数は名前順で並びを安定させる）。 */
export function sortBreakdown(counts: Record<string, number>): { label: string; count: number }[] {
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ja"));
}

// ───────────────────── 月間件数の集計（タイムテーブルの先生ごとのバッジ） ─────────────────────

/** 担当が未設定の予約をまとめるキー（timeline.ts・TodayTimelineWidget と同じ値） */
export const UNASSIGNED_STAFF_KEY = "__unassigned__";

export type MonthAptRow = {
  start_time: string;
  staff_id: string | null;
  course_id?: string | null;
  course_name: string | null;
  additional_staff?: unknown;
  additional_courses?: unknown;
};

/**
 * 月ごと・先生ごとの「予約件数」と「メニュー別の内訳」を数える。
 *
 * 予約件数（counts）… 先生の横のバッジの数字。変更前のタイムテーブルと同じ数え方:
 *  - 1件の予約は、主担当と追加担当の**それぞれに1件**。同じ先生が重複して入っていても1件。
 *  - 担当未設定は UNASSIGNED_STAFF_KEY に数える。
 *
 * メニュー別の内訳（breakdown）… ダッシュボードの「スタッフ別 月間目標達成率（カテゴリ別）」
 * （analytics.ts の getStaffCategoryProgress）と**同じ数え方**:
 *  - 予約に入っているメニュー（主メニュー＋追加メニュー。同じメニューIDは1つ）を、
 *    その予約の担当**全員**に1件ずつ数える（スプレッドシートのメニュー数換算と同じ）。
 *  - メニューが1つも無い予約は「メニュー未設定」で1件。
 * そのため、内訳の合計は予約件数**以上**になる（1回で保険施術＋鍼灸なら内訳は2件）。
 * 担当未設定の予約は、表と違い UNASSIGNED_STAFF_KEY の内訳として数える
 * （画面側で件数と同じく先頭の先生に合算する）。
 */
export function aggregateStaffMonth(
  rows: MonthAptRow[],
  monthKeyOf: (startIso: string) => string,
): {
  counts: Record<string, Record<string, number>>;
  breakdown: Record<string, Record<string, Record<string, number>>>;
} {
  const counts: Record<string, Record<string, number>> = {};
  const breakdown: Record<string, Record<string, Record<string, number>>> = {};
  for (const row of rows) {
    const monthKey = monthKeyOf(row.start_time);
    const bucket = (counts[monthKey] ??= {});
    const bdBucket = (breakdown[monthKey] ??= {});

    // 担当（重複なし）
    const staffKeys = new Set<string>([row.staff_id ?? UNASSIGNED_STAFF_KEY]);
    const addStaff = Array.isArray(row.additional_staff) ? (row.additional_staff as ({ staff_id?: string } | null)[]) : [];
    for (const st of addStaff) {
      if (st?.staff_id) staffKeys.add(st.staff_id);
    }

    // メニュー（主＋追加、同じメニューIDは1つ。IDが無ければ名前で見分ける）
    const menus = new Map<string, string | null>();
    if (row.course_id || row.course_name) {
      menus.set(row.course_id ? `id:${row.course_id}` : `name:${row.course_name}`, row.course_name ?? null);
    }
    const addCourses = Array.isArray(row.additional_courses)
      ? (row.additional_courses as ({ course_id?: string; course_name?: string } | null)[])
      : [];
    for (const ac of addCourses) {
      if (!ac || (!ac.course_id && !ac.course_name)) continue;
      const key = ac.course_id ? `id:${ac.course_id}` : `name:${ac.course_name}`;
      if (!menus.has(key)) menus.set(key, ac.course_name ?? null);
    }
    const families = menus.size > 0 ? [...menus.values()].map((n) => menuFamily(n)) : [NO_MENU_LABEL];

    for (const key of staffKeys) {
      bucket[key] = (bucket[key] ?? 0) + 1;
      const perStaff = (bdBucket[key] ??= {});
      for (const family of families) {
        perStaff[family] = (perStaff[family] ?? 0) + 1;
      }
    }
  }
  return { counts, breakdown };
}
