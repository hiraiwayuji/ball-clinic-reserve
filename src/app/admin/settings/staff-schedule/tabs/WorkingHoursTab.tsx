"use client";

import { useState, useTransition } from "react";
import {
  upsertWorkingHours,
  deleteWorkingHour,
  listWorkingHours,
  type StaffOption,
  type WorkingHourRow,
} from "@/app/actions/staff-schedule";
import { Button } from "@/components/ui/button";
import { AlertCircle, X, Edit3 } from "lucide-react";

const DAYS = [
  { idx: 0, label: "日", color: "text-rose-600" },
  { idx: 1, label: "月" },
  { idx: 2, label: "火" },
  { idx: 3, label: "水" },
  { idx: 4, label: "木" },
  { idx: 5, label: "金" },
  { idx: 6, label: "土", color: "text-sky-600" },
];

type Props = {
  staff: StaffOption[];
  initialRows: WorkingHourRow[];
};

type EditingState = {
  staff_id: string;
  staff_name: string;
  day_of_week: number;
  current?: WorkingHourRow;
} | null;

export default function WorkingHoursTab({ staff, initialRows }: Props) {
  const [rows, setRows] = useState<WorkingHourRow[]>(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<EditingState>(null);

  // (staff_id, day_of_week) → WorkingHourRow の Map
  const lookup = new Map<string, WorkingHourRow>();
  for (const r of rows) {
    lookup.set(`${r.staff_id}:${r.day_of_week}`, r);
  }

  async function refresh() {
    const r = await listWorkingHours();
    if (r.success) setRows(r.rows ?? []);
  }

  function openEdit(s: StaffOption, day: number) {
    const current = lookup.get(`${s.id}:${day}`);
    setEditing({ staff_id: s.id, staff_name: s.name, day_of_week: day, current });
  }

  if (staff.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center">
        <p className="text-sm text-slate-600 mb-2">スタッフが登録されていません</p>
        <a href="/admin/settings" className="text-sm text-indigo-600 underline">設定 → スタッフを追加</a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
        💡 各セルをタップすると編集できます。空欄 = その曜日は休み（勤務時間なし）。<br />
        画面が狭い場合は <strong>横スクロール</strong> できます。PC でのご利用を推奨。
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-3 py-2 font-bold text-slate-700 sticky left-0 bg-slate-50 z-10 min-w-[100px]">スタッフ</th>
              {DAYS.map((d) => (
                <th key={d.idx} className={`text-center px-2 py-2 font-bold min-w-[110px] ${d.color ?? "text-slate-700"}`}>
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-b-0">
                <td className="px-3 py-2 font-semibold text-slate-800 sticky left-0 bg-white z-10 min-w-[100px]">{s.name}</td>
                {DAYS.map((d) => {
                  const cell = lookup.get(`${s.id}:${d.idx}`);
                  return (
                    <td key={d.idx} className="px-1 py-1">
                      <button
                        type="button"
                        onClick={() => openEdit(s, d.idx)}
                        className={
                          cell
                            ? "w-full text-xs text-left px-2 py-1.5 rounded-md border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition-colors"
                            : "w-full text-xs text-center px-2 py-1.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-400 transition-colors"
                        }
                      >
                        {cell ? (
                          <>
                            <div className="font-bold tabular-nums">{cell.start_time}〜{cell.end_time}</div>
                            {cell.break_start && cell.break_end && (
                              <div className="text-[10px] text-emerald-600 tabular-nums">休 {cell.break_start}〜{cell.break_end}</div>
                            )}
                          </>
                        ) : (
                          "休"
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditModal
          state={editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            setError(null);
            return new Promise<boolean>((resolve) => {
              startTransition(async () => {
                const r = await upsertWorkingHours(input);
                if (!r.success) {
                  setError(r.error ?? "保存に失敗しました");
                  resolve(false);
                  return;
                }
                await refresh();
                resolve(true);
              });
            });
          }}
          onDelete={async () => {
            setError(null);
            return new Promise<boolean>((resolve) => {
              startTransition(async () => {
                const r = await deleteWorkingHour(editing.staff_id, editing.day_of_week);
                if (!r.success) {
                  setError(r.error ?? "削除に失敗しました");
                  resolve(false);
                  return;
                }
                await refresh();
                resolve(true);
              });
            });
          }}
          pending={pending}
        />
      )}
    </div>
  );
}

function EditModal({
  state,
  onClose,
  onSave,
  onDelete,
  pending,
}: {
  state: NonNullable<EditingState>;
  onClose: () => void;
  onSave: (input: { staff_id: string; day_of_week: number; start_time: string; end_time: string; break_start: string | null; break_end: string | null }) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  pending: boolean;
}) {
  const cur = state.current;
  const [startTime, setStartTime] = useState(cur?.start_time ?? "10:00");
  const [endTime, setEndTime] = useState(cur?.end_time ?? "20:00");
  const [hasBreak, setHasBreak] = useState(!!(cur?.break_start && cur?.break_end));
  const [breakStart, setBreakStart] = useState(cur?.break_start ?? "12:00");
  const [breakEnd, setBreakEnd] = useState(cur?.break_end ?? "13:00");

  const dayLabel = ["日","月","火","水","木","金","土"][state.day_of_week];

  async function handleSave() {
    const ok = await onSave({
      staff_id: state.staff_id,
      day_of_week: state.day_of_week,
      start_time: startTime,
      end_time: endTime,
      break_start: hasBreak ? breakStart : null,
      break_end: hasBreak ? breakEnd : null,
    });
    if (ok) onClose();
  }

  async function handleDelete() {
    if (!cur) return;
    if (!confirm(`${state.staff_name} の${dayLabel}曜日を休みにしますか？`)) return;
    const ok = await onDelete();
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-indigo-600" />
            {state.staff_name} ({dayLabel})
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">開始時刻</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                step={1800}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">終了時刻</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                step={1800}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={hasBreak} onChange={(e) => setHasBreak(e.target.checked)} />
            休憩時間あり
          </label>

          {hasBreak && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">休憩開始</label>
                <input
                  type="time"
                  value={breakStart}
                  onChange={(e) => setBreakStart(e.target.value)}
                  step={1800}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">休憩終了</label>
                <input
                  type="time"
                  value={breakEnd}
                  onChange={(e) => setBreakEnd(e.target.value)}
                  step={1800}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-between gap-2">
          {cur ? (
            <Button onClick={handleDelete} variant="ghost" disabled={pending} className="text-rose-600 hover:bg-rose-50">
              この曜日を休みにする
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button onClick={onClose} variant="outline" disabled={pending}>キャンセル</Button>
            <Button onClick={handleSave} disabled={pending}>{pending ? "保存中…" : "保存"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
