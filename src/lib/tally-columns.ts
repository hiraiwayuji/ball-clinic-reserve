// 窓口日計表の金額入力カラム定義。
// "use server" ファイルからは値（オブジェクト/配列）を export できないため、
// 定数・型はこの通常モジュールに置く。

export type TallyColumn = {
  key: string;        // cash_sales.payment_type には "tally:<key>" で保存
  label: string;      // 表示名（例: 保険柔整(J)）
  sort_order: number;
};

// からだ鍼灸整骨院ベースのデフォルト6カラム
export const DEFAULT_TALLY_COLUMNS: TallyColumn[] = [
  { key: "hoken_jusei",   label: "保険柔整(J)",      sort_order: 1 },
  { key: "hoken_shinkyu", label: "保険鍼灸(S)",      sort_order: 2 },
  { key: "jihigai_jusei", label: "保険外柔整(保外J)", sort_order: 3 },
  { key: "jihi_shinkyu",  label: "自費鍼灸(鍼灸S)",   sort_order: 4 },
  { key: "momi",          label: "揉み",            sort_order: 5 },
  { key: "buppan",        label: "物販",            sort_order: 6 },
];
