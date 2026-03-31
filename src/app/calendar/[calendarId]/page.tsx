"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, X, Pencil, Trash2, Check, Clock, User, CalendarDays, Settings2, Palette } from "lucide-react";
import {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  ensureCalendarExists,
  updateCalendarMembers,
  type CalendarEvent,
  type CalendarMember,
} from "@/app/actions/family-calendar";
import { cn } from "@/lib/utils";

// ─── カラープリセット ───────────────────────────────────
const COLOR_PRESETS = [
  { color: "#ef4444", bg: "bg-red-500",    light: "bg-red-100",    text: "text-red-700"    },
  { color: "#3b82f6", bg: "bg-blue-500",   light: "bg-blue-100",   text: "text-blue-700"   },
  { color: "#ec4899", bg: "bg-pink-500",   light: "bg-pink-100",   text: "text-pink-700"   },
  { color: "#22c55e", bg: "bg-green-500",  light: "bg-green-100",  text: "text-green-700"  },
  { color: "#f59e0b", bg: "bg-amber-500",  light: "bg-amber-100",  text: "text-amber-700"  },
  { color: "#8b5cf6", bg: "bg-violet-500", light: "bg-violet-100", text: "text-violet-700" },
  { color: "#dc2626", bg: "bg-red-600",    light: "bg-red-50",     text: "text-red-600", border: "border-red-600" },
];

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function toLocalDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type ModalMode = "create" | "edit" | "view" | "settings";
interface Form {
  title: string; description: string; date: string;
  startTime: string; endTime: string; isAllDay: boolean; memberName: string;
}

const blankForm = (date = toLocalDateStr(new Date()), defaultMember = "家族"): Form => ({
  title: "", description: "", date,
  startTime: "09:00", endTime: "10:00", isAllDay: false, memberName: defaultMember,
});

export default function FamilyCalendarPage() {
  const params = useParams();
  const calendarId = params?.calendarId as string;
  const today = new Date();

  const [current, setCurrent] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarName, setCalendarName] = useState("ファミリーカレンダー");
  const [members, setMembers] = useState<CalendarMember[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: ModalMode; event?: CalendarEvent; date?: string } | null>(null);
  const [form, setForm] = useState<Form>(blankForm());
  const [saving, setSaving] = useState(false);

  const year = current.getFullYear();
  const month = current.getMonth();

  function getMember(name?: string | null) {
    return members.find((m) => m.name === name) ?? members[0] ?? COLOR_PRESETS[4];
  }

  // カレンダー初期化
  useEffect(() => {
    if (!calendarId) return;
    ensureCalendarExists(calendarId, "ファミリーカレンダー").then((cal) => {
      if (cal?.name) setCalendarName(cal.name);
      if (cal?.members) setMembers(cal.members);
    });
  }, [calendarId]);

  // イベント取得
  const fetchEvents = useCallback(async () => {
    if (!calendarId) return;
    setLoading(true);
    const start = new Date(year, month, 1).toISOString();
    const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    const data = await getEvents(calendarId, start, end);
    setEvents(data);
    setLoading(false);
  }, [calendarId, year, month]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // グリッド計算
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from(
    { length: Math.ceil((firstDay + daysInMonth) / 7) * 7 },
    (_, i) => { const d = i - firstDay + 1; return d >= 1 && d <= daysInMonth ? d : null; }
  );

  function eventsForDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events.filter((e) => {
      if (filter && e.member_name !== filter) return false;
      return e.start_time.slice(0, 10) === dateStr;
    });
  }

  // モーダル操作
  function openCreate(date: string) { setForm(blankForm(date, members[0]?.name || "家族")); setModal({ mode: "create", date }); }
  function openView(e: CalendarEvent) { setModal({ mode: "view", event: e }); }
  function openEdit(e: CalendarEvent) {
    const s = new Date(e.start_time), en = new Date(e.end_time);
    setForm({
      title: e.title, description: e.description ?? "",
      date: toLocalDateStr(s),
      startTime: `${String(s.getHours()).padStart(2,"0")}:${String(s.getMinutes()).padStart(2,"0")}`,
      endTime: `${String(en.getHours()).padStart(2,"0")}:${String(en.getMinutes()).padStart(2,"0")}`,
      isAllDay: e.is_all_day, memberName: e.member_name ?? "家族",
    });
    setModal({ mode: "edit", event: e });
  }

  // 保存
  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    const member = getMember(form.memberName);
    const startIso = form.isAllDay
      ? `${form.date}T00:00:00+09:00`
      : `${form.date}T${form.startTime}:00+09:00`;
    const endIso = form.isAllDay
      ? `${form.date}T23:59:59+09:00`
      : `${form.date}T${form.endTime}:00+09:00`;
    const payload = {
      title: form.title, description: form.description || null,
      start_time: startIso, end_time: endIso,
      is_all_day: form.isAllDay, color: member.color,
      member_name: form.memberName, is_recurring: false, recurrence_rule: null,
    };
    if (modal?.mode === "create") await createEvent(calendarId, payload);
    else if (modal?.mode === "edit" && modal.event) await updateEvent(modal.event.id, payload);
    await fetchEvents();
    setSaving(false);
    setModal(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("この予定を削除しますか？")) return;
    await deleteEvent(id);
    await fetchEvents();
    setModal(null);
  }

  async function handleUpdateMembers(newMembers: CalendarMember[]) {
    setSaving(true);
    await updateCalendarMembers(calendarId, newMembers);
    setMembers(newMembers);
    setSaving(false);
    setModal(null);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* ヘッダー */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-3 py-2.5 flex items-center gap-2">
        <CalendarDays className="w-5 h-5 text-violet-400 shrink-0" />
        <span className="font-bold text-sm flex-1 truncate">{calendarName}</span>
        <div className="flex gap-1 overflow-x-auto scrollbar-none pr-2">
          <button onClick={() => setFilter(null)}
            className={`px-2 py-0.5 rounded-full text-xs font-bold transition whitespace-nowrap ${!filter ? "bg-violet-500 text-white" : "bg-slate-800 text-slate-400"}`}>
            全員
          </button>
          {members.map((m) => (
            <button key={m.name} onClick={() => setFilter(filter === m.name ? null : m.name)}
              className={`px-2 py-0.5 rounded-full text-xs font-bold transition whitespace-nowrap ${filter === m.name ? `${m.bg} text-white` : "bg-slate-800 text-slate-400"}`}>
              {m.name}
            </button>
          ))}
        </div>
        <button onClick={() => setModal({ mode: "settings" })}
          className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
          <Settings2 className="w-4 h-4 text-slate-400" />
        </button>
      </header>

      {/* 月ナビ */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <button onClick={() => setCurrent(new Date(year, month - 1, 1))}
          className="w-14 h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition shadow-lg">
          <ChevronLeft className="w-7 h-7" />
        </button>
        <div className="text-center">
          <p className="text-3xl font-black tracking-tighter">{month + 1}<span className="text-slate-400 text-base font-normal ml-1">月</span></p>
          <p className="text-sm text-slate-500 font-bold tracking-widest">{year}</p>
        </div>
        <button onClick={() => setCurrent(new Date(year, month + 1, 1))}
          className="w-14 h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition shadow-lg">
          <ChevronRight className="w-7 h-7" />
        </button>
      </div>

      {/* 曜日 */}
      <div className="grid grid-cols-7 px-2 mb-1">
        {WEEKDAYS.map((d, i) => (
          <div key={d} className={`text-center text-xs font-bold py-1 ${i===0?"text-red-400":i===6?"text-blue-400":"text-slate-500"}`}>{d}</div>
        ))}
      </div>

      {/* グリッド */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-7 h-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-px bg-slate-800 mx-2 rounded-2xl overflow-hidden">
          {cells.map((day, idx) => {
            if (!day) return <div key={idx} className="bg-slate-950 h-20" />;
            const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            const dow = (firstDay + day - 1) % 7;
            const dayEvents = eventsForDay(day);
            const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            return (
              <div key={idx} onClick={() => openCreate(dateStr)}
                className="bg-slate-900 h-20 p-1 cursor-pointer hover:bg-slate-800 transition group relative">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mb-0.5 mx-auto ${isToday ? "bg-violet-500 text-white" : dow===0 ? "text-red-400" : dow===6 ? "text-blue-400" : "text-slate-300"}`}>
                  {day}
                </div>
                <div className="space-y-0.5 overflow-hidden">
                  {dayEvents.slice(0, 2).map((e) => {
                    const m = getMember(e.member_name);
                    const isMatch = e.member_name === "試合" || e.title.includes("🔴");
                    return (
                      <div key={e.id} onClick={(ev) => { ev.stopPropagation(); openView(e); }}
                        className={`${isMatch ? "bg-red-600 text-white" : `${m.light} ${m.text}`} text-[9px] font-bold truncate rounded-sm px-1 leading-4 cursor-pointer shadow-sm ${isMatch ? "ring-1 ring-red-400" : ""}`}>
                        {isMatch && "🔴 "}{e.title}
                      </div>
                    );
                  })}
                  {dayEvents.length > 2 && <div className="text-[9px] text-slate-500 px-1">+{dayEvents.length - 2}</div>}
                </div>
                <Plus className="absolute bottom-1 right-1 w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 transition" />
              </div>
            );
          })}
        </div>
      )}

      {/* 今月一覧 */}
      <div className="px-4 py-5 pb-24">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">今月の予定</p>
        {events.filter(e => !filter || e.member_name === filter).length === 0 ? (
          <p className="text-slate-600 text-sm text-center py-6">予定なし</p>
        ) : (
          <div className="space-y-2">
            {events.filter(e => !filter || e.member_name === filter).map((e) => {
              const m = getMember(e.member_name);
              const s = new Date(e.start_time);
              return (
                <div key={e.id} onClick={() => openView(e)}
                  className={cn(
                    "flex items-center gap-3 bg-slate-900 hover:bg-slate-800 rounded-2xl p-4 cursor-pointer transition border border-slate-800 shadow-sm",
                    (e.member_name === "試合" || e.title.includes("🔴")) && "border-red-900/50 bg-red-950/20"
                  )}>
                  <div className={cn("w-2 h-12 rounded-full shrink-0", m.bg)} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base truncate flex items-center gap-2">
                      {(e.member_name === "試合" || e.title.includes("🔴")) && <span className="text-red-500 text-lg">🔴</span>}
                      {e.title}
                    </p>
                    <p className="text-xs text-slate-400 font-medium">
                      {s.getMonth()+1}/{s.getDate()}（{WEEKDAYS[s.getDay()]}）
                      {!e.is_all_day && ` ${formatTime(e.start_time)}〜${formatTime(e.end_time)}`}
                    </p>
                  </div>
                  {e.member_name && (
                    <span className={cn("text-xs font-black px-3 py-1 rounded-full shrink-0", m.light, m.text)}>{e.member_name}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FAB */}
      <button onClick={() => openCreate(toLocalDateStr(today))}
        className="fixed bottom-6 right-5 w-14 h-14 bg-violet-500 hover:bg-violet-400 active:scale-95 rounded-2xl shadow-lg shadow-violet-900/50 flex items-center justify-center z-20 transition">
        <Plus className="w-7 h-7" />
      </button>

      {/* モーダル */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-700 overflow-hidden shadow-2xl">

            {/* VIEW */}
            {modal.mode === "view" && modal.event && (() => {
              const ev = modal.event;
              const m = getMember(ev.member_name);
              const s = new Date(ev.start_time);
              const en = new Date(ev.end_time);
              return (
                <>
                  <div className={`h-1.5 ${m.bg}`} />
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <h2 className="text-xl font-black flex-1 pr-3 leading-snug">{ev.title}</h2>
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(ev)} className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition border border-slate-700">
                          <Pencil className="w-4 h-4 text-slate-300" />
                        </button>
                        <button onClick={() => handleDelete(ev.id)} className="w-9 h-9 rounded-xl bg-red-900/40 hover:bg-red-900/60 flex items-center justify-center transition border border-red-900/20">
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                        <button onClick={() => setModal(null)} className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition border border-slate-700">
                          <X className="w-4 h-4 text-slate-300" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center gap-2 text-slate-300">
                        <CalendarDays className="w-4 h-4 text-slate-500 shrink-0" />
                        <span>
                          {s.getFullYear()}/{s.getMonth()+1}/{s.getDate()}（{WEEKDAYS[s.getDay()]}）
                          {ev.is_all_day ? " 終日" : ` ${formatTime(ev.start_time)} 〜 ${formatTime(ev.end_time)}`}
                        </span>
                      </div>
                      {ev.member_name && (
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-500 shrink-0" />
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${m.light} ${m.text}`}>{ev.member_name}</span>
                        </div>
                      )}
                      {ev.description && (
                        <p className="text-slate-400 bg-slate-800 rounded-xl p-3 leading-relaxed border border-slate-700">{ev.description}</p>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}

            {/* CREATE / EDIT */}
            {(modal.mode === "create" || modal.mode === "edit") && (
              <>
                <div className="flex items-center justify-between p-5 border-b border-slate-800">
                  <h2 className="text-lg font-black">{modal.mode === "create" ? "予定を追加" : "予定を編集"}</h2>
                  <button onClick={() => setModal(null)} className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition border border-slate-700">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-5 space-y-4 overflow-y-auto max-h-[65vh] scrollbar-none">

                  {/* タイトル */}
                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-1.5">タイトル</label>
                    <input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                      placeholder="例: パパ サッカー試合" autoFocus
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500 text-sm" />
                  </div>

                  {/* メンバー */}
                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-1.5">メンバー</label>
                    <div className="flex flex-wrap gap-2 text-[10px]">
                      {members.map(m => (
                        <button key={m.name} onClick={() => setForm({...form, memberName: m.name})}
                          className={`px-3 py-1.5 rounded-full font-bold transition ${form.memberName === m.name ? `${m.bg} text-white ring-2 ring-white/20` : "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"}`}>
                          {m.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 日付 */}
                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-1.5">日付</label>
                    <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500 text-sm" />
                  </div>

                  {/* 終日トグル */}
                  <div className="flex items-center justify-between bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-800">
                    <span className="text-sm text-slate-300">終日</span>
                    <button onClick={() => setForm({...form, isAllDay: !form.isAllDay})}
                      className={`w-12 h-6 rounded-full transition-colors relative ${form.isAllDay ? "bg-violet-500" : "bg-slate-700"}`}>
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all ${form.isAllDay ? "left-[26px]" : "left-0.5"}`} />
                    </button>
                  </div>

                  {/* 時間 */}
                  {!form.isAllDay && (
                    <div className="grid grid-cols-2 gap-3">
                      {[["開始", "startTime"], ["終了", "endTime"]].map(([label, key]) => (
                        <div key={key}>
                          <label className="text-xs font-bold text-slate-400 block mb-1.5">
                            <Clock className="w-3 h-3 inline mr-1" />{label}
                          </label>
                          <input type="time" value={form[key as "startTime" | "endTime"]}
                            onChange={e => setForm({...form, [key]: e.target.value})}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-violet-500 text-sm" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* メモ */}
                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-1.5">メモ（任意）</label>
                    <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                      placeholder="会場、持ち物など..." rows={3}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500 text-sm resize-none" />
                  </div>
                </div>

                <div className="p-4 border-t border-slate-800 bg-slate-900/50">
                  <button onClick={handleSave} disabled={!form.title.trim() || saving}
                    className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition shadow-xl shadow-violet-900/20 text-base active:scale-95">
                    {saving
                      ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <><Check className="w-5 h-5 stroke-[3]" />保存する</>}
                  </button>
                </div>
              </>
            )}

            {/* SETTINGS (MEMBERS) */}
            {modal.mode === "settings" && (
              <MemberSettings members={members} onSave={handleUpdateMembers} onCancel={() => setModal(null)} saving={saving} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── メンバー設定コンポーネント ───────────────────────────────────
function MemberSettings({ members, onSave, onCancel, saving }: { members: CalendarMember[], onSave: (m: CalendarMember[]) => void, onCancel: () => void, saving: boolean }) {
  const [localMembers, setLocalMembers] = useState<CalendarMember[]>([...members]);

  const updateMember = (index: number, updates: Partial<CalendarMember>) => {
    const next = [...localMembers];
    next[index] = { ...next[index], ...updates };
    setLocalMembers(next);
  };

  const addMember = () => {
    const preset = COLOR_PRESETS[localMembers.length % COLOR_PRESETS.length];
    setLocalMembers([...localMembers, { name: "新しい名前", ...preset }]);
  };

  const removeMember = (index: number) => {
    if (localMembers.length <= 1) return;
    setLocalMembers(localMembers.filter((_, i) => i !== index));
  };

  return (
    <>
      <div className="flex items-center justify-between p-5 border-b border-slate-800">
        <h2 className="text-lg font-black flex items-center gap-2">
          <Palette className="w-5 h-5 text-violet-400" />
          メンバー設定
        </h2>
        <button onClick={onCancel} className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition border border-slate-700">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-5 space-y-4 overflow-y-auto max-h-[60vh] scrollbar-none">
        <p className="text-[10px] text-slate-500 font-bold mb-2">名前と色を自由に設定できます（全7色）</p>
        <div className="space-y-3">
          {localMembers.map((m, idx) => (
            <div key={idx} className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-2xl border border-slate-800">
              <div className="flex-1 space-y-2">
                <input value={m.name} onChange={e => updateMember(idx, { name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 font-bold" />
                <div className="flex gap-1.5">
                  {COLOR_PRESETS.slice(0, 6).map((preset) => (
                    <button key={preset.color} onClick={() => updateMember(idx, preset)}
                      className={`w-6 h-6 rounded-full transition-transform ${m.color === preset.color ? "scale-125 ring-2 ring-white" : "opacity-30 hover:opacity-100"}`}
                      style={{ backgroundColor: preset.color }} />
                  ))}
                  <button onClick={() => updateMember(idx, COLOR_PRESETS[6])}
                    className={`w-6 h-6 rounded-md transition-transform flex items-center justify-center ${m.color === COLOR_PRESETS[6].color ? "scale-125 ring-2 ring-white" : "opacity-30 hover:opacity-100"}`}
                    style={{ backgroundColor: COLOR_PRESETS[6].color }}>
                    <span className="text-white text-[8px] font-black">🔴</span>
                  </button>
                </div>
              </div>
              <button onClick={() => removeMember(idx)} className="w-8 h-8 rounded-lg bg-red-900/20 hover:bg-red-900/40 flex items-center justify-center text-red-400 transition">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <button onClick={addMember}
          className="w-full py-3 rounded-xl border border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 transition text-xs font-bold flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" />
          メンバーを追加
        </button>
      </div>
      <div className="p-4 border-t border-slate-800 bg-slate-900/50">
        <button onClick={() => onSave(localMembers)} disabled={saving}
          className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition shadow-xl shadow-violet-900/20 text-base">
          {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Check className="w-5 h-5 stroke-[3]" />設定を保存</>}
        </button>
      </div>
    </>
  );
}
