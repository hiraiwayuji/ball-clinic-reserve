/**
 * 通帳読み取り（/admin/passbook）の型と共通処理
 * "use server" ファイルからは値を export できないため、定数・型はここに置く
 */

export type PassbookKind = "insurance" | "expense" | "income" | "ignore";

/** 通帳の明細1行 */
export type PassbookRow = {
  entry_date: string; // yyyy-MM-dd
  description: string;
  deposit: number; // お預入
  withdrawal: number; // お引出
  balance: number | null; // 差引残高
};

/** OCRが返す1行（Rowに仕分けの提案が付いたもの） */
export type PassbookOcrRow = PassbookRow & {
  kind: PassbookKind;
  category: string;
  note: string;
};

export const PASSBOOK_KIND_LABELS: Record<PassbookKind, string> = {
  insurance: "保険入金",
  expense: "経費",
  income: "その他収入",
  ignore: "対象外",
};

/**
 * 摘要のゆらぎを吸収する。
 * NFKC で半角カナ→全角カナ・全角英数→半角英数に寄せ、空白を全部落とす。
 * 同じ通帳を撮り直したときに別行と判定されないようにするためのもの。
 */
export function normalizePassbookDescription(desc: string): string {
  return (desc || "").normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}

/**
 * 二重取り込み防止キー。
 * 日付・摘要・金額・残高が全部同じ行は「同じ取引」とみなす。
 * 残高まで含めるのは、同日に同額の引き落としが2件並ぶケースを別行として残すため。
 */
export function passbookDedupeKey(row: PassbookRow): string {
  return [
    row.entry_date,
    normalizePassbookDescription(row.description),
    row.deposit,
    row.withdrawal,
    row.balance ?? "",
  ].join("|");
}

/** 保険の入金っぽい摘要か（AIの判定が外れたときの保険としてUIのヒントに使う） */
const INSURANCE_KEYWORDS = [
  "コクホレン", "国保連", "国民健康保険", "コクホ",
  "シハライキキン", "支払基金", "社会保険診療報酬", "シンリョウホウシュウ",
  "シャホ", "社保",
  "キョウカイケンポ", "協会けんぽ", "ケンポ",
  "コウキコウレイ", "後期高齢", "コウキ",
  "ロウサイ", "労災", "労働局", "ロウドウキヨク",
  "ジバイセキ", "自賠責",
  "キョウサイ", "共済",
  "リョウヨウヒ", "療養費", "セイキュウ",
];

export function looksLikeInsuranceDeposit(row: PassbookRow): boolean {
  if (row.deposit <= 0) return false;
  const desc = normalizePassbookDescription(row.description);
  return INSURANCE_KEYWORDS.some((kw) => desc.includes(normalizePassbookDescription(kw)));
}

/** 保険入金の照合で許容する振込日のズレ（日数） */
export const INSURANCE_MATCH_DAY_WINDOW = 10;
/** 経費の二重計上チェックで見る日付の幅（日数） */
export const EXPENSE_DUPLICATE_DAY_WINDOW = 3;
