/**
 * 患者向けメニュー画面を「おすすめ／見出しごと」に分ける。
 *
 * 依存ゼロ（`@/` エイリアスも使わない）。node --test でそのまま読み込めるようにしてある。
 *
 * 決まりごと:
 *  - どのメニューにも見出し（menu_group）もおすすめ（is_recommended）も無い院は
 *    grouped=false を返す。画面は今までどおり見出しなしの一覧を出す（他院の見た目を変えない）。
 *  - 「おすすめ」は先頭。おすすめのメニューは自分の見出しにも**重ねて**出す
 *    （おすすめだけ見て自分の探し物が無いと勘違いさせないため）。
 *  - 見出しの並びは「その見出しに入っている一番上のメニューの並び順」。
 *    院長は今までどおりメニューの並び替えだけで見出しの順番も決められる。
 *  - 見出しの無いメニューは最後に「その他のメニュー」。
 *  - 見出し名は前後の空白を落として比べる（「鍼灸」と「鍼灸 」を別の見出しにしない）。
 */

export const RECOMMENDED_TITLE = "おすすめ";
export const OTHER_TITLE = "その他のメニュー";

export type SectionableCourse = {
  id: string;
  name: string;
  sort_order: number;
  menu_group?: string | null;
  is_recommended?: boolean | null;
};

export type MenuSection<T> = {
  /** 画面のジャンプ先に使う安定したキー */
  key: string;
  title: string;
  courses: T[];
};

export function normalizeGroup(group: string | null | undefined): string | null {
  const g = (group ?? "").trim();
  return g ? g : null;
}

export function buildMenuSections<T extends SectionableCourse>(
  courses: T[],
): { grouped: boolean; sections: MenuSection<T>[] } {
  const anyGrouping = courses.some((c) => normalizeGroup(c.menu_group) || c.is_recommended);
  if (!anyGrouping) {
    return { grouped: false, sections: [{ key: "all", title: "", courses: [...courses] }] };
  }

  // 入力の順番に左右されないよう、並び順（同じなら名前）で並べ直してから分ける
  const ordered = [...courses].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "ja"),
  );

  const sections: MenuSection<T>[] = [];
  const recommended = ordered.filter((c) => c.is_recommended);
  if (recommended.length > 0) {
    sections.push({ key: "recommended", title: RECOMMENDED_TITLE, courses: recommended });
  }

  // 見出しは「最初に出てきた順」＝一番上のメニューの並び順
  const groupOrder: string[] = [];
  const byGroup = new Map<string, T[]>();
  const other: T[] = [];
  for (const c of ordered) {
    const g = normalizeGroup(c.menu_group);
    if (!g) { other.push(c); continue; }
    if (!byGroup.has(g)) { byGroup.set(g, []); groupOrder.push(g); }
    byGroup.get(g)!.push(c);
  }
  groupOrder.forEach((g, i) => {
    sections.push({ key: `group-${i}`, title: g, courses: byGroup.get(g)! });
  });
  if (other.length > 0) {
    sections.push({ key: "other", title: OTHER_TITLE, courses: other });
  }
  return { grouped: true, sections };
}
