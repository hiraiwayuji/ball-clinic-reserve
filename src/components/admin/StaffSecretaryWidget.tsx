"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HeartHandshake, RefreshCcw, ListTodo, AlertTriangle } from "lucide-react";
import { generateStaffBriefing, type StaffBriefing } from "@/app/actions/ai-secretary-multi";
import { getMyPointsToday } from "@/app/actions/security";
import { listTasks, type StaffTaskRow } from "@/app/actions/staff-schedule";

export default function StaffSecretaryWidget() {
  const [briefing, setBriefing] = useState<StaffBriefing | null>(null);
  const [points, setPoints] = useState<{ today: number; thisWeek: number; total: number } | null>(null);
  const [myTasks, setMyTasks] = useState<StaffTaskRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    setError(null);
    startTransition(async () => {
      const [b, p, t] = await Promise.all([
        generateStaffBriefing(),
        getMyPointsToday(),
        listTasks({ status: "pending", staff_id: "me" }),
      ]);
      if (b.success && b.briefing) setBriefing(b.briefing);
      else setError(b.error ?? "取得に失敗しました");
      setPoints(p);
      if (t.success) setMyTasks(t.rows ?? []);
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const overdueTasks = myTasks.filter((t) => t.due_date && t.due_date < todayStr);
  const upcomingTasks = myTasks.filter((t) => !t.due_date || t.due_date >= todayStr);
  const visibleTasks = [
    ...overdueTasks,
    ...upcomingTasks.slice(0, Math.max(0, 3 - overdueTasks.length)),
  ].slice(0, 3);
  const hiddenCount = Math.max(0, myTasks.length - visibleTasks.length);

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

          {/* あなたの未完了タスク */}
          {myTasks.length > 0 && (
            <div className="mt-4 rounded-xl bg-white/70 dark:bg-slate-900/40 border border-emerald-200 dark:border-emerald-800 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                  <ListTodo className="w-3.5 h-3.5 text-emerald-600" />
                  あなたの未完了タスク {myTasks.length} 件
                  {overdueTasks.length > 0 && (
                    <span className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
                      <AlertTriangle className="w-3 h-3" />
                      期限超過 {overdueTasks.length}
                    </span>
                  )}
                </div>
                <Link href="/admin/settings/staff-schedule?tab=tasks" className="text-[10px] text-indigo-600 hover:underline">
                  全部見る →
                </Link>
              </div>
              <ul className="space-y-1">
                {visibleTasks.map((t) => {
                  const isOverdue = t.due_date && t.due_date < todayStr;
                  return (
                    <li key={t.id} className="text-xs flex items-center justify-between gap-2">
                      <span className={isOverdue ? "text-rose-700 font-bold truncate" : "text-slate-700 dark:text-slate-200 truncate"}>
                        ・{t.title}
                      </span>
                      {t.due_date && (
                        <span className={isOverdue ? "text-[10px] text-rose-700 font-bold shrink-0" : "text-[10px] text-slate-500 shrink-0"}>
                          {t.due_date.slice(5).replace("-", "/")}
                        </span>
                      )}
                    </li>
                  );
                })}
                {hiddenCount > 0 && (
                  <li className="text-[10px] italic text-slate-500">他 {hiddenCount} 件</li>
                )}
              </ul>
            </div>
          )}

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
