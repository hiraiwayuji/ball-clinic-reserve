"use client";

import { useState, useTransition } from "react";
import {
  createOverride,
  deleteOverride,
  listOverrides,
  type StaffOption,
  type StaffOverrideRow,
  type OverrideKind,
} from "@/app/actions/staff-schedule";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, AlertCircle } from "lucide-react";

const KIND_LABEL: Record<OverrideKind, string> = {
  meeting: "ミーティング",
  leave: "休み・私用",
  training: "研修",
  other: "その他",
};

const KIND_BADGE: Record<OverrideKind, string> = {
  meeting: "bg-sky-100 text-sky-700 border-sky-300",
  leave: "bg-amber-100 text-amber-700 border-amber-300",
  training: "bg-emerald-100 text-emerald-700 border-emerald-300",
  other: "bg-slate-100 text-slate-700 border-slate-300",
};

type Props = {
  initialStaff: StaffOption[];
  initialOverrides: StaffOverrideRow[];
  initialStartDate: string;
  initialEndDate: string;
};

export default function StaffScheduleClient({
  initialStaff,
  initialOverrides,
  initialStartDate,
  initialEndDate,
}: Props) {
  const [rows, setRows] = useState<StaffOverrideRow[]>(initialOverrides);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // フォーム
  const today = new Date().toISOString().slice(0, 10);
  const [staffId, setStaffId] = useState(initialStaff[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState("14:00");
  const [endTime, setEndTime] = useState("16:00");
  const [kind, setKind] = useState<OverrideKind>("meeting");
  const [note, setNote] = useState("");

  async function refresh() {
    const r = await listOverrides({ startDate: initialStartDate, endDate: initialEndDate });
    if (r.success) setRows(r.rows ?? []);
  }

  function handleAdd() {
    setError(null);
    if (!staffId) {
      setError("スタッフを選択してください");
      return;
    }
    startTransition(async () => {
      const r = await createOverride({
        staff_id: staffId,
        date,
        start_time: allDay ? null : startTime,
        end_time: allDay ? null : endTime,
        kind,
        note: note.trim() || null,
        blocks_booking: true,
      });
      if (!r.success) {
        setError(r.error ?? "登録に失敗しました");
        return;
      }
      setNote("");
      await refresh();
    });
  }

  function handleDelete(id: string) {
    if (!confirm("この予定を削除しますか？")) return;
    startTransition(async () => {
      const r = await deleteOverride(id);
      if (!r.success) {
        setError(r.error ?? "削除に失敗しました");
        return;
      }
      await refresh();
    });
  }

  // 日付ごとにグループ化
  const grouped = rows.reduce<Record<string, StaffOverrideRow[]>>((acc, r) => {
    (acc[r.date] ??= []).push(r);
    return acc;
  }, {});
  const dates = Object.keys(grouped).sort();

  return (
    <div className="space-y-6">
      {/* 追加フォーム */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-indigo-600" />
          新規登録
        </h2>

        {error && (
          <div className="mb-3 flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">スタッフ</label>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {initialStaff.length === 0 && <option value="">(スタッフ未登録)</option>}
              {initialStaff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">日付</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={today}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            />
          </div>

          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
              />
              終日不在
            </label>
          </div>

          {!allDay && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">開始時刻</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  step={1800}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">終了時刻</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  step={1800}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">種別</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as OverrideKind)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {(Object.keys(KIND_LABEL) as OverrideKind[]).map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">メモ (任意)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例: 業者打ち合わせ"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={handleAdd} disabled={pending || !staffId}>
            {pending ? "登録中…" : "予定を追加"}
          </Button>
        </div>
      </section>

      {/* リスト */}
      <section>
        <h2 className="text-base font-bold text-slate-900 mb-3">登録済み (今後 4 週間)</h2>
        {dates.length === 0 ? (
          <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
            登録されている予定はありません
          </p>
        ) : (
          <div className="space-y-3">
            {dates.map((d) => (
              <div key={d} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-sm font-bold text-slate-800 mb-2">
                  {d} ({weekdayJa(d)})
                </div>
                <ul className="space-y-2">
                  {grouped[d].map((r) => (
                    <li key={r.id} className="flex items-start justify-between gap-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border mr-2 ${KIND_BADGE[r.kind]}`}>
                          {KIND_LABEL[r.kind]}
                        </span>
                        <span className="font-semibold text-slate-800">{r.staff_name ?? "(不明)"}</span>
                        <span className="text-slate-600 ml-2">
                          {r.start_time && r.end_time ? `${r.start_time}〜${r.end_time}` : "終日"}
                        </span>
                        {r.note && <span className="text-slate-500 ml-2">— {r.note}</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        disabled={pending}
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                        aria-label="削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function weekdayJa(yyyymmdd: string): string {
  const d = new Date(`${yyyymmdd}T00:00:00+09:00`);
  return ["日","月","火","水","木","金","土"][d.getDay()];
}
