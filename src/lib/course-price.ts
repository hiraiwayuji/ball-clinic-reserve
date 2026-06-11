import type { ReservationCourse } from "@/app/actions/courses";

/**
 * 患者向けのメニュー価格表示ラベルを返す。
 * - price_note（自由表記。例: "¥1,700〜2,300"）があればそれを最優先で返す
 *   （保険施術など負担割合で金額が変わるメニューを「幅」で見せるため）。
 * - 無ければ price（初診時は first_visit_price 優先）を "¥1,900" 形式で返す。
 * - どちらも無ければ null（「要相談」表示にフォールバック）。
 *
 * isNote=true のときは「税込」や取り消し線（割引）を付けない（幅表記に割引概念は無いため）。
 */
export function coursePriceLabel(
  course: Pick<ReservationCourse, "price" | "first_visit_price" | "price_note">,
  opts?: { firstVisit?: boolean },
): { text: string | null; isNote: boolean } {
  const note = course.price_note?.trim();
  if (note) return { text: note, isNote: true };

  const p = opts?.firstVisit && course.first_visit_price != null ? course.first_visit_price : course.price;
  if (p == null) return { text: null, isNote: false };
  return { text: `¥${p.toLocaleString()}`, isNote: false };
}

/** 「30分 / ¥1,900」のような短い1行表記（reserve フォーム・カレンダーのバナー用）。 */
export function courseShortPrice(
  course: Pick<ReservationCourse, "price" | "first_visit_price" | "price_note">,
  opts?: { firstVisit?: boolean },
): string {
  const { text } = coursePriceLabel(course, opts);
  return text ?? "";
}
