"use client";

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Wand2,
  ChevronRight,
  RotateCcw,
  Bot,
  Info,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { parseUploadedFile, downloadExcelTemplate } from "@/lib/excel";
import {
  buildMapState,
  applyExpenseMapping,
  applyInsuranceMapping,
  previewMappedRows,
} from "@/lib/column-mapper";
import type { ColumnMapState } from "@/lib/column-mapper";
import type { MappingResponse } from "@/app/api/ai/map-columns/route";
import {
  bulkImportExpenses,
  bulkImportInsurancePayments,
} from "@/app/actions/sales";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "upload" | "analyzing" | "mapping" | "preview" | "importing" | "done";

type Props = {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  targetSchema: "expenses" | "insurance";
  title: string;
};

type ImportResult = {
  inserted: number;
  skipped: number;
  errors: Array<{ row: number; description?: string; name?: string; reason: string }>;
};

// ─── Template definitions ─────────────────────────────────────────────────────

const EXPENSE_TEMPLATE_COLS = [
  { key: "expense_date", label: "日付(YYYY/MM/DD)" },
  { key: "category",     label: "カテゴリ" },
  { key: "description",  label: "内容" },
  { key: "amount",       label: "金額" },
  { key: "memo",         label: "備考" },
];

const EXPENSE_TEMPLATE_SAMPLE = {
  "日付(YYYY/MM/DD)": "2026/04/15",
  カテゴリ: "消耗品",
  内容: "ハンドソープ",
  金額: 980,
  備考: "",
};

const INSURANCE_TEMPLATE_COLS = [
  { key: "payment_date",   label: "振込日(YYYY/MM/DD)" },
  { key: "insurance_name", label: "保険種別" },
  { key: "amount",         label: "振込金額" },
  { key: "notes",          label: "メモ" },
];

const INSURANCE_TEMPLATE_SAMPLE = {
  "振込日(YYYY/MM/DD)": "2026/04/20",
  保険種別: "協会けんぽ",
  振込金額: 58400,
  メモ: "4月分療養費",
};

// ─── Mapping field options ────────────────────────────────────────────────────

const EXPENSE_FIELD_OPTIONS = [
  { value: "expense_date", label: "日付" },
  { value: "category",     label: "カテゴリ" },
  { value: "description",  label: "内容" },
  { value: "amount",       label: "金額" },
  { value: "memo",         label: "備考" },
  { value: "__ignore__",   label: "（無視）" },
];

const INSURANCE_FIELD_OPTIONS = [
  { value: "payment_date",   label: "入金日" },
  { value: "insurance_name", label: "保険機関名" },
  { value: "amount",         label: "金額" },
  { value: "notes",          label: "備考" },
  { value: "__ignore__",     label: "（無視）" },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UniversalImportDialog({
  open,
  onClose,
  onDone,
  targetSchema,
  title,
}: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [dragging, setDragging] = useState(false);
  const [rawData, setRawData] = useState<string[][]>([]);
  const [mapState, setMapState] = useState<ColumnMapState>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const accentColor = targetSchema === "expenses" ? "emerald" : "blue";
  const fieldOptions = targetSchema === "expenses" ? EXPENSE_FIELD_OPTIONS : INSURANCE_FIELD_OPTIONS;

  // ─── Reset ───────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setStep("upload");
    setDragging(false);
    setRawData([]);
    setMapState([]);
    setWarnings([]);
    setPreviewRows([]);
    setTotalCount(0);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  // ─── Template download ────────────────────────────────────────────────────

  const handleDownloadTemplate = () => {
    if (targetSchema === "expenses") {
      downloadExcelTemplate(EXPENSE_TEMPLATE_COLS, EXPENSE_TEMPLATE_SAMPLE, "経費入力テンプレート.xlsx");
    } else {
      downloadExcelTemplate(INSURANCE_TEMPLATE_COLS, INSURANCE_TEMPLATE_SAMPLE, "保険入金テンプレート.xlsx");
    }
  };

  // ─── File handling ────────────────────────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    try {
      const raw = await parseUploadedFile(file);
      if (raw.length < 2) {
        toast.error("データが見つかりません（ヘッダー行 + データ行が必要です）");
        return;
      }
      setRawData(raw);
      setStep("analyzing");

      const headers = raw[0];
      const sampleRows = raw.slice(1, 4);

      const res = await fetch("/api/ai/map-columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers, sampleRows, targetSchema }),
      });

      if (!res.ok) {
        toast.error("AI解析に失敗しました。手動でマッピングしてください。");
        // Build empty mapping so user can manually map
        const emptyMapping: MappingResponse = { mappings: [], unmapped: [], warnings: ["AI解析に失敗しました。手動で設定してください。"] };
        const state = buildMapState(emptyMapping, targetSchema);
        setMapState(state);
        setWarnings(emptyMapping.warnings);
        setStep("mapping");
        return;
      }

      const mapping: MappingResponse = await res.json();
      const state = buildMapState(mapping, targetSchema);
      setMapState(state);
      setWarnings(mapping.warnings ?? []);
      setStep("mapping");
    } catch {
      toast.error("ファイルの読み込みに失敗しました");
      setStep("upload");
    }
  }, [targetSchema]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  // ─── Mapping update ───────────────────────────────────────────────────────

  const updateMapping = (dbField: string, newDbField: string | null) => {
    if (!newDbField) return;
    setMapState((prev) =>
      prev.map((f) =>
        f.dbField === dbField ? { ...f, dbField: newDbField === "__ignore__" ? "__ignore__" : newDbField } : f
      )
    );
  };

  // ─── Preview ──────────────────────────────────────────────────────────────

  const handleGoToPreview = () => {
    const dataRows = rawData.slice(1);
    const preview = previewMappedRows(dataRows, mapState, 5);
    setPreviewRows(preview);
    setTotalCount(dataRows.filter((row) => row.some((c) => c !== "")).length);
    setStep("preview");
  };

  // ─── Import ───────────────────────────────────────────────────────────────

  const handleImport = async () => {
    setStep("importing");
    try {
      const dataRows = rawData.slice(1);

      if (targetSchema === "expenses") {
        const rows = applyExpenseMapping(dataRows, mapState);
        const res = await bulkImportExpenses(rows);
        setResult({
          inserted: res.inserted,
          skipped: res.skipped,
          errors: res.errors.map((e) => ({ row: e.row, description: e.description, reason: e.reason })),
        });
      } else {
        const rows = applyInsuranceMapping(dataRows, mapState);
        const res = await bulkImportInsurancePayments(rows);
        setResult({
          inserted: res.inserted,
          skipped: res.skipped,
          errors: res.errors.map((e) => ({ row: e.row, name: e.name, reason: e.reason })),
        });
      }

      setStep("done");
    } catch {
      toast.error("インポートに失敗しました");
      setStep("preview");
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileSpreadsheet className={`w-5 h-5 text-${accentColor}-400`} />
            {title}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Excel（.xlsx）またはCSV（.csv）で一括登録できます。AIが列を自動認識します。
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: Upload ── */}
        {step === "upload" && (
          <div className="space-y-4">
            <button
              onClick={handleDownloadTemplate}
              className={`flex items-center gap-2 text-sm text-${accentColor}-400 hover:text-${accentColor}-300 underline`}
            >
              <Download className="w-4 h-4" />
              テンプレートをダウンロード（推奨形式）
            </button>

            <div
              onClick={() => inputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cn(
                "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition",
                dragging
                  ? `border-${accentColor}-400 bg-${accentColor}-950/20`
                  : "border-slate-600 hover:border-slate-500"
              )}
            >
              <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
              <p className="text-slate-300 font-medium">
                クリックまたはドラッグ&ドロップでファイルを選択
              </p>
              <p className="text-slate-500 text-sm mt-1">.xlsx / .xls / .csv 対応</p>
              <p className="text-slate-600 text-xs mt-2">
                <Wand2 className="w-3 h-3 inline mr-1" />
                どんな列名でもAIが自動認識します
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                hidden
                onChange={handleFileChange}
              />
            </div>
          </div>
        )}

        {/* ── Step 2: Analyzing ── */}
        {step === "analyzing" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="relative">
              <Bot className={`w-12 h-12 text-${accentColor}-400`} />
              <Sparkles className="w-5 h-5 text-yellow-400 absolute -top-1 -right-1" />
            </div>
            <p className="text-slate-300 font-medium">AIが列を解析中...</p>
            <Loader2 className={`w-6 h-6 text-${accentColor}-400 animate-spin`} />
            <p className="text-slate-500 text-xs">Gemini AIがヘッダーとサンプルデータを分析しています</p>
          </div>
        )}

        {/* ── Step 3: Mapping ── */}
        {step === "mapping" && (
          <div className="space-y-4">
            {warnings.length > 0 && (
              <div className="bg-amber-950/40 border border-amber-700 rounded-lg p-3 flex gap-2">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  {warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-300">{w}</p>
                  ))}
                </div>
              </div>
            )}

            <p className="text-sm text-slate-400">
              AIが自動認識した列マッピングを確認・修正してください。
            </p>

            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-700">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-xs">あなたのExcel列名</TableHead>
                    <TableHead className="text-slate-400 text-xs">読み取り項目</TableHead>
                    <TableHead className="text-slate-400 text-xs">信頼度</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mapState.map((field) => {
                    const lowConfidence = field.confidence < 0.7;
                    const excelColName = field.colIndex !== null ? rawData[0]?.[field.colIndex] ?? `列${field.colIndex}` : "（未マッピング）";
                    const confidenceDots = field.confidence >= 0.9 ? "●●●" : field.confidence >= 0.7 ? "●●○" : "●○○";

                    return (
                      <TableRow
                        key={field.dbField}
                        className={cn(
                          "border-slate-800",
                          lowConfidence && "bg-amber-950/20"
                        )}
                      >
                        <TableCell className="text-xs text-slate-300 font-mono">
                          {excelColName}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-2">
                            <Select
                              value={field.dbField === "__ignore__" ? "__ignore__" : field.dbField}
                              onValueChange={(val) => updateMapping(field.dbField, val)}
                            >
                              <SelectTrigger className="h-7 text-xs bg-slate-800 border-slate-600 text-slate-200 w-36">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-slate-800 border-slate-600">
                                {fieldOptions.map((opt) => (
                                  <SelectItem
                                    key={opt.value}
                                    value={opt.value}
                                    className="text-xs text-slate-200"
                                  >
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {lowConfidence && (
                              <Badge className="bg-amber-900/60 text-amber-300 border-amber-700 text-xs px-1 py-0">
                                要確認
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className={cn(
                            "font-mono",
                            field.confidence >= 0.9 ? "text-emerald-400" :
                            field.confidence >= 0.7 ? "text-yellow-400" : "text-red-400"
                          )}>
                            {confidenceDots}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={reset}
                className="border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                やり直す
              </Button>
              <Button
                onClick={handleGoToPreview}
                className={`flex-1 bg-${accentColor}-600 hover:bg-${accentColor}-500 text-white`}
              >
                この内容でプレビュー
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Preview ── */}
        {step === "preview" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              変換後データのプレビュー（先頭5件）。全 {totalCount} 件をインポートします。
            </p>

            {previewRows.length > 0 ? (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-700">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700">
                      {Object.keys(previewRows[0]).map((col) => (
                        <TableHead key={col} className="text-slate-400 text-xs">{col}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, i) => (
                      <TableRow key={i} className="border-slate-800">
                        {Object.values(row).map((val, j) => (
                          <TableCell key={j} className="text-xs text-slate-300 max-w-[120px] truncate">
                            {val || <span className="text-slate-600">—</span>}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-4">プレビューデータがありません</p>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep("mapping")}
                className="border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                ← マッピングに戻る
              </Button>
              <Button
                onClick={handleImport}
                className={`flex-1 bg-${accentColor}-600 hover:bg-${accentColor}-500 text-white`}
              >
                <Upload className="w-4 h-4 mr-2" />
                インポート実行（{totalCount}件）
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 5: Importing ── */}
        {step === "importing" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className={`w-10 h-10 text-${accentColor}-400 animate-spin`} />
            <p className="text-slate-300 font-medium">保存中...</p>
          </div>
        )}

        {/* ── Step 6: Done ── */}
        {step === "done" && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className={`w-8 h-8 text-${accentColor}-400`} />
              <div>
                <p className="font-bold text-white">インポート完了</p>
                <p className="text-sm text-slate-400">
                  挿入: {result.inserted}件 / スキップ: {result.skipped}件
                </p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="bg-red-950/40 border border-red-800 rounded-lg p-3 space-y-1">
                <p className="text-xs font-bold text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  エラーが発生した行
                </p>
                {result.errors.slice(0, 5).map((e, i) => (
                  <p key={i} className="text-xs text-red-300">
                    {e.row}行目: {e.description ?? e.name ?? ""} — {e.reason}
                  </p>
                ))}
                {result.errors.length > 5 && (
                  <p className="text-xs text-red-500">他 {result.errors.length - 5} 件のエラー</p>
                )}
              </div>
            )}

            <Button
              onClick={() => { reset(); onDone(); }}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white"
            >
              閉じる
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
