import * as XLSX from "xlsx";

export type MonthlyReportData = {
  year: number;
  month: number;
  clinicName: string;
  // サマリー
  summary: {
    targetIncome: number;
    actualIncome: number;
    cashIncome: number;
    insuranceIncome: number;
    targetPatients: number;
    actualPatients: number;
    targetNewPatients: number;
    actualNewPatients: number;
    targetSnsTasks: number;
    actualSnsTasks: number;
    googleReviewCount: number;
    googleRating: number;
    selfEvaluation: string;
    aiSuggestions: string;
  };
  // 明細
  cashSales: { date: string; name: string; amount: number; isFirstVisit: boolean; memo: string }[];
  insurancePayments: { name: string; amount: number }[];
  appointments: { datetime: string; name: string; type: string; status: string }[];
};

function styleCell(ws: XLSX.WorkSheet, addr: string, bold = false, bg?: string) {
  if (!ws[addr]) return;
  ws[addr].s = {
    font: { bold },
    fill: bg ? { fgColor: { rgb: bg }, patternType: "solid" } : undefined,
    border: {
      top: { style: "thin", color: { rgb: "D1D5DB" } },
      bottom: { style: "thin", color: { rgb: "D1D5DB" } },
      left: { style: "thin", color: { rgb: "D1D5DB" } },
      right: { style: "thin", color: { rgb: "D1D5DB" } },
    },
  };
}

/** 月次レポートを複数シートExcelとしてダウンロード */
export function downloadMonthlyReport(data: MonthlyReportData) {
  const wb = XLSX.utils.book_new();
  const ym = `${data.year}年${data.month}月`;

  // ── Sheet 1: 月次サマリー ──────────────────────────────────────
  const achieveRate = (actual: number, target: number) =>
    target > 0 ? `${Math.round((actual / target) * 100)}%` : "—";

  const summaryRows = [
    [`${ym} 月次経営レポート — ${data.clinicName}`],
    [],
    ["■ 売上サマリー"],
    ["項目", "目標", "実績", "達成率"],
    ["売上合計（円）", data.summary.targetIncome, data.summary.actualIncome, achieveRate(data.summary.actualIncome, data.summary.targetIncome)],
    ["　自費売上（円）", "", data.summary.cashIncome, ""],
    ["　保険入金（円）", "", data.summary.insuranceIncome, ""],
    [],
    ["■ 来院サマリー"],
    ["項目", "目標", "実績", "達成率"],
    ["来院数（人）", data.summary.targetPatients, data.summary.actualPatients, achieveRate(data.summary.actualPatients, data.summary.targetPatients)],
    ["新規患者数（人）", data.summary.targetNewPatients, data.summary.actualNewPatients, achieveRate(data.summary.actualNewPatients, data.summary.targetNewPatients)],
    ["SNSタスク（件）", data.summary.targetSnsTasks, data.summary.actualSnsTasks, achieveRate(data.summary.actualSnsTasks, data.summary.targetSnsTasks)],
    [],
    ["■ クリニック評価"],
    ["Google口コミ件数", data.summary.googleReviewCount],
    ["Google評価（★）", data.summary.googleRating],
    [],
    ["■ 自己評価コメント"],
    [data.summary.selfEvaluation || "（未入力）"],
    [],
    ["■ AI提案（来月へのアクションプラン）"],
    [data.summary.aiSuggestions || "（未生成）"],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
  ws1["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 12 }];
  ws1["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 18, c: 0 }, e: { r: 18, c: 3 } },
    { s: { r: 20, c: 0 }, e: { r: 20, c: 3 } },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "月次サマリー");

  // ── Sheet 2: 自費売上明細 ──────────────────────────────────────
  const cashRows = [
    [`${ym} 自費売上明細`],
    [],
    ["日付", "患者名", "金額（円）", "初診/再診", "メモ"],
    ...data.cashSales.map(r => [
      r.date,
      r.name,
      r.amount,
      r.isFirstVisit ? "初診" : "再診",
      r.memo,
    ]),
    [],
    ["合計", "", data.cashSales.reduce((s, r) => s + r.amount, 0), "", ""],
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(cashRows);
  ws2["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws2, "自費売上明細");

  // ── Sheet 3: 保険入金明細 ──────────────────────────────────────
  const insRows = [
    [`${ym} 保険入金明細`],
    [],
    ["保険名", "入金額（円）"],
    ...data.insurancePayments.map(r => [r.name, r.amount]),
    [],
    ["合計", data.insurancePayments.reduce((s, r) => s + r.amount, 0)],
  ];

  const ws3 = XLSX.utils.aoa_to_sheet(insRows);
  ws3["!cols"] = [{ wch: 30 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws3, "保険入金明細");

  // ── Sheet 4: 予約明細 ──────────────────────────────────────────
  const aptRows = [
    [`${ym} 予約明細`],
    [],
    ["日時", "患者名", "初診/再診", "ステータス"],
    ...data.appointments.map(r => [r.datetime, r.name, r.type, r.status]),
  ];

  const ws4 = XLSX.utils.aoa_to_sheet(aptRows);
  ws4["!cols"] = [{ wch: 20 }, { wch: 18 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws4, "予約明細");

  // ── ダウンロード ──────────────────────────────────────────────
  const filename = `月次レポート_${data.year}年${String(data.month).padStart(2, "0")}月_${data.clinicName}.xlsx`;
  XLSX.writeFile(wb, filename);
}
