"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, RefreshCw, ExternalLink, Copy as CopyIcon, AlertTriangle } from "lucide-react";
import { generateShiftDraft, type ShiftDraftResult } from "@/app/actions/ai-secretary";
import { toast } from "sonner";
import Link from "next/link";

/**
 * 「AI シフト案を生成」モーダル。
 * オーナー秘書のシフトリマインダーバナーから起動する。
 * Gemini に来月のスタッフ・休み希望・営業時間を渡してマークダウンの草案を取得し、表示。
 * 自動でDB反映はしない。
 */
export function ShiftDraftDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [result, setResult] = useState<ShiftDraftResult | null>(null);
  const [pending, startTransition] = useTransition();

  const handleGenerate = () => {
    startTransition(async () => {
      const r = await generateShiftDraft();
      setResult(r);
      if (!r.success) toast.error(r.error ?? "生成失敗");
    });
  };

  // 初回オープン時に自動生成
  if (open && !result && !pending) {
    handleGenerate();
  }

  const handleCopy = () => {
    if (!result?.draftMarkdown) return;
    navigator.clipboard.writeText(result.draftMarkdown);
    toast.success("シフト案をクリップボードにコピーしました");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-500" />
            AI シフト案（来月分）
          </DialogTitle>
          <DialogDescription>
            来月のスタッフ・基本勤務時間・承認済み休み希望・営業時間から AI が作成した提案です。<br />
            内容を確認したうえで、必要に応じて手動でスタッフ予定画面に反映してください（自動登録はしません）。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {pending && (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-violet-500 mb-3" />
              <p className="text-sm">来月のシフト案を作成中... 数十秒かかります</p>
            </div>
          )}

          {!pending && result?.success && (
            <div className="space-y-4">
              {/* メタ情報 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <Stat label="対象月" value={result.monthLabel ?? "—"} />
                <Stat label="スタッフ" value={`${result.totalStaff ?? 0}名`} />
                <Stat label="承認済み休み" value={`${result.approvedLeaveCount ?? 0}日`} />
                <Stat label="承認待ち" value={`${result.pendingLeaveCount ?? 0}日`} accent={result.pendingLeaveCount && result.pendingLeaveCount > 0 ? "amber" : undefined} />
              </div>

              {/* マークダウン本文 */}
              <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4 max-h-[50vh] overflow-auto">
                <pre className="whitespace-pre-wrap text-xs md:text-sm font-mono leading-relaxed text-slate-700 dark:text-slate-200">
                  {result.draftMarkdown}
                </pre>
              </div>

              {/* 警告サマリ（あれば） */}
              {result.warnings && result.warnings.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/50 rounded-xl p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-black text-amber-700 dark:text-amber-300 mb-1">AI が気付いた点</p>
                      <ul className="text-[11px] text-amber-800 dark:text-amber-200 space-y-0.5">
                        {result.warnings.slice(0, 5).map((w, i) => (
                          <li key={i}>• {w}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {!pending && result && !result.success && (
            <div className="h-32 flex items-center justify-center text-rose-500 text-sm">
              {result.error ?? "生成に失敗しました"}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={handleGenerate}
            disabled={pending}
            className="gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${pending ? "animate-spin" : ""}`} />
            再生成
          </Button>
          <Button
            variant="outline"
            onClick={handleCopy}
            disabled={!result?.success}
            className="gap-1.5"
          >
            <CopyIcon className="w-4 h-4" />
            コピー
          </Button>
          <Link href="/admin/settings/staff-schedule">
            <Button className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white">
              <ExternalLink className="w-4 h-4" />
              スタッフ予定画面で編集
            </Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "amber" }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${
      accent === "amber"
        ? "bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700/50"
        : "bg-white border-slate-200 dark:bg-slate-900/40 dark:border-slate-700"
    }`}>
      <p className={`text-[10px] uppercase tracking-wider font-bold ${
        accent === "amber" ? "text-amber-700 dark:text-amber-300" : "text-slate-500"
      }`}>{label}</p>
      <p className={`text-sm font-black ${
        accent === "amber" ? "text-amber-800 dark:text-amber-200" : "text-slate-800 dark:text-slate-100"
      }`}>{value}</p>
    </div>
  );
}
