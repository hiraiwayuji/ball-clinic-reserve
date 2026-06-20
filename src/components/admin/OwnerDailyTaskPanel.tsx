"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Sparkles, Loader2, Check, CheckCheck, Trash2, Plus, X, FileText, Megaphone, Brush, ListTodo, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  listDailyTasksForDate, generateDailyTasks, approveTask, approveAllTasksForDate,
  toggleTaskDone, addManualTask, deleteTask,
  type DailyTask, type TaskKind, type TaskPriority,
} from "@/app/actions/staff-daily-tasks";
import { listActiveStaff, type StaffOption } from "@/app/actions/staff-schedule";

const KIND_ICON: Record<TaskKind, typeof FileText> = {
  karte: FileText, sns: Megaphone, cleaning: Brush, morning: Sparkles, manual: ListTodo, other: ListTodo,
};

function todayJst(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split("T")[0];
}

export default function OwnerDailyTaskPanel() {
  const [dateStr] = useState(todayJst());
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [, startTransition] = useTransition();

  // 手動追加フォーム
  const [showAdd, setShowAdd] = useState(false);
  const [addStaffId, setAddStaffId] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addPriority, setAddPriority] = useState<TaskPriority>("normal");

  const load = () => {
    listDailyTasksForDate(dateStr)
      .then((r) => { if (r.success) setTasks(r.tasks ?? []); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    listActiveStaff().then((r) => {
      if (r.success && r.staff) { setStaff(r.staff); if (r.staff[0]) setAddStaffId(r.staff[0].id); }
    });
    // eslint-disable-next-line
  }, []);

  const pending = tasks.filter((t) => !t.approved);
  const approved = tasks.filter((t) => t.approved);

  // スタッフ別グルーピング
  const byStaff = useMemo(() => {
    const m = new Map<string, DailyTask[]>();
    for (const t of tasks) {
      const key = t.staff_name ?? "未割当";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    }
    return Array.from(m.entries());
  }, [tasks]);

  const generate = async () => {
    setGenerating(true);
    const r = await generateDailyTasks(dateStr);
    setGenerating(false);
    if (r.success) {
      toast.success(r.created ? `${r.created}件のタスク案を作りました（承認待ち）` : "出勤予定の先生がいないか、提案がありませんでした");
      load();
    } else {
      toast.error(r.error ?? "生成に失敗しました");
    }
  };

  const doApprove = (id: string) => {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, approved: true } : t));
    startTransition(async () => {
      const r = await approveTask(id);
      if (!r.success) { toast.error(r.error ?? "承認に失敗"); load(); }
    });
  };

  const doApproveAll = async () => {
    const r = await approveAllTasksForDate(dateStr);
    if (r.success) { toast.success(`${r.approved ?? 0}件を承認しました（先生に表示されます）`); load(); }
    else toast.error(r.error ?? "承認に失敗しました");
  };

  const doToggle = (t: DailyTask) => {
    const next = t.status !== "done";
    setTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, status: next ? "done" : "pending" } : x));
    startTransition(async () => {
      const r = await toggleTaskDone(t.id, next);
      if (!r.success) { toast.error(r.error ?? "更新に失敗"); load(); }
    });
  };

  const doDelete = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    startTransition(async () => {
      const r = await deleteTask(id);
      if (!r.success) { toast.error(r.error ?? "削除に失敗"); load(); }
    });
  };

  const doAdd = async () => {
    if (!addStaffId || !addTitle.trim()) return;
    const r = await addManualTask({ staff_id: addStaffId, title: addTitle.trim(), due_date: dateStr, priority: addPriority });
    if (r.success) { toast.success("タスクを追加しました"); setAddTitle(""); setShowAdd(false); load(); }
    else toast.error(r.error ?? "追加に失敗しました");
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* ヘッダ */}
      <div className="px-4 py-3 bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
        <button type="button" onClick={() => setCollapsed((c) => !c)} className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-5 h-5 text-violet-500 shrink-0" />
          <span className="text-sm font-black text-slate-800 dark:text-slate-100">今日の先生タスク（AI秘書）</span>
          {pending.length > 0 && (
            <span className="text-[11px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5 shrink-0">承認待ち{pending.length}</span>
          )}
          {collapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            AIで作る
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-3">
          {loading ? (
            <div className="h-20 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-6 text-sm text-slate-400">
              <p>本日のタスクはまだありません。</p>
              <p className="text-xs mt-1">「AIで作る」で各先生の業務案を生成できます。</p>
            </div>
          ) : (
            <>
              {/* 一括承認バー */}
              {pending.length > 0 && (
                <div className="flex items-center justify-between gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-200">
                    {pending.length}件が承認待ち（承認すると先生に表示されます）
                  </span>
                  <button
                    type="button"
                    onClick={doApproveAll}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />すべて承認
                  </button>
                </div>
              )}

              {/* スタッフ別 */}
              <div className="space-y-3">
                {byStaff.map(([name, list]) => (
                  <div key={name} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-slate-600 dark:text-slate-300">
                      {name}
                    </div>
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {list.map((t) => {
                        const Icon = KIND_ICON[t.task_kind] ?? ListTodo;
                        const checked = t.status === "done";
                        return (
                          <li key={t.id} className={`flex items-center gap-2 px-3 py-2 ${!t.approved ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}>
                            <button type="button" onClick={() => doToggle(t)} className="shrink-0">
                              {checked
                                ? <Check className="w-4 h-4 text-emerald-500" />
                                : <span className="w-4 h-4 rounded border-2 border-slate-300 inline-block" />}
                            </button>
                            <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className={`text-sm ${checked ? "line-through text-slate-400" : "text-slate-700 dark:text-slate-200"}`}>{t.title}</span>
                              {t.description && <p className="text-[11px] text-slate-400 truncate">{t.description}</p>}
                            </div>
                            {t.priority === "high" && <span className="text-[10px] font-bold text-rose-600 shrink-0">優先</span>}
                            {t.source === "ai" && <span className="text-[10px] text-violet-400 shrink-0">AI</span>}
                            {!t.approved && (
                              <button type="button" onClick={() => doApprove(t.id)} className="shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-md bg-emerald-100 text-emerald-700 text-[11px] font-bold hover:bg-emerald-200">
                                <Check className="w-3 h-3" />承認
                              </button>
                            )}
                            <button type="button" onClick={() => doDelete(t.id)} className="shrink-0 p-1 text-slate-300 hover:text-rose-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 手動追加 */}
          {showAdd ? (
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">タスクを手動で追加</span>
                <button type="button" onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <select value={addStaffId} onChange={(e) => setAddStaffId(e.target.value)} className="h-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 text-sm">
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select value={addPriority} onChange={(e) => setAddPriority(e.target.value as TaskPriority)} className="h-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 text-sm">
                  <option value="normal">通常</option>
                  <option value="high">優先</option>
                  <option value="low">低</option>
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && addTitle.trim()) doAdd(); }}
                  placeholder="業務名（例：カルテまとめ）"
                  className="flex-1 h-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm"
                />
                <button type="button" onClick={doAdd} disabled={!addTitle.trim()} className="h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">追加</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowAdd(true)} className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <Plus className="w-4 h-4" />タスクを手動で追加
            </button>
          )}
        </div>
      )}
    </div>
  );
}
