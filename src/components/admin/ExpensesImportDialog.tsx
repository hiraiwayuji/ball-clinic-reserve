"use client";

import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";
import { bulkImportExpenses, ImportExpenseRow } from "@/app/actions/sales";
import { parseUploadedFile, downloadExcelTemplate } from "@/lib/excel";
import { toast } from "sonner";

const EXPENSE_CATEGORIES = [
  "光熱費", "消耗品", "備品購入", "交通費", "通信費",
  "家賃", "広告費", "教育・研修", "リース料", "雑費", "その他",
];

const COLUMNS = [
  { key: "expense_date", label: "日付(YYYY/MM/DD)" },
  { key: "category",     label: "カテゴリ" },
  { key: "description",  label: "内容" },
  { key: "amount",       label: "金額" },
  { key: "memo",         label: "備考" },
];

const SAMPLE_ROW = {
  "日付(YYYY/MM/DD)": "2026/04/15",
  カテゴリ: "消耗品",
  内容: "ハンドソープ",
  金額: 980,
  備考: "",
};

function normalizeDate(v: string): string | null {
  if (!v) return null;
  const s = v.replace(/\//g, "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function parseRows(raw: string[][]): ImportExpenseRow[] {
  if (raw.length < 2) return [];
  return raw.slice(1).map((row) => ({
    expense_date: normalizeDate(row[0]) || "",
    category: row[1]?.trim() || "",
    description: row[2]?.trim() || "",
    amount: parseInt(row[3]?.replace(/,/g, "") || "0", 10),
    memo: row[4]?.trim() || "",
  }));
}

type Props = { open: boolean; onClose: () => void; onDone: () => void };

export default function ExpensesImportDialog({ open, onClose, onDone }: Props) {
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [rows, setRows] = useState<ImportExpenseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: { row: number; description: string; reason: string }[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setStep("upload"); setRows([]); setResult(null); };

  const handleFile = async (file: File) => {
    try {
      const raw = await parseUploadedFile(file);
      const parsed = parseRows(raw);
      if (parsed.length === 0) { toast.error("データが見つかりません"); return; }
      setRows(parsed);
      setStep("preview");
    } catch {
      toast.error("ファイルの読み込みに失敗しました");
    }
  };

  const handleImport = async () => {
    setLoading(true);
    try {
      const res = await bulkImportExpenses(rows);
      setResult(res);
      setStep("done");
      if (res.inserted > 0) { toast.success(`${res.inserted}件登録しました`); onDone(); }
    } catch {
      toast.error("インポートに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            経費 Excel/CSV インポート
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Excel（.xlsx）またはCSV（.csv）で一括登録できます
          </DialogDescription>
        </DialogHeader>

        {/* UPLOAD */}
        {step === "upload" && (
          <div className="space-y-4">
            <button
              onClick={() => downloadExcelTemplate(COLUMNS, SAMPLE_ROW, "経費入力テンプレート.xlsx")}
              className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 underline"
            >
              <Download className="w-4 h-4" /> テンプレートをダウンロード
            </button>
            <div
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-slate-600 hover:border-emerald-500 rounded-xl p-10 text-center cursor-pointer transition"
            >
              <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
              <p className="text-slate-300 font-medium">クリックしてファイルを選択</p>
              <p className="text-slate-500 text-sm mt-1">.xlsx / .csv 対応</p>
              <input ref={inputRef} type="file" accept=".xlsx,.csv" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </div>
            <div className="bg-slate-800 rounded-lg p-3 text-xs text-slate-400 space-y-1">
              <p className="font-bold text-slate-300">列の順番</p>
              {COLUMNS.map((c, i) => (
                <p key={c.key}>{i + 1}列目: {c.label}{["expense_date","category","amount"].includes(c.key) ? " ※必須" : ""}</p>
              ))}
              <p className="mt-2">カテゴリ: {EXPENSE_CATEGORIES.join(" / ")}</p>
            </div>
          </div>
        )}

        {/* PREVIEW */}
        {step === "preview" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">{rows.length}件のデータを確認してください</p>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-700">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    {["日付", "カテゴリ", "内容", "金額", "備考"].map((h) => (
                      <TableHead key={h} className="text-slate-400 text-xs">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 50).map((r, i) => (
                    <TableRow key={i} className="border-slate-800">
                      <TableCell className="text-xs text-slate-300">{r.expense_date || <span className="text-red-400">未入力</span>}</TableCell>
                      <TableCell className="text-xs text-slate-300">{r.category || <span className="text-red-400">未入力</span>}</TableCell>
                      <TableCell className="text-xs text-slate-300 max-w-[120px] truncate">{r.description}</TableCell>
                      <TableCell className="text-xs text-slate-300">{r.amount > 0 ? `¥${r.amount.toLocaleString()}` : <span className="text-red-400">無効</span>}</TableCell>
                      <TableCell className="text-xs text-slate-300 max-w-[80px] truncate">{r.memo}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {rows.length > 50 && <p className="text-xs text-slate-500">（先頭50件を表示中。全{rows.length}件）</p>}
            <div className="flex gap-3">
              <Button variant="outline" onClick={reset} className="border-slate-600 text-slate-300">
                <X className="w-4 h-4 mr-1" /> やり直す
              </Button>
              <Button onClick={handleImport} disabled={loading}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white">
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {rows.length}件を一括登録
              </Button>
            </div>
          </div>
        )}

        {/* DONE */}
        {step === "done" && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              <div>
                <p className="font-bold text-white">インポート完了</p>
                <p className="text-sm text-slate-400">登録: {result.inserted}件　スキップ: {result.skipped}件</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="bg-red-950/40 border border-red-800 rounded-lg p-3 space-y-1">
                <p className="text-xs font-bold text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> スキップされた行
                </p>
                {result.errors.map((e) => (
                  <p key={e.row} className="text-xs text-red-300">{e.row}行目: {e.description} — {e.reason}</p>
                ))}
              </div>
            )}
            <Button onClick={() => { reset(); onClose(); }} className="w-full bg-slate-700 hover:bg-slate-600 text-white">
              閉じる
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
