/**
 * 経費カテゴリ定数
 * 追加・変更はここ1か所で管理してください
 */

/** システム標準カテゴリ（全業種共通 + 接骨院・サロン向け） */
export const BASE_EXPENSE_CATEGORIES = [
  // 一般的な経費
  "光熱費",
  "消耗品",
  "備品購入",
  "交通費",
  "通信費",
  "家賃",
  "広告費",
  "教育・研修",
  "リース料",
  "接待交際費",
  "福利厚生費",
  "修繕費",
  "保険料",
  // 接骨院・整体・サロン向け
  "医療備品",
  "施術材料費",
  "衛生用品",
  "美容材料費",
  "タオル・リネン費",
  // その他
  "雑費",
  "その他",
] as const;

export type BaseExpenseCategory = typeof BASE_EXPENSE_CATEGORIES[number];

/** 収入（その他収入）のカテゴリ。受付の患者売上とは別に、雑収入・物販などを記帳する用途。 */
export const INCOME_CATEGORIES = ["物販", "自販機", "雑収入", "受取手数料", "受取利息", "その他収入"] as const;

export type IncomeCategory = typeof INCOME_CATEGORIES[number];
