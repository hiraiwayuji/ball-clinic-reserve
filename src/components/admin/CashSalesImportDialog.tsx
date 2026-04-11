"use client";

import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle,
  Loader2, ChevronRight, X
} from "lucide-react";
import { bulkImportCashSales, ImportCashSaleRow } from "@/app/actions/sales";
import { toast } from "sonner";

// CSVテンプレートの列定義
const TEMPLATE_HEADERS = [
  "日付(YYYY/MM/DD)", "お名前", "金額（税込）", "備考", "新患（○/空欄）",
];
const TEMPLATE_SAMPLE = [
  "2026/01/15", "やまだ たろう", "5000", "自費施術", "",
];

// CSV列→フィールドのマッピング
const COL_MAP = ["sale_date", "customer_name", "treatment_fee", "memo", "is_first_visit"] as const;

function downloadTemplate() {
  const bom = "\uFEFF";
  const header = TEMPLATE_HEADERS.join(",");
  const sample = TEMPLATE_SAMPLE.join(",");
  const csv = bom + header + "\n" + sample + "\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "受付入力テンプレート.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  return clean
    .split(/\r?\n/)
    .map((line) => {
      const cells: string[] = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { inQ = !inQ; continue; }
        if (c === "," && !inQ) { cells.push(cur.trim()); cur = ""; continue; }
        cur += c;
      }
      cells.push(cur.trim());
      return cells;
    })
    .filter((row) => row.some((c) => c !== ""));
}

function normalizeDate(val: string | null): string | null {
  if (!val) return null;
  // YYYY/MM/DD → YYYY-MM-DD
  const m = val.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

type Step = "upload" | "preview" | "done";

export default function CashSalesImportDialog({ open, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<ImportCashSaleRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: any[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("upload");
    setRows([]);
    setResult(null);
    setImporting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const processFile = (file: File) => {
    if (!file.name.match(/\.(csv|txt)$/i)) {
      toast.error("CSVファイル（.csv）を選択してください");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const matrix = parseCSV(text);
      if (matrix.length < 2) { toast.error("データが見つかりません"); return; }

      const dataRows = matrix.slice(1).map((cells) => {
        const rawDate = cells[0]?.trim() || null;
        const name = cells[1]?.trim() || "";
        const feeStr = cells[2]?.trim() || "0";
        const memo = cells[3]?.trim() || null;
        const isFirstRaw = cells[4]?.trim() || "";

        const saleDate = normalizeDate(rawDate) || rawDate || "";
        const treatmentFee = parseInt(feeStr.replace(/[^\d]/g, ""), 10) || 0;
        const isFirstVisit = isFirstRaw === "○" || isFirstRaw === "〇" || isFirstRaw.toLowerCase() === "o";

        return { sale_date: saleDate, customer_name: name, treatment_fee: treatmentFee, memo, is_first_visit: isFirstVisit } as ImportCashSaleRow;
      }).filter((r) => r.customer_name);

      if (dataRows.length === 0) { toast.error("お名前が入力された行がありません"); return; }
      setRows(dataRows);
      setStep("preview");
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await bulkImportCashSales(rows);
      setResult(res);
      setStep("done");
      if (res.inserted > 0) onImported();
    } catch (e: any) {
      toast.error(e.message || "インポートに失敗しました");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-black">
            <FileSpreadsheet className="w-6 h-6 text-blue-600" />
            受付入力 CSVインポート
          </DialogTitle>
          <DialogDescription>
            ExcelやスプレッドシートのデータをCSV形式で一括取り込みできます。
          </DialogDescription>
        </DialogHeader>

        {/* ステップインジケーター */}
        <div className="flex items-center gap-2 text-xs font-bold mb-4">
          {(["upload", "preview", "done"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full ${step === s ? "bg-blue-600 text-white" : ["preview","done"].includes(step) && i < ["upload","preview","done"].indexOf(step) ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400"}`}>
                {i + 1}. {s === "upload" ? "ファイル選択" : s === "preview" ? "プレビュー確認" : "完了"}
              </span>
              {i < 2 && <ChevronRight className="w-3 h-3 text-slate-300" />}
            </div>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="space-y-5">
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-2xl p-5">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">
                ① まずテンプレートをダウンロード
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Excelで開き、既存データを貼り付けて保存するだけで使えます。
              </p>
              <Button variant="outline" onClick={downloadTemplate} className="border-blue-200 text-blue-600 hover:bg-blue-50 font-bold">
                <Download className="w-4 h-4 mr-2" />
                受付入力テンプレート.csv をダウンロード
              </Button>
              <div className="mt-3 text-xs text-slate-400 space-y-0.5">
                <p>• <span className="font-bold text-slate-600 dark:text-slate-300">日付</span>（必須）例: <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">2026/01/15</span></p>
                <p>• <span className="font-bold text-slate-600 dark:text-slate-300">お名前</span>（必須）、<span className="font-bold text-slate-600 dark:text-slate-300">金額</span>（必須・数字のみ）</p>
                <p>• 新患の場合は「新患」欄に <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">○</span> を入力</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">
                ② CSVファイルをアップロード
              </p>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
              <div
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${dragOver ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30" : "border-slate-200 dark:border-white/10 hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-950/20"}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <Upload className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="font-bold text-slate-600 dark:text-slate-300">クリックまたはドラッグ＆ドロップ</p>
                <p className="text-xs text-slate-400 mt-1">.csv ファイルに対応</p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Preview */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                <span className="text-blue-600 text-lg font-black">{rows.length}</span> 件のデータが読み込まれました。
              </p>
              <Button variant="ghost" size="sm" onClick={reset} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4 mr-1" />ファイルを変更
              </Button>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden max-h-72 overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-800/50 sticky top-0">
                  <TableRow>
                    <TableHead className="w-8 text-center">#</TableHead>
                    <TableHead>日付</TableHead>
                    <TableHead>お名前</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                    <TableHead>備考</TableHead>
                    <TableHead className="text-center">新患</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 100).map((row, i) => (
                    <TableRow key={i} className={!row.customer_name ? "bg-rose-50 dark:bg-rose-950/20" : ""}>
                      <TableCell className="text-center text-xs text-slate-400">{i + 1}</TableCell>
                      <TableCell className="text-sm text-slate-500">{row.sale_date || <span className="text-rose-500 text-xs">空欄</span>}</TableCell>
                      <TableCell className="font-medium">{row.customer_name || <span className="text-rose-500 text-xs">空欄（スキップ）</span>}</TableCell>
                      <TableCell className="text-right font-medium">¥{row.treatment_fee.toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-slate-500">{row.memo || "—"}</TableCell>
                      <TableCell className="text-center">
                        {row.is_first_visit && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">新患</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length > 100 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-xs text-slate-400 py-2">
                        …他 {rows.length - 100} 件（全件インポートされます）
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-400">
              同じ日付・名前・金額の組み合わせでも重複チェックはありません。インポート前に内容をご確認ください。
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={reset}>戻る</Button>
              <Button onClick={handleImport} disabled={importing} className="bg-blue-600 hover:bg-blue-700 text-white font-black px-8">
                {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />インポート中...</> : <><Upload className="w-4 h-4 mr-2" />{rows.length}件を一括登録</>}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === "done" && result && (
          <div className="space-y-5 py-2">
            <div className="text-center">
              <CheckCircle2 className="w-14 h-14 mx-auto text-blue-500 mb-3" />
              <p className="text-xl font-black text-slate-900 dark:text-slate-100">インポート完了！</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-2xl p-4 text-center">
                <p className="text-3xl font-black text-blue-600">{result.inserted}</p>
                <p className="text-xs font-bold text-blue-600 mt-1">新規登録</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 text-center">
                <p className="text-3xl font-black text-slate-400">{result.skipped}</p>
                <p className="text-xs font-bold text-slate-400 mt-1">スキップ</p>
              </div>
              <div className={`rounded-2xl p-4 text-center ${result.errors.length > 0 ? "bg-rose-50 dark:bg-rose-950/30" : "bg-slate-50 dark:bg-slate-800/50"}`}>
                <p className={`text-3xl font-black ${result.errors.length > 0 ? "text-rose-500" : "text-slate-300"}`}>{result.errors.length}</p>
                <p className={`text-xs font-bold mt-1 ${result.errors.length > 0 ? "text-rose-500" : "text-slate-400"}`}>エラー</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 rounded-xl p-3 space-y-1">
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />スキップされた行
                </p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-rose-500">{e.row}行目「{e.name}」: {e.reason}</p>
                ))}
              </div>
            )}

            <Button onClick={handleClose} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black h-12">
              受付入力一覧に戻る
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
