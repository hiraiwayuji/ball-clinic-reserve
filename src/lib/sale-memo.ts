/**
 * cash_sales.memo の表示用ヘルパー。
 *
 * 【この部品を作った理由】
 * memo には2種類が混在している。
 *   1. スタッフが手で書いたプレーンテキスト（例「右肩」）
 *   2. 明細モードが書き出す JSON（例 {"jippi":[{"name":"保険施術",...}],"buhan":[...]}）
 * 記帳画面の備考欄は AI履歴予測で「過去にいちばん多かった memo」をそのまま入れていたため、
 * 過去が 2. の JSON だと備考欄に `{"jippi":[{"name'` と生データが表示され、
 * そのまま保存すると備考に JSON が残っていた（2026-07-27 指摘）。
 *
 * 人が読む場所（備考欄・一覧）では必ずこの関数を通す。
 */

type MemoItem = { name?: unknown };

/**
 * memo を人が読める文字列にする。
 *   プレーンテキスト → そのまま
 *   JSON → 品目名を「、」でつないだ文字列（例「保険施術、鍼灸1部位」）
 *   JSON だが品目名を取り出せない → 空文字（生JSONは絶対に出さない）
 */
export function memoToDisplayText(memo: string | null | undefined): string {
  const raw = (memo ?? "").trim();
  if (!raw) return "";
  // JSON っぽくなければ手書きの備考なのでそのまま
  if (!raw.startsWith("{") && !raw.startsWith("[")) return raw;

  try {
    const parsed = JSON.parse(raw) as { jippi?: MemoItem[]; buhan?: MemoItem[] };
    const items = [...(parsed?.jippi ?? []), ...(parsed?.buhan ?? [])];
    const names = items
      .map((i) => String(i?.name ?? "").trim())
      .filter((n) => n.length > 0);
    return names.join("、");
  } catch {
    // パースできなかった。明細JSONの壊れかけ（"jippi"/"buhan" を含む）だけ隠し、
    // 「{メモ}」のような手書きは消さずにそのまま見せる
    return /"(jippi|buhan)"/.test(raw) ? "" : raw;
  }
}
