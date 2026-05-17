"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createTask,
  completeTask,
  reopenTask,
  deleteTask,
  listTasks,
  updateTask,
  type StaffOption,
  type StaffTaskRow,
  type TaskPriority,
  type TaskStatus,
} from "@/app/actions/staff-schedule";
import { Button } from "@/components/ui/button";
import {
  Plus,
  AlertCircle,
  Trash2,
  Edit3,
  X,
  CheckCircle2,
  Circle,
  Flag,
  Calendar,
} from "lucide-react";

const PRIORITY_META: Record<TaskPriority, { label: string; badge: string; flag: string }> = {
  high:   { label: "高", badge: "bg-rose-100 text-rose-700 border-rose-300",     flag: "text-rose-500" },
  normal: { label: "中", badge: "bg-slate-100 text-slate-700 border-slate-300", flag: "text-slate-400" },
  low:    { label: "低", badge: "bg-sky-100 text-sky-700 border-sky-300",       flag: "text-sky-400" },
};

type Props = {
  staff: StaffOption[];
  initialRows: StaffTaskRow[];
};

type StatusFilter = TaskStatus | "all";
type StaffFilter = "all" | "unassigned" | string; // string = staff_id

export default function TasksTab({ staff, initialRows }: Props) {
  const [rows, setRows] = useState<StaffTaskRow[]>(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [staffFilter, setStaffFilter] = useState<StaffFilter>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<StaffTaskRow | null>(null);

  async function refresh() {
    const r = await listTasks({ status: "all" });
    if (r.success) setRows(r.rows ?? []);
  }

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (staffFilter === "unassigned" && r.staff_id !== null) return false;
      if (staffFilter !== "all" && staffFilter !== "unassigned" && r.staff_id !== staffFilter) return false;
      return true;
    });
  }, [rows, statusFilter, staffFilter]);

  const pendingByStaff = useMemo(() => {
    const map = new Map<string, number>();
    let unassignedCount = 0;
    for (const r of rows) {
      if (r.status !== "pending") continue;
      if (r.staff_id === null) {
        unassignedCount++;
      } else {
        map.set(r.staff_id, (map.get(r.staff_id) ?? 0) + 1);
      }
    }
    return { map, unassignedCount };
  }, [rows]);

  function badgeColor(count: number): string {
    if (count >= 8) return "bg-rose-500 text-white";
    if (count >= 4) return "bg-amber-400 text-white";
    if (count > 0)  return "bg-emerald-500 text-white";
    return "bg-slate-200 text-slate-600";
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* スタッフ別残タスクバッジ */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="text-xs font-bold text-slate-600 mb-2">スタッフ別 残タスク</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStaffFilter("all")}
            className={
              staffFilter === "all"
                ? "px-3 py-1.5 rounded-full text-xs font-bold bg-indigo-600 text-white"
                : "px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
            }
          >
            全員
          </button>
          {staff.map((s) => {
            const count = pendingByStaff.map.get(s.id) ?? 0;
            const active = staffFilter === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStaffFilter(active ? "all" : s.id)}
                className={
                  active
                    ? "px-3 py-1.5 rounded-full text-xs font-bold bg-indigo-600 text-white inline-flex items-center gap-1.5"
                    : "px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 inline-flex items-center gap-1.5"
                }
              >
                {s.name}
                <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded-full text-[10px] font-bold ${active ? "bg-white text-indigo-600" : badgeColor(count)}`}>
                  {count}
                </span>
              </button>
            );
          })}
          {pendingByStaff.unassignedCount > 0 && (
            <button
              type="button"
              onClick={() => setStaffFilter(staffFilter === "unassigned" ? "all" : "unassigned")}
              className={
                staffFilter === "unassigned"
                  ? "px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500 text-white inline-flex items-center gap-1.5"
                  : "px-3 py-1.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 inline-flex items-center gap-1.5"
              }
            >
              未割当
              <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded-full text-[10px] font-bold ${staffFilter === "unassigned" ? "bg-white text-amber-600" : "bg-amber-500 text-white"}`}>
                {pendingByStaff.unassignedCount}
              </span>
            </button>
          )}
        </div>
      </section>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {([
            { key: "pending" as const, label: "未完了" },
            { key: "done" as const,    label: "完了済" },
            { key: "all" as const,     label: "全部" },
          ]).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setStatusFilter(opt.key)}
              className={
                statusFilter === opt.key
                  ? "px-3 py-1.5 rounded-md text-xs font-bold bg-white text-slate-900 shadow-sm"
                  : "px-3 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900"
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Button onClick={() => setShowForm((v) => !v)} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          {showForm ? "閉じる" : "新規タスク"}
        </Button>
      </div>

      {showForm && (
        <TaskForm
          staff={staff}
          pending={pending}
          onSubmit={async (input) => {
            setError(null);
            return new Promise<boolean>((resolve) => {
              startTransition(async () => {
                const r = await createTask(input);
                if (!r.success) {
                  setError(r.error ?? "登録に失敗しました");
                  resolve(false);
                  return;
                }
                await refresh();
                setShowForm(false);
                resolve(true);
              });
            });
          }}
        />
      )}

      <div className="space-y-2">
        {filteredRows.length === 0 ? (
          <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
            タスクはありません
          </p>
        ) : (
          filteredRows.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              pending={pending}
              onComplete={() => {
                setError(null);
                startTransition(async () => {
                  const r = await completeTask(task.id);
                  if (!r.success) setError(r.error ?? "完了に失敗");
                  await refresh();
                });
              }}
              onReopen={() => {
                setError(null);
                startTransition(async () => {
                  const r = await reopenTask(task.id);
                  if (!r.success) setError(r.error ?? "再開に失敗");
                  await refresh();
                });
              }}
              onEdit={() => setEditingTask(task)}
              onDelete={() => {
                if (!confirm(`「${task.title}」を削除しますか？`)) return;
                setError(null);
                startTransition(async () => {
                  const r = await deleteTask(task.id);
                  if (!r.success) setError(r.error ?? "削除に失敗");
                  await refresh();
                });
              }}
            />
          ))
        )}
      </div>

      {editingTask && (
        <TaskEditModal
          task={editingTask}
          staff={staff}
          pending={pending}
          onClose={() => setEditingTask(null)}
          onSave={async (patch) => {
            setError(null);
            return new Promise<boolean>((resolve) => {
              startTransition(async () => {
                const r = await updateTask(editingTask.id, patch);
                if (!r.success) {
                  setError(r.error ?? "更新に失敗");
                  resolve(false);
                  return;
                }
                await refresh();
                resolve(true);
              });
            });
          }}
        />
      )}
    </div>
  );
}

function TaskForm({
  staff,
  pending,
  onSubmit,
}: {
  staff: StaffOption[];
  pending: boolean;
  onSubmit: (input: { staff_id: string | null; title: string; description?: string | null; due_date?: string | null; priority?: TaskPriority }) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [staffId, setStaffId] = useState<string>("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [description, setDescription] = useState("");

  async function handleSubmit() {
    if (!title.trim()) return;
    const ok = await onSubmit({
      staff_id: staffId === "" ? null : staffId,
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate || null,
      priority,
    });
    if (ok) {
      setTitle(""); setStaffId(""); setDueDate(""); setPriority("normal"); setDescription("");
    }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900 mb-3">新規タスク登録</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className="block text-xs font-bold text-slate-700 mb-1">タイトル *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="例: 棚卸し、5月度報告書作成"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">担当者</label>
          <select
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">(未割当)</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">期限 (任意)</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-bold text-slate-700 mb-1">優先度</label>
          <div className="flex gap-2">
            {(["high","normal","low"] as TaskPriority[]).map((p) => (
              <label key={p} className={
                priority === p
                  ? "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-indigo-500 bg-indigo-50 text-sm font-bold cursor-pointer"
                  : "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-sm cursor-pointer"
              }>
                <input
                  type="radio"
                  name="priority"
                  value={p}
                  checked={priority === p}
                  onChange={() => setPriority(p)}
                  className="sr-only"
                />
                <Flag className={`w-3.5 h-3.5 ${PRIORITY_META[p].flag}`} />
                {PRIORITY_META[p].label}
              </label>
            ))}
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-bold text-slate-700 mb-1">説明 (任意)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="補足メモ"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button onClick={handleSubmit} disabled={pending || !title.trim()}>
          {pending ? "登録中…" : "登録"}
        </Button>
      </div>
    </section>
  );
}

function TaskCard({
  task,
  pending,
  onComplete,
  onReopen,
  onEdit,
  onDelete,
}: {
  task: StaffTaskRow;
  pending: boolean;
  onComplete: () => void;
  onReopen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const done = task.status === "done";
  const meta = PRIORITY_META[task.priority];
  const dueText = formatDueDate(task.due_date);
  const overdue = task.due_date && !done && task.due_date < new Date().toISOString().slice(0, 10);

  return (
    <div className={
      done
        ? "bg-slate-50 border border-slate-200 rounded-xl p-3 opacity-60"
        : overdue
        ? "bg-white border-2 border-rose-300 rounded-xl p-3"
        : "bg-white border border-slate-200 rounded-xl p-3"
    }>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={done ? onReopen : onComplete}
          disabled={pending}
          aria-label={done ? "未完了に戻す" : "完了"}
          className="shrink-0 mt-0.5"
        >
          {done
            ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            : <Circle className="w-5 h-5 text-slate-400 hover:text-emerald-500 transition-colors" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${meta.badge}`}>
              <Flag className={`w-3 h-3 ${meta.flag}`} />
              {meta.label}
            </span>
            <span className={done ? "font-semibold text-slate-500 line-through" : "font-semibold text-slate-900"}>
              {task.title}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
            <span className="inline-flex items-center gap-1">
              👤 {task.staff_name ?? "(未割当)"}
            </span>
            {dueText && (
              <span className={overdue ? "inline-flex items-center gap-1 text-rose-700 font-bold" : "inline-flex items-center gap-1"}>
                <Calendar className="w-3 h-3" />
                {dueText}
              </span>
            )}
          </div>
          {task.description && (
            <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{task.description}</p>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            disabled={pending}
            className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
            aria-label="編集"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
            aria-label="削除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDueDate(yyyymmdd: string | null): string | null {
  if (!yyyymmdd) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${yyyymmdd}T00:00:00+09:00`);
  const diffDays = Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return `${-diffDays}日超過`;
  if (diffDays === 0) return "今日";
  if (diffDays === 1) return "明日";
  if (diffDays <= 6) return `${diffDays}日後`;
  const m = parseInt(yyyymmdd.slice(5, 7), 10);
  const d = parseInt(yyyymmdd.slice(8, 10), 10);
  return `${m}/${d}`;
}

function TaskEditModal({
  task,
  staff,
  pending,
  onClose,
  onSave,
}: {
  task: StaffTaskRow;
  staff: StaffOption[];
  pending: boolean;
  onClose: () => void;
  onSave: (patch: Partial<{ staff_id: string | null; title: string; description: string | null; due_date: string | null; priority: TaskPriority }>) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(task.title);
  const [staffId, setStaffId] = useState<string>(task.staff_id ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [description, setDescription] = useState(task.description ?? "");

  async function handleSave() {
    const ok = await onSave({
      staff_id: staffId === "" ? null : staffId,
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate || null,
      priority,
    });
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-indigo-600" />
            タスク編集
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">タイトル</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">担当者</label>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">(未割当)</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">期限</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">優先度</label>
            <div className="flex gap-2">
              {(["high","normal","low"] as TaskPriority[]).map((p) => (
                <label key={p} className={
                  priority === p
                    ? "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-indigo-500 bg-indigo-50 text-sm font-bold cursor-pointer"
                    : "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-sm cursor-pointer"
                }>
                  <input
                    type="radio"
                    name="priority-edit"
                    value={p}
                    checked={priority === p}
                    onChange={() => setPriority(p)}
                    className="sr-only"
                  />
                  <Flag className={`w-3.5 h-3.5 ${PRIORITY_META[p].flag}`} />
                  {PRIORITY_META[p].label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">説明</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose} variant="outline" disabled={pending}>キャンセル</Button>
          <Button onClick={handleSave} disabled={pending || !title.trim()}>
            {pending ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>
    </div>
  );
}
