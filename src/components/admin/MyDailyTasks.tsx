"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Circle, ListTodo, Loader2, FileText, Megaphone, Sparkles, Brush, Plus, Check, X } from "lucide-react";
import { toast } from "sonner";
import { getMyDayTasks, toggleTaskDone, addMyTask, TASK_TEMPLATES, type DailyTask, type TaskKind } from "@/app/actions/staff-daily-tasks";

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
  const [showAdd, setShowAdd] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const dateStr = todayJst();

  const load = () => {
    getMyDayTasks(dateStr)
      .then((r) => { if (r.success) setTasks(r.tasks ?? []); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // テンプレ or 自由入力で自分のタスクを追加。done=true なら「やった記録」として即完了。
  const add = async (title: string, kind: TaskKind, done: boolean) => {
    if (!title.trim()) return;
    setAdding(true);
    const r = await addMyTask({ title: title.trim(), task_kind: kind, done, dateStr });
    setAdding(false);
    if (r.success) {
      toast.success(done ? "やった記録を残しました ✨" : "タスクを追加しました");
      setAddTitle("");
      load();
    } else {
      toast.error(r.error ?? "追加に失敗しました");
    }
  };

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

      {tasks.length === 0 && (
        <div className="px-4 py-4 text-center text-sm text-slate-400">
          今日のタスクはまだありません。<br className="sm:hidden" />下から自分でも追加できます。
        </div>
      )}

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

      {/* 自分でタスクを追加（「やった記録」もここから） */}
      <div className="border-t border-slate-200 dark:border-slate-700 p-3 space-y-2 bg-slate-50/50 dark:bg-slate-800/20">
        {!showAdd ? (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 text-sm hover:bg-white dark:hover:bg-slate-800/40"
          >
            <Plus className="w-4 h-4" />自分でタスク・やった記録を追加
          </button>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">よく使う業務（タップで追加）</span>
              <button type="button" onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TASK_TEMPLATES.map((tpl) => (
                <span key={tpl.title} className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 overflow-hidden">
                  <button
                    type="button"
                    disabled={adding}
                    onClick={() => add(tpl.title, tpl.kind, false)}
                    className="px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                    title="やることに追加"
                  >
                    {tpl.title}
                  </button>
                  <button
                    type="button"
                    disabled={adding}
                    onClick={() => add(tpl.title, tpl.kind, true)}
                    className="px-1.5 py-1 border-l border-slate-200 dark:border-slate-600 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                    title="もうやった（完了として記録）"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && addTitle.trim()) add(addTitle, "other", false); }}
                placeholder="自由に入力（例：物品補充）"
                className="flex-1 h-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm"
              />
              <button type="button" disabled={adding || !addTitle.trim()} onClick={() => add(addTitle, "other", false)} className="h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">追加</button>
              <button type="button" disabled={adding || !addTitle.trim()} onClick={() => add(addTitle, "other", true)} className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50" title="もうやった">やった</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
