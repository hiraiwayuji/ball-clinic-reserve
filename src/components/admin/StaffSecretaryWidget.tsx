"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { HeartHandshake, RefreshCcw } from "lucide-react";
import { generateStaffBriefing, type StaffBriefing } from "@/app/actions/ai-secretary-multi";
import { getMyPointsToday } from "@/app/actions/security";

export default function StaffSecretaryWidget() {
  const [briefing, setBriefing] = useState<StaffBriefing | null>(null);
  const [points, setPoints] = useState<{ today: number; thisWeek: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    setError(null);
    startTransition(async () => {
      const [b, p] = await Promise.all([generateStaffBriefing(), getMyPointsToday()]);
      if (b.success && b.briefing) setBriefing(b.briefing);
      else setError(b.error ?? "取得に失敗しました");
      setPoints(p);
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="bg-gradient-to-br from-emerald-50 to-sky-50 dark:from-emerald-900/20 dark:to-sky-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-6 shadow-sm">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <HeartHandshake className="w-5 h-5 text-emerald-600 dark:text-emerald-300" />
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">あなた専属 AI 秘書</h2>
        </div>
        <Button onClick={load} variant="ghost" size="sm" disabled={pending}>
          <RefreshCcw className={`w-4 h-4 ${pending ? "animate-spin" : ""}`} />
        </Button>
      </header>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {briefing && (
        <>
          <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-100 whitespace-pre-wrap">
            {briefing.message}
          </p>
          <dl className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <Stat label="今週の対応" value={briefing.metrics.handledLast7Days} />
            <Stat label="リピート率" value={`${briefing.metrics.repeatRate}%`} />
            <Stat label="今日のポイント" value={points?.today ?? 0} subtle="🌟" />
            <Stat label="今週のポイント" value={points?.thisWeek ?? 0} subtle={`通算 ${points?.total ?? 0} pt`} />
          </dl>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, subtle }: { label: string; value: string | number; subtle?: string }) {
  return (
    <div className="rounded-md border bg-white dark:bg-slate-900/40 p-2">
      <dt className="text-[10px] text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-base font-bold text-slate-900 dark:text-slate-100">{value}</dd>
      {subtle && <span className="text-[9px] text-slate-400">{subtle}</span>}
    </div>
  );
}
