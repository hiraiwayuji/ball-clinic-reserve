"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sparkles, AlertTriangle, RefreshCcw, CalendarDays, Target, Clock, ArrowRight, ListTodo, X, CheckCircle2 } from "lucide-react";
import {
  generateOwnerBriefing,
  dismissAlertToTask,
  type OwnerBriefing,
  type OwnerAlert,
  type AlertCategory,
} from "@/app/actions/ai-secretary-multi";
import { getMedicalAidReviewReminder, markMedicalAidReviewed } from "@/app/actions/settings";
import TeamTaskLoadPanel from "./TeamTaskLoadPanel";
import { toast } from "sonner";
import { HeartHandshake } from "lucide-react";

// 別メニュー確認の手順
type MultiMenuStep = "confirm" | "billing";

const CATEGORY_META: Record<AlertCategory, { label: string; icon: typeof AlertTriangle; tone: string; toneBg: string }> = {
  urgent:    { label: "緊急",       icon: AlertTriangle, tone: "text-rose-700 dark:text-rose-300",     toneBg: "bg-rose-100 dark:bg-rose-900/40 border-rose-300" },
  thisWeek:  { label: "今週",       icon: CalendarDays,  tone: "text-amber-800 dark:text-amber-200",   toneBg: "bg-amber-100 dark:bg-amber-900/40 border-amber-300" },
  thisMonth: { label: "今月",       icon: Target,        tone: "text-sky-800 dark:text-sky-200",       toneBg: "bg-sky-100 dark:bg-sky-900/40 border-sky-300" },
  longTerm:  { label: "長期フォロー", icon: Clock,        tone: "text-violet-800 dark:text-violet-200", toneBg: "bg-violet-100 dark:bg-violet-900/40 border-violet-300" },
};

const CATEGORY_ORDER: AlertCategory[] = ["urgent", "thisWeek", "thisMonth", "longTerm"];

export default function OwnerSecretaryWidget() {
  const [briefing, setBriefing] = useState<OwnerBriefing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Record<AlertCategory, boolean>>({
    urgent: true,
    thisWeek: true,
    thisMonth: false,
    longTerm: false,
  });
  const [selectedAlert, setSelectedAlert] = useState<OwnerAlert | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [multiMenuStep, setMultiMenuStep] = useState<MultiMenuStep>("confirm");
  // 年度替わりの「医療費助成 見直し」リマインド
  const [aidReminder, setAidReminder] = useState<{ needsReview: boolean; fiscalYear: number } | null>(null);

  useEffect(() => {
    getMedicalAidReviewReminder()
      .then((r) => setAidReminder({ needsReview: r.needsReview, fiscalYear: r.fiscalYear }))
      .catch(() => {});
  }, []);

  async function handleAidReviewed() {
    setAidReminder((prev) => (prev ? { ...prev, needsReview: false } : prev));
    await markMedicalAidReviewed().catch(() => {});
    toast.success("医療費助成の確認を記録しました");
  }

  async function handleDismissToTask() {
    if (!selectedAlert?.id) {
      toast.error("このアラートはタスク化に対応していません");
      return;
    }
    setDismissing(true);
    try {
      const priority: "high" | "medium" | "low" =
        selectedAlert.category === "urgent" ? "high" :
        selectedAlert.category === "longTerm" ? "low" : "medium";
      const res = await dismissAlertToTask({
        alertId: selectedAlert.id,
        alertMessage: selectedAlert.message,
        priority,
      });
      if (res.success) {
        toast.success("タスクに登録しました（/admin/tasks で確認できます）");
        // ローカルで該当 alert を即時除外
        setBriefing(prev => {
          if (!prev?.alertsV2) return prev;
          return {
            ...prev,
            alertsV2: prev.alertsV2.filter(a => a.id !== selectedAlert.id),
            alerts: prev.alerts.filter(m => m !== selectedAlert.message),
          };
        });
        setSelectedAlert(null);
      } else {
        toast.error(res.error || "タスク登録に失敗しました");
      }
    } finally {
      setDismissing(false);
    }
  }

  function load() {
    setError(null);
    startTransition(async () => {
      const res = await generateOwnerBriefing();
      if (res.success && res.briefing) setBriefing(res.briefing);
      else setError(res.error ?? "取得に失敗しました");
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // alertsV2 がある場合はカテゴリ別、ない場合は従来通り
  const grouped: Record<AlertCategory, OwnerAlert[]> = {
    urgent: [],
    thisWeek: [],
    thisMonth: [],
    longTerm: [],
  };
  for (const a of briefing?.alertsV2 ?? []) {
    grouped[a.category].push(a);
  }
  const useV2 = (briefing?.alertsV2?.length ?? 0) > 0;
  const totalCount = useV2 ? briefing!.alertsV2!.length : briefing?.alerts.length ?? 0;

  return (
    <section className="bg-gradient-to-br from-amber-50 to-rose-50 dark:from-amber-900/20 dark:to-rose-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6 shadow-sm">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-300" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">オーナー秘書 — 今週のひと言</h2>
          {totalCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 text-xs font-bold">
              {totalCount}
            </span>
          )}
        </div>
        <Button onClick={load} variant="ghost" size="sm" disabled={pending}>
          <RefreshCcw className={`w-4 h-4 mr-1 ${pending ? "animate-spin" : ""}`} />
          {pending ? "分析中" : "再生成"}
        </Button>
      </header>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {/* 年度替わりの医療費助成 見直しリマインド（4月以降・当年度未確認のとき） */}
      {aidReminder?.needsReview && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 px-4 py-3">
          <HeartHandshake className="w-5 h-5 text-emerald-600 dark:text-emerald-300 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
              新年度です。子ども医療費助成の制度変更はありませんか？
            </p>
            <p className="text-xs text-emerald-700/90 dark:text-emerald-300/80 mt-0.5">
              市町村ごとの窓口負担（0円／月600円など）は年度替わりで変わることがあります。設定を確認してください。
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Link
                href="/admin/settings"
                className="inline-flex items-center gap-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                設定で確認する <ArrowRight className="w-3 h-3" />
              </Link>
              <button
                type="button"
                onClick={handleAidReviewed}
                className="text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:underline"
              >
                変更なし・確認した
              </button>
            </div>
          </div>
        </div>
      )}

      {briefing && (
        <>
          <p className="text-base leading-relaxed text-slate-800 dark:text-slate-100 whitespace-pre-wrap">
            {briefing.message}
          </p>

          {useV2 ? (
            <div className="mt-4 space-y-2">
              {CATEGORY_ORDER.map((cat) => {
                const items = grouped[cat];
                if (items.length === 0) return null;
                const meta = CATEGORY_META[cat];
                const Icon = meta.icon;
                const isExpanded = expanded[cat];
                const VISIBLE = 3;
                const visibleItems = isExpanded ? items : items.slice(0, VISIBLE);
                const hiddenCount = items.length - visibleItems.length;
                return (
                  <div key={cat} className={`rounded-xl border ${meta.toneBg}`}>
                    <button
                      type="button"
                      onClick={() => setExpanded((p) => ({ ...p, [cat]: !p[cat] }))}
                      className="w-full flex items-center justify-between px-3 py-2"
                      aria-expanded={isExpanded}
                    >
                      <span className={`flex items-center gap-2 text-sm font-bold ${meta.tone}`}>
                        <Icon className="w-4 h-4" />
                        {meta.label}
                        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-white/70 dark:bg-black/30 text-xs">
                          {items.length}
                        </span>
                      </span>
                      <span className={`text-xs ${meta.tone}`}>{isExpanded ? "折りたたむ" : items.length > VISIBLE ? `すべて表示 (+${items.length - VISIBLE})` : ""}</span>
                    </button>
                    <ul className="px-3 pb-2 space-y-1">
                      {visibleItems.map((a, i) => {
                        const clickable = !!a.id || !!a.actionUrl;
                        return (
                          <li key={i}>
                            <button
                              type="button"
                              onClick={() => { if (clickable) { setSelectedAlert(a); setMultiMenuStep("confirm"); } }}
                              className={`w-full text-left text-sm ${meta.tone} ${clickable ? "hover:bg-white/40 dark:hover:bg-black/20 rounded px-1 -mx-1 transition-colors cursor-pointer" : "cursor-default"}`}
                              disabled={!clickable}
                            >
                              ・{a.message}
                              {clickable && <span className="ml-1 opacity-50 text-xs">›</span>}
                            </button>
                          </li>
                        );
                      })}
                      {!isExpanded && hiddenCount > 0 && (
                        <li className={`text-xs italic ${meta.tone}`}>+{hiddenCount} 件</li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            briefing.alerts.length > 0 && (
              <ul className="mt-4 space-y-1">
                {briefing.alerts.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            )
          )}

          <dl className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <Stat label="予約作成" value={briefing.metrics.last7DaysAppointments} />
            <Stat label="キャンセル率" value={`${briefing.metrics.cancelRate}%`} />
            <Stat
              label="売上 (現金)"
              value={`¥${briefing.metrics.last7DaysRevenue.toLocaleString()}`}
            />
            <Stat
              label="staff/admin による削除"
              value={briefing.metrics.last7DaysDeletedByStaff}
              warn={briefing.metrics.last7DaysDeletedByStaff >= 3}
            />
          </dl>

          {/* チームタスク負荷ウィジェット */}
          <div className="mt-4">
            <TeamTaskLoadPanel />
          </div>
        </>
      )}

      {/* アラート詳細モーダル */}
      {selectedAlert && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => !dismissing && setSelectedAlert(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {(() => {
                  const meta = CATEGORY_META[selectedAlert.category];
                  const Icon = meta.icon;
                  return (
                    <>
                      <Icon className={`w-5 h-5 ${meta.tone} shrink-0`} />
                      <h3 className={`text-base font-bold ${meta.tone}`}>{meta.label}</h3>
                    </>
                  );
                })()}
              </div>
              <button
                type="button"
                onClick={() => !dismissing && setSelectedAlert(null)}
                className="text-slate-400 hover:text-slate-600 shrink-0"
                disabled={dismissing}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 別メニュー確認フロー */}
            {selectedAlert.multiMenuData ? (
              <div className="space-y-4">
                {multiMenuStep === "confirm" ? (
                  <>
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 space-y-1">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        {selectedAlert.multiMenuData.name}様
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{selectedAlert.multiMenuData.date}</p>
                      {selectedAlert.multiMenuData.times.map((t, i) => (
                        <p key={i} className="text-xs text-slate-700 dark:text-slate-300">
                          {t}　{selectedAlert.multiMenuData!.courses[i] || "（メニュー不明）"}
                        </p>
                      ))}
                    </div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      この2件は同一人物の別メニュー（ダブル施術・水素など）ですか？
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setMultiMenuStep("billing")}
                        className="py-2.5 rounded-xl text-sm font-bold bg-blue-500 hover:bg-blue-600 text-white transition"
                      >
                        はい
                      </button>
                      <Link
                        href={selectedAlert.actionUrl ?? "#"}
                        onClick={() => setSelectedAlert(null)}
                        className="py-2.5 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition text-center"
                      >
                        いいえ（確認する）
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      水素・ダブル施術の分の会計は¥0ですか？
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      確認後、売上記帳で¥0入力またはスキップしてください。
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          toast.success(`${selectedAlert.multiMenuData!.name}様を同一人物・別メニューとして処理しました。¥0で会計してください。`);
                          setBriefing((prev) => {
                            if (!prev?.alertsV2) return prev;
                            return {
                              ...prev,
                              alertsV2: prev.alertsV2.filter((a) => a.id !== selectedAlert.id),
                              alerts: prev.alerts.filter((m) => m !== selectedAlert.message),
                            };
                          });
                          setSelectedAlert(null);
                        }}
                        className="py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition"
                      >
                        はい（¥0）
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          toast.success(`${selectedAlert.multiMenuData!.name}様を同一人物・別メニューとして処理しました。通常通り会計してください。`);
                          setBriefing((prev) => {
                            if (!prev?.alertsV2) return prev;
                            return {
                              ...prev,
                              alertsV2: prev.alertsV2.filter((a) => a.id !== selectedAlert.id),
                              alerts: prev.alerts.filter((m) => m !== selectedAlert.message),
                            };
                          });
                          setSelectedAlert(null);
                        }}
                        className="py-2.5 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                      >
                        いいえ（別途会計）
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMultiMenuStep("confirm")}
                      className="text-xs text-slate-400 hover:text-slate-600 w-full text-center"
                    >
                      ← 戻る
                    </button>
                  </>
                )}
              </div>
            ) : (
              /* 通常アラートの詳細 */
              <>
                <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed">
                  {selectedAlert.message}
                </p>
                <div className="grid grid-cols-1 gap-2 pt-2">
                  {selectedAlert.actionUrl && (
                    <Link
                      href={selectedAlert.actionUrl}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors"
                      onClick={() => setSelectedAlert(null)}
                    >
                      <ArrowRight className="w-4 h-4" />
                      解決ページへ移動
                    </Link>
                  )}
                  {selectedAlert.id && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleDismissToTask}
                      disabled={dismissing}
                      className="gap-2"
                    >
                      <ListTodo className="w-4 h-4" />
                      {dismissing ? "登録中..." : "今は解決しない（タスクに降格）"}
                    </Button>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center pt-1">
                    「タスクに降格」を選ぶと /admin/tasks に登録され、ここからは消えます
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${warn ? "border-rose-300 bg-rose-50 dark:bg-rose-900/20" : "bg-white dark:bg-slate-900/40"}`}>
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className={`text-lg font-bold ${warn ? "text-rose-700 dark:text-rose-300" : "text-slate-900 dark:text-slate-100"}`}>
        {value}
      </dd>
    </div>
  );
}
