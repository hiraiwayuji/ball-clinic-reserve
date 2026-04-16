import * as XLSX from "xlsx";

export type MonthlyRevenue = {
  month: number;          // 1-12
  cashIncome: number;
  insuranceIncome: number;
  totalIncome: number;
  expenseTotal: number;
  profit: number;
  newPatients: number;
  returnPatients: number;
};

export type ExpenseCategoryRow = {
  category: string;
  monthlyAmounts: number[];  // index 0=1月 ... 11=12月
  total: number;
};

export type ExpenseDetailRow = {
  date: string;
  category: string;
  description: string;
  amount: number;
  memo: string;
};

export type AnnualTaxReportData = {
  year: number;
  clinicName: string;
  months: MonthlyRevenue[];
  categoryRows: ExpenseCategoryRow[];
  expenseDetails: ExpenseDetailRow[];
};

const MONTH_LABELS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

export function downloadAnnualTaxReport(data: AnnualTaxReportData) {
  const wb = XLSX.utils.book_new();
  const year = data.year;
  const fy = `${year}年度`;

  // ── Sheet 1: 年間収支サマリー ──────────────────────────────────
  const totalCash      = data.months.reduce((s, m) => s + m.cashIncome, 0);
  const totalIns       = data.months.reduce((s, m) => s + m.insuranceIncome, 0);
  const totalIncome    = data.months.reduce((s, m) => s + m.totalIncome, 0);
  const totalExpense   = data.months.reduce((s, m) => s + m.expenseTotal, 0);
  const totalProfit    = totalIncome - totalExpense;

  const summaryRows: (string | number)[][] = [
    [`${fy} 確定申告サポート — ${data.clinicName}`],
    [],
    ["月", "自費収入", "保険収入", "収入合計", "経費合計", "差引利益"],
    ...data.months.map(m => [
      MONTH_LABELS[m.month - 1],
      m.cashIncome,
      m.insuranceIncome,
      m.totalIncome,
      m.expenseTotal,
      m.profit,
    ]),
    [],
    ["合計",
      totalCash,
      totalIns,
      totalIncome,
      totalExpense,
      totalProfit,
    ],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
  ws1["!cols"] = [{ wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  ws1["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
  XLSX.utils.book_append_sheet(wb, ws1, "年間収支サマリー");

  // ── Sheet 2: 収入月別明細 ──────────────────────────────────────
  const totalNew    = data.months.reduce((s, m) => s + m.newPatients, 0);
  const totalReturn = data.months.reduce((s, m) => s + m.returnPatients, 0);

  const incomeRows: (string | number)[][] = [
    [`${fy} 収入月別明細 — ${data.clinicName}`],
    [],
    ["月", "自費収入", "保険収入", "収入合計", "新患数", "再来院数", "来院合計"],
    ...data.months.map(m => [
      MONTH_LABELS[m.month - 1],
      m.cashIncome,
      m.insuranceIncome,
      m.totalIncome,
      m.newPatients,
      m.returnPatients,
      m.newPatients + m.returnPatients,
    ]),
    [],
    ["合計", totalCash, totalIns, totalIncome, totalNew, totalReturn, totalNew + totalReturn],
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(incomeRows);
  ws2["!cols"] = [{ wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
  ws2["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
  XLSX.utils.book_append_sheet(wb, ws2, "収入月別明細");

  // ── Sheet 3: 経費カテゴリ別月別（ピボット） ────────────────────
  const pivotHeader = [`${fy} 経費カテゴリ別月別 — ${data.clinicName}`];
  const pivotColHeader = ["カテゴリ", ...MONTH_LABELS, "合計"];
  const pivotRows: (string | number)[][] = [
    pivotHeader,
    [],
    pivotColHeader,
    ...data.categoryRows.map(row => [
      row.category,
      ...row.monthlyAmounts,
      row.total,
    ]),
    [],
    [
      "合計",
      ...Array.from({ length: 12 }, (_, i) =>
        data.categoryRows.reduce((s, r) => s + r.monthlyAmounts[i], 0)
      ),
      totalExpense,
    ],
  ];

  const ws3 = XLSX.utils.aoa_to_sheet(pivotRows);
  ws3["!cols"] = [
    { wch: 22 },
    ...Array(12).fill({ wch: 10 }),
    { wch: 12 },
  ];
  ws3["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 13 } }];
  XLSX.utils.book_append_sheet(wb, ws3, "経費カテゴリ別月別");

  // ── Sheet 4: 経費全件一覧 ──────────────────────────────────────
  const detailRows: (string | number)[][] = [
    [`${fy} 経費全件一覧 — ${data.clinicName}`],
    [],
    ["日付", "カテゴリ", "内容", "金額（円）", "メモ"],
    ...data.expenseDetails.map(r => [r.date, r.category, r.description, r.amount, r.memo]),
    [],
    ["合計", "", "", totalExpense, ""],
  ];

  const ws4 = XLSX.utils.aoa_to_sheet(detailRows);
  ws4["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 28 }, { wch: 14 }, { wch: 30 }];
  ws4["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
  XLSX.utils.book_append_sheet(wb, ws4, "経費全件一覧");

  // ダウンロード
  const filename = `確定申告サポート_${year}年度_${data.clinicName}.xlsx`;
  XLSX.writeFile(wb, filename);
}
