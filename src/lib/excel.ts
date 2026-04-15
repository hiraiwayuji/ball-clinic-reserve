import * as XLSX from "xlsx";

export type ExcelColumn = { key: string; label: string };

/** データ配列をExcelファイルとしてダウンロード */
export function exportToExcel(
  data: Record<string, unknown>[],
  columns: ExcelColumn[],
  filename: string,
  sheetName = "データ"
) {
  const rows = data.map((row) => {
    const out: Record<string, unknown> = {};
    columns.forEach(({ key, label }) => {
      out[label] = row[key] ?? "";
    });
    return out;
  });

  const ws = XLSX.utils.json_to_sheet(rows, { header: columns.map((c) => c.label) });

  // 列幅を自動調整（最大40文字）
  const colWidths = columns.map(({ label }) => ({
    wch: Math.min(Math.max(label.length * 2, 12), 40),
  }));
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

/** テンプレートExcel（サンプル行付き）をダウンロード */
export function downloadExcelTemplate(
  columns: ExcelColumn[],
  sampleRow: Record<string, unknown>,
  filename: string
) {
  exportToExcel([sampleRow], columns, filename);
}

/** Excel / CSV ファイルを2次元配列として解析 */
export async function parseUploadedFile(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  return rows.map((row) => row.map((cell) => String(cell ?? "").trim())) as string[][];
}
