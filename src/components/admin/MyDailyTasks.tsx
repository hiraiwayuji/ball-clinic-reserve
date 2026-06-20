"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Circle, ListTodo, Loader2, FileText, Megaphone, Sparkles, Brush } from "lucide-react";
import { toast } from "sonner";
import { getMyDayTasks, toggleTaskDone, type DailyTask, type TaskKind } from "@/app/actions/staff-daily-tasks";

const KIND_ICON: Record<TaskKind, typeof FileText> = {
  karte: FileText,
  sns: Megaphone,
  cleaning: Brush,
  morning: Sparkles,
  manual: ListTodo,
  other: ListTodo,
};

const KIND_COLOR: Record<TaskKind, string> = {
  karte: "text-blue-500",
  sns: "text-pink-500",
  cleaning: "text-emerald-500",
  morning: "text-amber-500",
  manual: "text-slate-400",
  other: "text-slate-400",
};

function todayJst(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split("T")[0];
}

export default function MyDailyTasks() {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();
  const dateStr = todayJst();

  const load = () => {
    getMyDayTasks(dateStr)
      .then((r) => { if (r.success) setTasks(r.tasks ?? []); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const toggle = (t: DailyTask) => {
    const next = t.status !== "done";
    // 楽観的更新
    setTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, status: next ? "done" : "pending" } : x));
    startTransition(async () => {
      const r = await toggleTaskDone(t.id, next);
      if (!r.success) {
        toast.error(r.error ?? "更新に失敗しました");
        load();
      }
    });
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
      </div>
    );
  }

  if (tasks.length === 0) return null;

  const remaining = tasks.filter((t) => t.status !== "done").length;
  const done = tasks.length - remaining;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-500" />
          <span className="text-sm font-black text-slate-800 dark:text-slate-100">今日やること</span>
          <span className="text-[11px] text-slate-400">AI秘書から</span>
        </div>
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
          {remaining > 0 ? `あと${remaining}件` : `全${tasks.length}件完了 🎉`}
        </span>
      </div>

      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {tasks.map((t) => {
          const Icon = KIND_ICON[t.task_kind] ?? ListTodo;
          const checked = t.status === "done";
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => toggle(t)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${checked ? "bg-emerald-50/50 dark:bg-emerald-950/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"}`}
              >
                {checked
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  : <Circle className="w-5 h-5 text-slate-300 shrink-0" />}
                <Icon className={`w-4 h-4 shrink-0 ${KIND_COLOR[t.task_kind] ?? "text-slate-400"}`} />
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-semibold ${checked ? "line-through text-slate-400" : "text-slate-700 dark:text-slate-200"}`}>
                    {t.title}
                  </span>
                  {t.description && (
                    <p className={`text-xs ${checked ? "text-slate-300" : "text-slate-500 dark:text-slate-400"}`}>{t.description}</p>
                  )}
                </div>
                {t.priority === "high" && !checked && (
                  <span className="shrink-0 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5">優先</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {remaining === 0 && done > 0 && (
        <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/20 text-center text-xs font-bold text-emerald-700 dark:text-emerald-300">
          今日のタスクは全部おわりました！おつかれさまです ✨
        </div>
      )}
    </div>
  );
}
