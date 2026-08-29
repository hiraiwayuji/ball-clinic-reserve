"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowDownToLine, Check, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  getEntryAuditFindings,
  convertEntryToIncome,
  markEntryChecked,
} from "@/app/actions/entry-audit";
import type { AuditFinding } from "@/lib/entry-audit";

/**
 * 記帳チェック
 *
 * 「入ってきたお金なのに経費になっている」記帳を、自動であぶり出す画面。
 * 2026-08-29 に実際の記帳から2件（子ども医療療養費・診療報酬）見つかったため作った。
 * 見つけるだけでなく、その場で収入に直せるようにしてある。
 */
export default function ExpenseCheckPage() {
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [checkedCount, setCheckedCount] = useState(0);
  const [scannedCount, setScannedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getEntryAuditFindings();
    if (res.success) {
      setFindings(res.findings);
      setCheckedCount(res.checkedCount);
      setScannedCount(res.scannedCount);
    } else {
      toast.error(res.error ?? "取得に失敗しました");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleToIncome = (finding: AuditFinding) => {
    const label = finding.entry.description || "この記帳";
    if (!confirm(`「${label}」を収入に直します。よろしいですか？`)) return;
    setBusyId(finding.entry.id);
    startTransition(async () => {
      const res = await convertEntryToIncome(finding.entry.id);
      setBusyId(null);
      if (res.success) {
        toast.success("収入に直しました");
        load();
      } else {
        toast.error(res.error ?? "変更に失敗しました");
      }
    });
  };

  const handleChecked = (finding: AuditFinding) => {
    setBusyId(finding.entry.id);
    startTransition(async () => {
      const res = await markEntryChecked(finding.entry.id);
      setBusyId(null);
      if (res.success) {
        toast.success("チェック済みにしました");
        load();
      } else {
        toast.error(res.error ?? "更新に失敗しました");
      }
    });
  };

  const highCount = findings.filter((f) => f.level === "high").length;
  const totalAmount = findings.reduce((sum, f) => sum + f.entry.amount, 0);

  return (
    <div className="space-y-6 container mx-auto py-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">記帳チェック</h1>
          <p className="text-slate-500">
            入ってきたお金が経費に入っていないか、同じ領収書を2回入れていないかを自動で調べます
          </p>
        </div>
        <Link href="/admin/expenses">
          <Button variant="outline">経費記帳へ戻る</Button>
        </Link>
      </div>

      <Card className="shadow-sm border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            これまでの記帳を全部調べました
          </CardTitle>
          <CardDescription>
            {loading
              ? "調べています…"
              : findings.length === 0
                ? `${scannedCount}件を調べて、あやしい記帳は見つかりませんでした`
                : `${scannedCount}件のうち 要確認 ${findings.length}件（合計 ${totalAmount.toLocaleString()}円）／うち「ほぼ確実におかしい」 ${highCount}件`}
            {checkedCount > 0 && `　※「これで正しい」と印をつけた記帳 ${checkedCount}件は除いています`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-500 leading-relaxed">
            入金の通知書（子ども医療費の支給決定・国保連の診療報酬など）を経費として登録すると、
            <b className="text-slate-700">経費が増えたうえに収入も減る</b>
            ので、利益が実際より悪く見えます。ここに出たものは、その場で収入に直せます。
          </p>

          {loading ? (
            <div className="h-40 grid place-items-center">
              <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
            </div>
          ) : findings.length === 0 ? (
            <div className="h-40 grid place-items-center text-center text-slate-400 gap-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              <p className="text-sm">今のところ、直したほうがよい記帳はありません</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {findings.map((f, i) => (
                <li
                  key={`${f.entry.id}-${f.rule}-${i}`}
                  className={`rounded-lg border p-4 ${
                    f.level === "high" ? "border-red-200 bg-red-50/40" : "border-amber-200 bg-amber-50/30"
                  }`}
                >
                  <div className="flex items-start gap-3 flex-wrap">
                    <span
                      className={`text-[11px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${
                        f.level === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {f.level === "high" ? "ほぼ確実" : "確認したい"}
                    </span>
                    <div className="flex-1 min-w-[240px] space-y-1">
                      <p className="font-semibold text-slate-900 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                        {f.title}
                      </p>
                      <p className="text-sm text-slate-700">
                        {f.entry.expense_date}　{f.entry.description || "(品名なし)"}
                        <b>{f.entry.amount.toLocaleString()}円</b>
                        <span className="text-slate-400">（区分：{f.entry.category || "未設定"}）</span>
                      </p>
                      <p className="text-xs text-slate-600 leading-relaxed">{f.reason}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {f.action === "to_income" && (
                        <Button
                          size="sm"
                          onClick={() => handleToIncome(f)}
                          disabled={busyId === f.entry.id}
                        >
                          {busyId === f.entry.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <ArrowDownToLine className="w-4 h-4" />
                          )}
                          収入に直す
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleChecked(f)}
                        disabled={busyId === f.entry.id}
                      >
                        <Check className="w-4 h-4" />
                        これで正しい
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
