// 窓口日計表の金額入力カラム定義。
// "use server" ファイルからは値（オブジェクト/配列）を export できないため、
// 定数・型はこの通常モジュールに置く。

export type TallyColumn = {
  key: string;        // cash_sales.payment_type には "tally:<key>" で保存
  label: string;      // 表示名（例: 鍼灸）
  sort_order: number;
  // 種別（例: 鍼灸 → ["一般","学割","小児鍼","置鍼","電気鍼"]）。
  // 設定されていればセル内のプルダウンで種別を選んでから金額入力できる。
  // 種別は cash_sales.memo の variant に保存し、payment_type は "tally:<key>" のまま
  // （カテゴリ別集計は親メニュー単位で従来どおり動く）。
  variants?: string[];
};

// からだ鍼灸整骨院のメニュー構成（2026-06 リニューアル）。
// 種別が複数あるものは variants でセル内プルダウンに展開する。
export const DEFAULT_TALLY_COLUMNS: TallyColumn[] = [
  { key: "hoken",    label: "保険施術",            sort_order: 1,  variants: ["J", "S", "J+S", "自賠"] },
  { key: "taping",   label: "テーピング",          sort_order: 2,  variants: ["一般", "学割"] },
  { key: "shinkyu",  label: "鍼灸",                sort_order: 3,  variants: ["一般", "学割", "小児鍼", "置鍼", "電気鍼"] },
  { key: "keiraku",  label: "経絡治療",            sort_order: 4 },
  { key: "zenshin",  label: "じっくり全身調整",     sort_order: 5 },
  { key: "seitai",   label: "整体",                sort_order: 6 },
  { key: "remake",   label: "院長トータルリメイク", sort_order: 7, variants: ["60分", "90分"] },
  { key: "personal", label: "パーソナルトレーニング", sort_order: 8, variants: ["パーソナル", "ピラティス"] },
  { key: "buppan",   label: "物販",                sort_order: 9 },
];
