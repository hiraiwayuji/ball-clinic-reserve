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
import { bulkImportCustomers, ImportCustomerRow } from "@/app/actions/adminCustomers";
import { toast } from "sonner";

// CSVテンプレートの列定義
const TEMPLATE_HEADERS = [
  "患者名", "電話番号", "生年月日(YYYY/MM/DD)", "性別(男/女/その他)",
  "居住市町村", "カルテ番号", "来院のきっかけ",
];
const TEMPLATE_SAMPLE = [
  "山田太郎", "090-1234-5678", "1980/04/15", "男",
  "松山市", "001", "知人の紹介",
];

// CSV列→フィールドのマッピング
const COL_MAP: (keyof ImportCustomerRow)[] = [
  "name", "phone", "birth_date", "gender",
  "city_name", "medical_record_number", "referral_source",
];

function downloadTemplate() {
  const bom = "\uFEFF"; // Excel用BOM
  const header = TEMPLATE_HEADERS.join(",");
  const sample = TEMPLATE_SAMPLE.join(",");
  const csv = bom + header + "\n" + sample + "\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "患者リストテンプレート.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(text: string): string[][] {
  // BOM除去
  const clean = text.replace(/^\uFEFF/, "");
  return clean
    .split(/\r?\n/)
    .map((line) => {
      // ダブルクォート対応の簡易パース
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

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

type Step = "upload" | "preview" | "done";

export default function CustomerImportDialog({ open, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<ImportCustomerRow[]>([]);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: any[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("upload");
    setRows([]);
    setRawHeaders([]);
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

      const headers = matrix[0];
      setRawHeaders(headers);

      const dataRows = matrix.slice(1).map((cells) => {
        const row: ImportCustomerRow = { name: "" };
        COL_MAP.forEach((field, i) => {
          const val = cells[i]?.trim() || null;
          (row as any)[field] = val || null;
        });
        return row;
      }).filter((r) => r.name);

      if (dataRows.length === 0) { toast.error("患者名が入力された行がありません"); return; }
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
      const res = await bulkImportCustomers(rows);
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
            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            患者リスト CSVインポート
          </DialogTitle>
          <DialogDescription>
            ExcelやスプレッドシートのデータをCSV形式で取り込めます。同名・同電話番号の患者は重複登録されません。
          </DialogDescription>
        </DialogHeader>

        {/* ステップインジケーター */}
        <div className="flex items-center gap-2 text-xs font-bold mb-4">
          {(["upload", "preview", "done"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full ${step === s ? "bg-emerald-600 text-white" : ["preview","done"].includes(step) && i < ["upload","preview","done"].indexOf(step) ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                {i + 1}. {s === "upload" ? "ファイル選択" : s === "preview" ? "プレビュー確認" : "完了"}
              </span>
              {i < 2 && <ChevronRight className="w-3 h-3 text-slate-300" />}
            </div>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="space-y-5">
            {/* テンプレートDL */}
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-2xl p-5">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">
                ① まずテンプレートをダウンロード
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Excelで開き、既存のデータをコピーして貼り付けるだけで使えます。
              </p>
              <Button variant="outline" onClick={downloadTemplate} className="border-emerald-200 text-emerald-600 hover:bg-emerald-50 font-bold">
                <Download className="w-4 h-4 mr-2" />
                患者リストテンプレート.csv をダウンロード
              </Button>
              <div className="mt-3 text-xs text-slate-400 space-y-0.5">
                <p>• <span className="font-bold text-slate-600 dark:text-slate-300">患者名</span>（必須）、電話番号、生年月日、性別、居住市町村、カルテ番号</p>
                <p>• 生年月日は <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">2000/04/15</span> または <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">2000-04-15</span> の形式</p>
                <p>• 性別は <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">男</span> / <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">女</span> / <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">その他</span></p>
              </div>
            </div>

            {/* ファイルアップロード */}
            <div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">
                ② CSVファイルをアップロード
              </p>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
              <div
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${dragOver ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-200 dark:border-white/10 hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"}`}
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
                <span className="text-emerald-600 text-lg font-black">{rows.length}</span> 件のデータが読み込まれました。内容を確認してからインポートしてください。
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
                    <TableHead>患者名</TableHead>
                    <TableHead>電話番号</TableHead>
                    <TableHead>生年月日</TableHead>
                    <TableHead>性別</TableHead>
                    <TableHead>市町村</TableHead>
                    <TableHead>カルテ番号</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 100).map((row, i) => (
                    <TableRow key={i} className={!row.name ? "bg-rose-50 dark:bg-rose-950/20" : ""}>
                      <TableCell className="text-center text-xs text-slate-400">{i + 1}</TableCell>
                      <TableCell className="font-medium">{row.name || <span className="text-rose-500 text-xs">空欄（スキップ）</span>}</TableCell>
                      <TableCell className="text-sm text-slate-500">{row.phone || "—"}</TableCell>
                      <TableCell className="text-sm text-slate-500">{row.birth_date || "—"}</TableCell>
                      <TableCell className="text-sm text-slate-500">{row.gender || "—"}</TableCell>
                      <TableCell className="text-sm text-slate-500">{row.city_name || "—"}</TableCell>
                      <TableCell className="text-sm text-slate-500">{row.medical_record_number || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {rows.length > 100 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-xs text-slate-400 py-2">
                        …他 {rows.length - 100} 件（全件インポートされます）
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-400">
              同名・同電話番号の患者が既に登録されている場合はスキップされます（上書きしません）。
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={reset}>戻る</Button>
              <Button onClick={handleImport} disabled={importing} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-8">
                {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />インポート中...</> : <><Upload className="w-4 h-4 mr-2" />{rows.length}件を一括登録</>}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === "done" && result && (
          <div className="space-y-5 py-2">
            <div className="text-center">
              <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-500 mb-3" />
              <p className="text-xl font-black text-slate-900 dark:text-slate-100">インポート完了！</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl p-4 text-center">
                <p className="text-3xl font-black text-emerald-600">{result.inserted}</p>
                <p className="text-xs font-bold text-emerald-600 mt-1">新規登録</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 text-center">
                <p className="text-3xl font-black text-slate-400">{result.skipped}</p>
                <p className="text-xs font-bold text-slate-400 mt-1">重複スキップ</p>
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

            <Button onClick={handleClose} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black h-12">
              患者一覧に戻る
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
