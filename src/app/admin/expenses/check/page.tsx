"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowDownToLine, CalendarDays, Check, CheckCircle2, Loader2, ShieldCheck, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  getEntryAuditFindings,
  convertEntryToIncome,
  markEntryChecked,
} from "@/app/actions/entry-audit";
import { getMyRole } from "@/app/actions/auth";
import { updateExpense, deleteExpense } from "@/app/actions/sales";
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
  // 直せるのは院長先生（owner）と管理者だけ。受付には押せないボタンを見せない。
  const [canFix, setCanFix] = useState(false);
  // 日付を直しているところ（記帳のid）と、入力中の日付。
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState("");
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
    getMyRole().then((role) => setCanFix(role === "owner" || role === "admin"));
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

  const handleSaveDate = (finding: AuditFinding) => {
    if (!editingDate) {
      toast.error("日付を入れてください");
      return;
    }
    setBusyId(finding.entry.id);
    startTransition(async () => {
      const res = await updateExpense(finding.entry.id, { expense_date: editingDate });
      setBusyId(null);
      if (res.success) {
        toast.success("日付を直しました");
        setEditingDateId(null);
        load();
      } else {
        toast.error(res.error ?? "変更に失敗しました");
      }
    });
  };

  const handleDelete = (finding: AuditFinding) => {
    const label = finding.entry.description || "この記帳";
    if (!confirm(`「${label}　${finding.entry.amount.toLocaleString()}円」を消します。
元に戻せません。よろしいですか？`)) return;
    setBusyId(finding.entry.id);
    startTransition(async () => {
      const res = await deleteExpense(finding.entry.id);
      setBusyId(null);
      if (res.success) {
        toast.success("消しました");
        load();
      } else {
        toast.error(res.error ?? "削除に失敗しました");
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
          <div className="text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
            <p className="font-bold text-slate-700">出てきたものは、この4つのどれかで片づきます。</p>
            <p>① 見て問題なければ <b>「これで正しい」</b> … 次から出ません</p>
            <p>② 入ってきたお金だった <b>「収入に直す」</b> … 経費から収入に移します</p>
            <p>③ 日付が違う <b>「日付を直す」</b> … 領収書の日付を入れて保存します</p>
            <p>④ 二重・まるごと記帳だった <b>「消す」</b> … その1件を消します（元に戻せません）</p>
          </div>

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
                      {!canFix && (
                        <span className="text-xs text-slate-500 self-center">
                          直せるのは院長先生だけです
                        </span>
                      )}
                      {canFix && f.action === "to_income" && (
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
                      {canFix && editingDateId === f.entry.id ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Input
                            type="date"
                            className="w-[160px]"
                            value={editingDate}
                            onChange={(e) => setEditingDate(e.target.value)}
                          />
                          <Button
                            size="sm"
                            onClick={() => handleSaveDate(f)}
                            disabled={busyId === f.entry.id}
                          >
                            {busyId === f.entry.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                            保存
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingDateId(null)}>
                            <X className="w-4 h-4" />
                            やめる
                          </Button>
                        </div>
                      ) : (
                        canFix && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingDateId(f.entry.id);
                                setEditingDate(f.entry.expense_date);
                              }}
                              disabled={busyId === f.entry.id}
                            >
                              <CalendarDays className="w-4 h-4" />
                              日付を直す
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => handleDelete(f)}
                              disabled={busyId === f.entry.id}
                            >
                              <Trash2 className="w-4 h-4" />
                              消す
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleChecked(f)}
                              disabled={busyId === f.entry.id}
                            >
                              <Check className="w-4 h-4" />
                              これで正しい
                            </Button>
                          </>
                        )
                      )}
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
