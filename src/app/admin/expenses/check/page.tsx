"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ImageOff,
  Loader2,
  Receipt,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import { toast } from "sonner";
import {
  getEntryAuditFindings,
  convertEntryToIncome,
  convertEntryToExpense,
  markEntryChecked,
} from "@/app/actions/entry-audit";
import { getMyRole } from "@/app/actions/auth";
import { updateExpense, deleteExpense } from "@/app/actions/sales";
import type { AuditFinding } from "@/lib/entry-audit";

/**
 * 記帳チェック
 *
 * 「経費と収入を取り違えている」記帳を、自動であぶり出す画面。
 * 2026-08-29 に実際の記帳から2件（子ども医療療養費・診療報酬）が
 * 収入なのに経費として登録されているのが見つかったため作った。
 *
 * 2026-08-30、「経費なのか収入なのか、何を確認しているのか分からない」との指摘を受けて作り直した：
 * ・各カードに「今：経費」「今：収入」の色つきバッジを必ず出す（現在の状態を先に見せる）
 * ・「直すと → 収入になります／経費になります」を矢印で明示する
 * ・逆方向（収入に登録された買い物）も見るようにした（見つけるだけでなく、その場で直せる）
 */
export default function ExpenseCheckPage() {
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [checkedCount, setCheckedCount] = useState(0);
  const [scannedCount, setScannedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  // 直せるのは院長先生（owner）と管理者だけ。受付には押せないボタンを見せない。
  const [canFix, setCanFix] = useState(false);
  // 日付を直しているところ（押した行のキー）と、入力中の日付。
  // 同じ記帳が2つの規則で2行に出ることがあるので、記帳idではなく行ごとのキーで持つ。
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState("");
  // 見ている領収書画像（クリックで大きく表示するため）。null なら閉じている。
  const [viewingImage, setViewingImage] = useState<{ url: string; label: string } | null>(null);
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
    if (!confirm(`「${label}」を経費から収入に直します。よろしいですか？`)) return;
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

  const handleToExpense = (finding: AuditFinding) => {
    const label = finding.entry.description || "この記帳";
    if (!confirm(`「${label}」を収入から経費に直します。よろしいですか？`)) return;
    setBusyId(finding.entry.id);
    startTransition(async () => {
      const res = await convertEntryToExpense(finding.entry.id);
      setBusyId(null);
      if (res.success) {
        toast.success("経費に直しました");
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
    if (
      !confirm(`「${label}　${finding.entry.amount.toLocaleString()}円」を消します。
元に戻せません。よろしいですか？`)
    )
      return;
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
            経費と収入を取り違えていないか、同じ領収書を2回入れていないかを自動で調べます
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
          <div className="text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
            <p className="font-bold text-slate-700">
              カードの左上に「今：経費」「今：収入」と出ます。まずそれを見てください。
            </p>
            <p className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-sky-100 text-sky-700 border border-sky-200">今：経費</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-emerald-100 text-emerald-700 border border-emerald-200">収入</span>
              <span>… 入ってきたお金だったら「収入に直す」</span>
            </p>
            <p className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-emerald-100 text-emerald-700 border border-emerald-200">今：収入</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-sky-100 text-sky-700 border border-sky-200">経費</span>
              <span>… 買い物・支払いだったら「経費に直す」</span>
            </p>
            <p>
              見て問題なければ <b>「これで正しい」</b>（次から出ません）／日付の読み違いは <b>「日付を直す」</b>
              ／二重・まるごと記帳は <b>「消す」</b>
            </p>
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
              {findings.map((f, i) => {
                const rowKey = `${f.entry.id}-${f.rule}-${i}`;
                const isIncomeNow = f.currentType === "income";
                return (
                  <li
                    key={rowKey}
                    className={`rounded-lg border p-4 ${
                      f.level === "high" ? "border-red-200 bg-red-50/40" : "border-amber-200 bg-amber-50/30"
                    }`}
                  >
                    <div className="flex items-start gap-3 flex-wrap">
                      <div className="flex flex-col gap-1.5 items-start shrink-0">
                        <span className={isIncomeNow ? "inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-emerald-100 text-emerald-700 border border-emerald-200" : "inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-sky-100 text-sky-700 border border-sky-200"}>
                          今：{isIncomeNow ? "収入" : "経費"}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${
                            f.level === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {f.level === "high" ? "ほぼ確実" : "確認したい"}
                        </span>
                      </div>
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
                        {f.entry.image_url ? (
                          <button
                            type="button"
                            onClick={() =>
                              setViewingImage({
                                url: f.entry.image_url as string,
                                label: `${f.entry.expense_date}　${f.entry.description || "(品名なし)"}　${f.entry.amount.toLocaleString()}円`,
                              })
                            }
                            className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline pt-0.5"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            この記帳の写真・領収書を見る
                          </button>
                        ) : (
                          <p className="inline-flex items-center gap-1 text-xs text-slate-400 pt-0.5">
                            <ImageOff className="w-3.5 h-3.5" />
                            写真・領収書はありません（手入力の記帳）
                          </p>
                        )}
                        {(f.action === "to_income" || f.action === "to_expense") && (
                          <p className="text-xs font-bold flex items-center gap-1.5 pt-0.5">
                            <ArrowLeftRight className="w-3.5 h-3.5 text-slate-400" />
                            直すと：
                            <span className={f.action === "to_income" ? "inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-emerald-100 text-emerald-700 border border-emerald-200" : "inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-sky-100 text-sky-700 border border-sky-200"}>
                              {f.action === "to_income" ? "収入" : "経費"}
                            </span>
                            になります
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {!canFix && (
                          <span className="text-xs text-slate-500 self-center">
                            直せるのは院長先生だけです
                          </span>
                        )}
                        {canFix && f.action === "to_income" && (
                          <Button size="sm" onClick={() => handleToIncome(f)} disabled={busyId === f.entry.id}>
                            {busyId === f.entry.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <ArrowLeftRight className="w-4 h-4" />
                            )}
                            収入に直す
                          </Button>
                        )}
                        {canFix && f.action === "to_expense" && (
                          <Button size="sm" onClick={() => handleToExpense(f)} disabled={busyId === f.entry.id}>
                            {busyId === f.entry.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <ArrowLeftRight className="w-4 h-4" />
                            )}
                            経費に直す
                          </Button>
                        )}
                        {canFix && editingDateId === rowKey ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Input
                              type="date"
                              className="w-[160px]"
                              value={editingDate}
                              onChange={(e) => setEditingDate(e.target.value)}
                            />
                            <Button size="sm" onClick={() => handleSaveDate(f)} disabled={busyId === f.entry.id}>
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
                              {!isIncomeNow && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingDateId(rowKey);
                                    setEditingDate(f.entry.expense_date);
                                  }}
                                  disabled={busyId === f.entry.id}
                                >
                                  <CalendarDays className="w-4 h-4" />
                                  日付を直す
                                </Button>
                              )}
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
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {viewingImage && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setViewingImage(null)}
        >
          <div
            className="bg-white rounded-lg overflow-hidden max-w-2xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b">
              <p className="text-sm font-semibold text-slate-800">{viewingImage.label}</p>
              <button
                type="button"
                aria-label="閉じる"
                onClick={() => setViewingImage(null)}
                className="p-1.5 rounded-full hover:bg-slate-100"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="relative flex-1 min-h-[300px] bg-slate-50">
              <Image
                src={viewingImage.url}
                alt="領収書・記帳の写真"
                fill
                className="object-contain"
                sizes="(max-width: 768px) 100vw, 640px"
              />
            </div>
            <div className="p-3 border-t text-center">
              <a
                href={viewingImage.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-700 hover:underline"
              >
                新しいタブで大きく開く
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
