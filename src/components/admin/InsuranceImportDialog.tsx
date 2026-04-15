"use client";

import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";
import { bulkImportInsurancePayments, ImportInsuranceRow } from "@/app/actions/sales";
import { parseUploadedFile, downloadExcelTemplate } from "@/lib/excel";
import { toast } from "sonner";

const COLUMNS = [
  { key: "payment_date",   label: "振込日(YYYY/MM/DD)" },
  { key: "insurance_name", label: "保険種別" },
  { key: "amount",         label: "振込金額" },
  { key: "notes",          label: "メモ" },
];

const SAMPLE_ROW = {
  "振込日(YYYY/MM/DD)": "2026/04/20",
  保険種別: "協会けんぽ",
  振込金額: 58400,
  メモ: "4月分療養費",
};

function normalizeDate(v: string): string | null {
  if (!v) return null;
  const s = v.replace(/\//g, "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function parseRows(raw: string[][]): ImportInsuranceRow[] {
  if (raw.length < 2) return [];
  return raw.slice(1).map((row) => ({
    payment_date:   normalizeDate(row[0]) || "",
    insurance_name: row[1]?.trim() || "",
    amount:         parseInt(row[2]?.replace(/,/g, "") || "0", 10),
    notes:          row[3]?.trim() || "",
  }));
}

type Props = { open: boolean; onClose: () => void; onDone: () => void };

export default function InsuranceImportDialog({ open, onClose, onDone }: Props) {
  const [step, setStep]     = useState<"upload" | "preview" | "done">("upload");
  const [rows, setRows]     = useState<ImportInsuranceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: { row: number; name: string; reason: string }[] } | null>(null);
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
      const res = await bulkImportInsurancePayments(rows);
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
            <FileSpreadsheet className="w-5 h-5 text-blue-400" />
            保険入金 Excel/CSV インポート
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Excel（.xlsx）またはCSV（.csv）で一括登録できます
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <button
              onClick={() => downloadExcelTemplate(COLUMNS, SAMPLE_ROW, "保険入金テンプレート.xlsx")}
              className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 underline"
            >
              <Download className="w-4 h-4" /> テンプレートをダウンロード
            </button>
            <div
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-slate-600 hover:border-blue-500 rounded-xl p-10 text-center cursor-pointer transition"
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
                <p key={c.key}>{i + 1}列目: {c.label}{["payment_date","insurance_name","amount"].includes(c.key) ? " ※必須" : ""}</p>
              ))}
              <p className="mt-2">保険種別: 協会けんぽ / 国民健康保険 / 後期高齢者 / 共済組合 / 自賠責 / 労災</p>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">{rows.length}件のデータを確認してください</p>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-700">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    {["振込日", "保険種別", "金額", "メモ"].map((h) => (
                      <TableHead key={h} className="text-slate-400 text-xs">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 50).map((r, i) => (
                    <TableRow key={i} className="border-slate-800">
                      <TableCell className="text-xs text-slate-300">{r.payment_date || <span className="text-red-400">未入力</span>}</TableCell>
                      <TableCell className="text-xs text-slate-300">{r.insurance_name || <span className="text-red-400">未入力</span>}</TableCell>
                      <TableCell className="text-xs text-slate-300">{r.amount > 0 ? `¥${r.amount.toLocaleString()}` : <span className="text-red-400">無効</span>}</TableCell>
                      <TableCell className="text-xs text-slate-300 max-w-[120px] truncate">{r.notes}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={reset} className="border-slate-600 text-slate-300">
                <X className="w-4 h-4 mr-1" /> やり直す
              </Button>
              <Button onClick={handleImport} disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white">
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {rows.length}件を一括登録
              </Button>
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-blue-400" />
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
                  <p key={e.row} className="text-xs text-red-300">{e.row}行目: {e.name} — {e.reason}</p>
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
