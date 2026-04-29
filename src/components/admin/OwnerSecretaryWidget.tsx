"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, AlertTriangle, RefreshCcw } from "lucide-react";
import { generateOwnerBriefing, type OwnerBriefing } from "@/app/actions/ai-secretary-multi";

export default function OwnerSecretaryWidget() {
  const [briefing, setBriefing] = useState<OwnerBriefing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  return (
    <section className="bg-gradient-to-br from-amber-50 to-rose-50 dark:from-amber-900/20 dark:to-rose-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6 shadow-sm">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-300" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">オーナー秘書 — 今週のひと言</h2>
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

          {briefing.alerts.length > 0 && (
            <ul className="mt-4 space-y-1">
              {briefing.alerts.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
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
