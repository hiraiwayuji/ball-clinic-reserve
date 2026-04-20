import type { MappingResponse } from "@/app/api/ai/map-columns/route";
import type { ImportExpenseRow, ImportInsuranceRow } from "@/app/actions/sales";

export type MappingField = {
  colIndex: number | null;
  dbField: string;
  label: string;
  required: boolean;
  confidence: number;
  reason: string;
};

export type ColumnMapState = MappingField[];

const EXPENSE_FIELD_DEFS: Omit<MappingField, "colIndex" | "confidence" | "reason">[] = [
  { dbField: "expense_date", label: "日付",       required: true },
  { dbField: "category",     label: "カテゴリ",   required: true },
  { dbField: "description",  label: "内容",       required: true },
  { dbField: "amount",       label: "金額",       required: true },
  { dbField: "memo",         label: "備考",       required: false },
];

const INSURANCE_FIELD_DEFS: Omit<MappingField, "colIndex" | "confidence" | "reason">[] = [
  { dbField: "payment_date",   label: "入金日（対象月）", required: true },
  { dbField: "insurance_name", label: "保険機関名",       required: true },
  { dbField: "amount",         label: "金額",             required: true },
  { dbField: "notes",          label: "備考",             required: false },
];

/** AI応答からUI用マッピング状態を生成 */
export function buildMapState(
  mapping: MappingResponse,
  targetSchema: "expenses" | "insurance"
): ColumnMapState {
  const defs = targetSchema === "expenses" ? EXPENSE_FIELD_DEFS : INSURANCE_FIELD_DEFS;
  return defs.map((f) => {
    const found = mapping.mappings.find((m) => m.dbField === f.dbField);
    return {
      ...f,
      colIndex:   found?.colIndex   ?? null,
      confidence: found?.confidence ?? 0,
      reason:     found?.reason     ?? "未マッピング",
    };
  });
}

function normalizeDate(v: string): string {
  if (!v) return "";
  // Excelの日付シリアル値（整数）を変換
  const n = parseInt(v, 10);
  if (!isNaN(n) && n > 40000 && n < 60000 && !/[-/年]/.test(v)) {
    const date = new Date((n - 25569) * 86400 * 1000);
    return date.toISOString().split("T")[0];
  }
  const s = v
    .replace(/年/g, "-").replace(/月/g, "-").replace(/日/g, "")
    .replace(/\//g, "-").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // YYYY-M-D → YYYY-MM-DD
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return "";
}

function normalizeAmount(v: string): number {
  const cleaned = v.replace(/[,，￥¥円\s]/g, "");
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? 0 : n;
}

function getCell(row: string[], colIndex: number | null): string {
  if (colIndex === null || colIndex < 0 || colIndex >= row.length) return "";
  return row[colIndex]?.trim() ?? "";
}

/** マッピング状態を適用して ImportExpenseRow[] に変換 */
export function applyExpenseMapping(
  dataRows: string[][],
  mapState: ColumnMapState
): ImportExpenseRow[] {
  const m = Object.fromEntries(mapState.map((f) => [f.dbField, f.colIndex]));
  return dataRows
    .filter((row) => row.some((c) => c !== ""))
    .map((row) => ({
      expense_date: normalizeDate(getCell(row, m.expense_date)),
      category:     getCell(row, m.category)    || "その他",
      description:  getCell(row, m.description) || "（内容なし）",
      amount:       normalizeAmount(getCell(row, m.amount)),
      memo:         getCell(row, m.memo) || "",
    }));
}

/** マッピング状態を適用して ImportInsuranceRow[] に変換 */
export function applyInsuranceMapping(
  dataRows: string[][],
  mapState: ColumnMapState
): ImportInsuranceRow[] {
  const m = Object.fromEntries(mapState.map((f) => [f.dbField, f.colIndex]));
  return dataRows
    .filter((row) => row.some((c) => c !== ""))
    .map((row) => ({
      payment_date:   normalizeDate(getCell(row, m.payment_date)),
      insurance_name: getCell(row, m.insurance_name) || "（名称なし）",
      amount:         normalizeAmount(getCell(row, m.amount)),
      notes:          getCell(row, m.notes) || "",
    }));
}

/** プレビュー用: マッピングを適用した最初のN行を返す（型は問わず汎用） */
export function previewMappedRows(
  dataRows: string[][],
  mapState: ColumnMapState,
  limit = 5
): Record<string, string>[] {
  return dataRows.slice(0, limit)
    .filter((row) => row.some((c) => c !== ""))
    .map((row) =>
      Object.fromEntries(
        mapState
          .filter((f) => f.colIndex !== null)
          .map((f) => [f.label, getCell(row, f.colIndex)])
      )
    );
}
