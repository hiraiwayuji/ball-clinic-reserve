"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, AlertTriangle, RefreshCcw, CalendarDays, Target, Clock } from "lucide-react";
import {
  generateOwnerBriefing,
  type OwnerBriefing,
  type OwnerAlert,
  type AlertCategory,
} from "@/app/actions/ai-secretary-multi";
import TeamTaskLoadPanel from "./TeamTaskLoadPanel";

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
                      {visibleItems.map((a, i) => (
                        <li key={i} className={`text-sm ${meta.tone}`}>
                          ・{a.message}
                        </li>
                      ))}
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
