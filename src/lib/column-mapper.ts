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

/** 変換後の経費行（インライン編集・バリデーション付き） */
export type EditableExpenseRow = ImportExpenseRow & {
  _originalIndex: number;  // rawData上の行インデックス（1-based、ヘッダー除く）
  _errors: string[];        // バリデーションエラー文字列配列
  _skipped: boolean;        // ユーザーが除外指定
};

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

/** 元号テーブル (元号名/略称 → 西暦開始年オフセット) */
const ERA_TABLE = [
  { re: /^[Rr令和]\s*/,  offset: 2018 }, // 令和1 = 2019
  { re: /^[Hh平成]\s*/,  offset: 1988 }, // 平成1 = 1989
  { re: /^[Ss昭和]\s*/,  offset: 1925 }, // 昭和1 = 1926
  { re: /^[Tt大正]\s*/,  offset: 1911 }, // 大正1 = 1912
  { re: /^[Mm明治]\s*/,  offset: 1867 }, // 明治1 = 1868
];

/** あらゆる日付表記を YYYY-MM-DD に変換する。変換不能なら "" を返す */
export function normalizeDate(v: string): string {
  const raw = v?.trim();
  if (!raw) return "";

  // ① Excelシリアル値（整数）: 40000〜60000 は 2009〜2064年に相当
  if (/^\d{5}$/.test(raw)) {
    const serial = parseInt(raw, 10);
    if (serial > 40000 && serial < 62000) {
      const d = new Date((serial - 25569) * 86400 * 1000);
      return d.toISOString().split("T")[0];
    }
  }

  // ② 8桁数字: 20260420
  if (/^\d{8}$/.test(raw)) {
    const y = raw.slice(0, 4), mo = raw.slice(4, 6), d = raw.slice(6, 8);
    if (isValidDate(Number(y), Number(mo), Number(d))) return `${y}-${mo}-${d}`;
  }

  // ③ 元号表記: R8.4.20 / 令和8年4月20日 / H38/4/20 など
  for (const era of ERA_TABLE) {
    if (!era.re.test(raw)) continue;
    const rest = raw.replace(era.re, "");
    const m = rest.match(/^(\d{1,2})[年.\-/](\d{1,2})[月.\-/](\d{1,2})日?$/);
    if (m) {
      const year = era.offset + parseInt(m[1], 10);
      const mo   = m[2].padStart(2, "0");
      const day  = m[3].padStart(2, "0");
      return `${year}-${mo}-${day}`;
    }
  }

  // ④ 「4月20日」「4/20」（年なし → 当年）
  const monthDay = raw.match(/^(\d{1,2})[月/](\d{1,2})日?$/);
  if (monthDay) {
    const y  = new Date().getFullYear();
    const mo = monthDay[1].padStart(2, "0");
    const d  = monthDay[2].padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }

  // ⑤ 一般的な区切り文字の正規化: / → - / 年月日 → - / 全角 → 半角
  const normalized = raw
    .replace(/[年月]/g, "-").replace(/日/g, "")
    .replace(/[\/\.・]/g, "-")
    .replace(/[ー−–—]/g, "-")
    .replace(/\s+/g, "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

  // YYYY-MM-DD（ゼロ埋め済み）
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;

  // YYYY-M-D → パディング
  const loose = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (loose) {
    const [, y, mo, d] = loose;
    if (isValidDate(Number(y), Number(mo), Number(d)))
      return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return "";
}

function isValidDate(y: number, m: number, d: number): boolean {
  return y > 1900 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

/** ¥/円/カンマ/全角数字 などを除去して整数に変換 */
export function normalizeAmount(v: string): number {
  if (!v) return 0;
  const cleaned = v
    .replace(/[,，￥¥円\s　]/g, "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? 0 : n;
}

function getCell(row: string[], colIndex: number | null): string {
  if (colIndex === null || colIndex < 0 || colIndex >= row.length) return "";
  return row[colIndex]?.trim() ?? "";
}

// ─── マッピング状態構築 ────────────────────────────────────────────────────

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

// ─── データ変換 ────────────────────────────────────────────────────────────

/** マッピング + バリデーション付きで EditableExpenseRow[] を生成（全行） */
export function buildEditableRows(
  dataRows: string[][],
  mapState: ColumnMapState
): EditableExpenseRow[] {
  const m = Object.fromEntries(mapState.map((f) => [f.dbField, f.colIndex]));

  return dataRows
    .map((row, idx) => {
      if (row.every((c) => c === "")) return null; // 空行スキップ

      const expense_date = normalizeDate(getCell(row, m.expense_date));
      const category     = getCell(row, m.category)    || "その他";
      const description  = getCell(row, m.description) || "";
      const amount       = normalizeAmount(getCell(row, m.amount));
      const memo         = getCell(row, m.memo) || "";

      const errors: string[] = [];
      if (!expense_date) errors.push("日付が読み取れません");
      if (amount <= 0)   errors.push("金額が0以下です");
      if (!description)  errors.push("内容が空です");

      return {
        expense_date,
        category,
        description,
        amount,
        memo,
        _originalIndex: idx + 1,
        _errors: errors,
        _skipped: false as boolean,
      };
    })
    .filter((r): r is EditableExpenseRow => r !== null);
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
