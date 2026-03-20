"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek,
  isSameMonth, isSameDay, isToday, addMonths, subMonths, addWeeks, subWeeks,
  addDays, subDays, setHours, setMinutes, parseISO, startOfDay, endOfDay,
  eachHourOfInterval
} from "date-fns";
import { ja } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Plus, Copy, Check, Calendar,
  X, Edit2, Trash2, Clock, Users, Repeat, AlignLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getEvents, createEvent, updateEvent, deleteEvent, getCalendar, updateCalendarName, type CalendarEvent } from "@/app/actions/calendar";
import { extractEventsFromImage } from "@/app/actions/ai-calendar";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

// メンバーカラーパレット
const COLORS = [
  { label: "ブルー", value: "#3B82F6" },
  { label: "パープル", value: "#8B5CF6" },
  { label: "グリーン", value: "#10B981" },
  { label: "レッド", value: "#EF4444" },
  { label: "アンバー", value: "#F59E0B" },
  { label: "ピンク", value: "#EC4899" },
  { label: "シアン", value: "#06B6D4" },
  { label: "オレンジ", value: "#F97316" },
];

type ViewMode = "month" | "week" | "day";

type EventFormData = {
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
  color: string;
  member_name: string;
  is_recurring: boolean;
  recurrence_rule: string;
};

const defaultForm = (): EventFormData => ({
  title: "",
  description: "",
  start_time: format(setMinutes(setHours(new Date(), 10), 0), "yyyy-MM-dd'T'HH:mm"),
  end_time: format(setMinutes(setHours(new Date(), 11), 0), "yyyy-MM-dd'T'HH:mm"),
  is_all_day: false,
  color: "#3B82F6",
  member_name: "",
  is_recurring: false,
  recurrence_rule: "",
});

// イベントをその日に表示するか判定（繰り返し含む）
function getEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter(ev => {
    const start = parseISO(ev.start_time);
    const end = parseISO(ev.end_time);
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);

    // 通常イベント
    if (start <= dayEnd && end >= dayStart) return true;

    // 繰り返しイベント
    if (ev.is_recurring && ev.recurrence_rule) {
      if (ev.recurrence_rule === "daily") return start <= dayEnd;
      if (ev.recurrence_rule === "weekly") {
        return start.getDay() === day.getDay() && start <= dayEnd;
      }
      if (ev.recurrence_rule === "monthly") {
        return start.getDate() === day.getDate() && start <= dayEnd;
      }
    }
    return false;
  });
}

export default function FamilyCalendarPage() {
  const params = useParams();
  const calendarId = params.calendarId as string;

  const [calendarName, setCalendarName] = useState("ファミカレ");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");

  const [view, setView] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // ダイアログ状態
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState<CalendarEvent[] | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [form, setForm] = useState<EventFormData>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // イベント取得範囲を計算
  const fetchRange = useMemo(() => {
    const start = format(startOfMonth(subMonths(currentDate, 1)), "yyyy-MM-dd'T'00:00:00+09:00");
    const end = format(endOfMonth(addMonths(currentDate, 1)), "yyyy-MM-dd'T'23:59:59+09:00");
    return { start, end };
  }, [currentDate]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const [calData, eventsData] = await Promise.all([
      getCalendar(calendarId),
      getEvents(calendarId, fetchRange.start, fetchRange.end)
    ]);
    if (calData) {
      setCalendarName(calData.name);
    }
    setEvents(eventsData);
    setLoading(false);
  }, [calendarId, fetchRange]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const handleNameSave = async () => {
    const newName = editNameValue.trim();
    if (!newName) return;
    
    setCalendarName(newName);
    setIsEditingName(false);
    await updateCalendarName(calendarId, newName);
  };

  // URL コピー
  const handleCopy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ナビゲーション
  const navigate = (dir: "prev" | "next" | "today") => {
    if (dir === "today") { setCurrentDate(new Date()); return; }
    const delta = dir === "next" ? 1 : -1;
    if (view === "month") setCurrentDate(d => addMonths(d, delta));
    if (view === "week") setCurrentDate(d => addWeeks(d, delta));
    if (view === "day") setCurrentDate(d => addDays(d, delta));
  };

  const headerLabel = useMemo(() => {
    if (view === "month") return format(currentDate, "yyyy年M月", { locale: ja });
    if (view === "week") {
      const ws = startOfWeek(currentDate, { weekStartsOn: 0 });
      const we = endOfWeek(currentDate, { weekStartsOn: 0 });
      return `${format(ws, "M月d日")} 〜 ${format(we, "M月d日", { locale: ja })}`;
    }
    return format(currentDate, "yyyy年M月d日 (E)", { locale: ja });
  }, [view, currentDate]);

  // イベント追加フォームを開く
  const openNewForm = (date?: Date) => {
    const base = date || new Date();
    setForm({
      ...defaultForm(),
      start_time: format(setMinutes(setHours(base, 10), 0), "yyyy-MM-dd'T'HH:mm"),
      end_time: format(setMinutes(setHours(base, 11), 0), "yyyy-MM-dd'T'HH:mm"),
    });
    setEditingEvent(null);
    setShowForm(true);
  };

  // 編集フォームを開く
  const openEditForm = (ev: CalendarEvent) => {
    setForm({
      title: ev.title,
      description: ev.description || "",
      start_time: format(parseISO(ev.start_time), "yyyy-MM-dd'T'HH:mm"),
      end_time: format(parseISO(ev.end_time), "yyyy-MM-dd'T'HH:mm"),
      is_all_day: ev.is_all_day,
      color: ev.color,
      member_name: ev.member_name || "",
      is_recurring: ev.is_recurring,
      recurrence_rule: ev.recurrence_rule || "",
    });
    setEditingEvent(ev);
    setSelectedDayEvents(null);
    setShowForm(true);
  };

  // 保存
  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const payload = {
      ...form,
      start_time: new Date(form.start_time).toISOString(),
      end_time: new Date(form.end_time).toISOString(),
    };
    if (editingEvent) {
      await updateEvent(editingEvent.id, payload);
    } else {
      await createEvent(calendarId, payload);
    }
    await fetchEvents();
    setShowForm(false);
    setSaving(false);
  };

  // 削除
  const handleDelete = async (id: string) => {
    if (!confirm("このイベントを削除しますか？")) return;
    await deleteEvent(id);
    await fetchEvents();
    setSelectedDayEvents(null);
  };

  // AI画像解析
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("画像ファイルを選択してください");
      return;
    }

    setIsAnalyzing(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      try {
        const res = await extractEventsFromImage(base64, calendarId);
        if (res.success) {
          toast.success(`AIが${res.count}件の予定を抽出・登録しました！`);
          await fetchEvents();
        } else {
          toast.error(res.error || "解析に失敗しました");
        }
      } catch (err) {
        toast.error("エラーが発生しました");
      } finally {
        setIsAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
    // 同じファイルを再度選択できるようにリセット
    e.target.value = "";
  };

  // ================= 月ビュー =================
  const MonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start: calStart, end: calEnd });
    const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

    return (
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7 border-b border-slate-200 sticky top-0 bg-white z-10">
          {WEEKDAYS.map((d, i) => (
            <div key={d} className={`text-center text-xs font-semibold py-2 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-500"}`}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 flex-1">
          {days.map(day => {
            const dayEvents = getEventsForDay(events, day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            const today = isToday(day);
            return (
              <div
                key={day.toISOString()}
                onClick={() => { setSelectedDay(day); setSelectedDayEvents(getEventsForDay(events, day)); }}
                className={`min-h-[90px] border-b border-r border-slate-100 p-1.5 cursor-pointer hover:bg-slate-50 transition ${!isCurrentMonth ? "bg-slate-50/50" : "bg-white"}`}
              >
                <div className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1 ${
                  today ? "bg-violet-600 text-white" : isCurrentMonth ? "text-slate-700" : "text-slate-300"
                }`}>
                  {format(day, "d")}
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map(ev => (
                    <div
                      key={ev.id}
                      onClick={(e) => { e.stopPropagation(); openEditForm(ev); }}
                      className="text-[10px] px-1.5 py-0.5 rounded text-white truncate cursor-pointer hover:opacity-80 transition"
                      style={{ backgroundColor: ev.color }}
                    >
                      {!ev.is_all_day && <span className="mr-1 opacity-80">{format(parseISO(ev.start_time), "HH:mm")}</span>}
                      {ev.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-[10px] text-slate-500 pl-1">+{dayEvents.length - 3}件</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ================= 週ビュー =================
  const WeekView = () => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

    return (
      <div className="flex-1 overflow-auto">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-slate-200 sticky top-0 bg-white z-10">
          <div />
          {weekDays.map((day, i) => (
            <div key={day.toISOString()} className={`text-center py-2 border-l border-slate-100 ${isToday(day) ? "bg-violet-50" : ""}`}>
              <div className={`text-xs font-medium ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-500"}`}>{WEEKDAYS[i]}</div>
              <div className={`text-lg font-bold mx-auto w-8 h-8 flex items-center justify-center rounded-full ${isToday(day) ? "bg-violet-600 text-white" : "text-slate-700"}`}>
                {format(day, "d")}
              </div>
            </div>
          ))}
        </div>
        {/* 時間グリッド */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)]">
          {hours.map(hour => (
            <div key={hour} className="contents">
              <div className="text-right pr-2 text-xs text-slate-400 border-b border-slate-100 pt-1 h-14">
                {hour > 0 ? `${hour}:00` : ""}
              </div>
              {weekDays.map(day => {
                const dayEvents = getEventsForDay(events, day).filter(ev => {
                  if (ev.is_all_day) return false;
                  const evHour = parseISO(ev.start_time).getHours();
                  return evHour === hour;
                });
                return (
                  <div
                    key={day.toISOString()}
                    className={`border-b border-l border-slate-100 h-14 relative ${isToday(day) ? "bg-violet-50/30" : ""}`}
                    onClick={() => openNewForm(setHours(day, hour))}
                  >
                    {dayEvents.map(ev => (
                      <div
                        key={ev.id}
                        onClick={(e) => { e.stopPropagation(); openEditForm(ev); }}
                        className="absolute inset-x-0.5 top-0.5 rounded text-white text-[10px] px-1 py-0.5 truncate cursor-pointer hover:opacity-80 z-10"
                        style={{ backgroundColor: ev.color }}
                      >
                        {format(parseISO(ev.start_time), "HH:mm")} {ev.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ================= 日ビュー =================
  const DayView = () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const dayEvents = getEventsForDay(events, currentDate);

    return (
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-[60px_1fr]">
          {hours.map(hour => {
            const hourEvents = dayEvents.filter(ev => {
              if (ev.is_all_day) return false;
              return parseISO(ev.start_time).getHours() === hour;
            });
            return (
              <div key={hour} className="contents">
                <div className="text-right pr-2 text-xs text-slate-400 border-b border-slate-100 pt-1 h-16">
                  {hour > 0 ? `${hour}:00` : ""}
                </div>
                <div
                  className="border-b border-l border-slate-100 h-16 relative"
                  onClick={() => openNewForm(setHours(currentDate, hour))}
                >
                  {hourEvents.map(ev => (
                    <div
                      key={ev.id}
                      onClick={(e) => { e.stopPropagation(); openEditForm(ev); }}
                      className="absolute inset-x-1 top-0.5 rounded-lg text-white text-sm px-2 py-1 cursor-pointer hover:opacity-80 shadow-sm"
                      style={{ backgroundColor: ev.color, minHeight: "36px" }}
                    >
                      <div className="font-medium">{ev.title}</div>
                      <div className="text-xs opacity-80">
                        {format(parseISO(ev.start_time), "HH:mm")} 〜 {format(parseISO(ev.end_time), "HH:mm")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* ===== ヘッダー ===== */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white z-20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
              <Calendar className="w-4 h-4 text-white" />
            </div>
            {isEditingName ? (
              <div className="flex items-center gap-1 hidden sm:flex">
                <Input 
                  value={editNameValue} 
                  onChange={e => setEditNameValue(e.target.value)} 
                  className="h-8 w-32 text-sm font-bold" 
                  autoFocus
                  onBlur={() => !isEditingName && setIsEditingName(false)}
                  onKeyDown={e => { 
                    if(e.key === 'Enter') handleNameSave(); 
                    if (e.key === 'Escape') setIsEditingName(false); 
                  }}
                />
                <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={handleNameSave}>
                  <Check className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1 group hidden sm:flex">
                <span className="font-bold text-slate-800">{calendarName}</span>
                <button 
                  onClick={() => { setEditNameValue(calendarName); setIsEditingName(true); }} 
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-violet-600 transition w-6 h-6 flex items-center justify-center rounded"
                  title="カレンダー名を変更"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* ナビゲーション */}
          <div className="flex items-center gap-1">
            <button onClick={() => navigate("prev")} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition text-slate-600">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => navigate("today")} className="px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition">今日</button>
            <button onClick={() => navigate("next")} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition text-slate-600">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h1 className="text-base font-bold text-slate-800 hidden md:block">{headerLabel}</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* ビュー切り替え */}
          <div className="flex items-center bg-slate-100 rounded-lg p-1 gap-0.5">
            {(["month", "week", "day"] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${view === v ? "bg-white shadow-sm text-violet-700 font-bold" : "text-slate-500 hover:text-slate-700"}`}
              >
                {v === "month" ? "月" : v === "week" ? "週" : "日"}
              </button>
            ))}
          </div>

          {/* 共有ボタン */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? "コピー済み!" : "共有"}</span>
          </button>

          {/* [NEW] AI画像解析ボタン */}
          <div className="relative">
            <input
              type="file"
              id="ai-upload"
              className="hidden"
              accept="image/*"
              onChange={handleFileSelect}
              disabled={isAnalyzing}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={isAnalyzing}
              onClick={() => document.getElementById("ai-upload")?.click()}
              className="border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:text-violet-800 transition shadow-sm h-8 px-3 rounded-lg"
            >
              {isAnalyzing ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 mr-1.5 text-violet-500" />
              )}
              <span className="hidden sm:inline">{isAnalyzing ? "解析中..." : "写真から予定抽出"}</span>
            </Button>
          </div>

          {/* 追加ボタン */}
          <Button
            onClick={() => openNewForm()}
            className="bg-violet-600 hover:bg-violet-700 text-white h-8 px-3 rounded-lg text-sm font-medium"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            <span className="hidden sm:inline">追加</span>
          </Button>
        </div>
      </header>

      {/* ===== カレンダー本体 ===== */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 animate-pulse">読み込み中...</div>
      ) : (
        view === "month" ? <MonthView /> :
        view === "week" ? <WeekView /> :
        <DayView />
      )}

      {/* ===== 日別イベントモーダル（月ビューで日クリック時） ===== */}
      {selectedDayEvents !== null && selectedDay && !showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setSelectedDayEvents(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">
                {format(selectedDay, "M月d日 (E)", { locale: ja })}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { openNewForm(selectedDay); setSelectedDayEvents(null); }}
                  className="text-violet-600 text-sm font-medium hover:text-violet-700 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> 追加
                </button>
                <button onClick={() => setSelectedDayEvents(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 max-h-80 overflow-y-auto">
              {selectedDayEvents.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">予定はありません</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayEvents.map(ev => (
                    <div
                      key={ev.id}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 cursor-pointer transition group"
                      onClick={() => openEditForm(ev)}
                    >
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-slate-800 truncate">{ev.title}</p>
                        <p className="text-xs text-slate-400">
                          {ev.is_all_day ? "終日" : `${format(parseISO(ev.start_time), "HH:mm")} 〜 ${format(parseISO(ev.end_time), "HH:mm")}`}
                          {ev.member_name && ` · ${ev.member_name}`}
                        </p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); handleDelete(ev.id); }} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== イベント追加/編集ダイアログ ===== */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* ダイアログヘッダー */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-bold text-lg text-slate-800">
                {editingEvent ? "イベントを編集" : "イベントを追加"}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* タイトル */}
              <div>
                <Input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="タイトルを入力..."
                  className="text-base font-medium border-0 border-b-2 rounded-none px-0 focus-visible:ring-0 border-slate-200 focus:border-violet-500 transition"
                />
              </div>

              {/* 終日チェック */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_all_day"
                  checked={form.is_all_day}
                  onChange={e => setForm(f => ({ ...f, is_all_day: e.target.checked }))}
                  className="rounded accent-violet-600"
                />
                <Label htmlFor="is_all_day" className="text-sm text-slate-600 cursor-pointer">終日イベント</Label>
              </div>

              {/* 日時 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">開始</Label>
                  <input
                    type={form.is_all_day ? "date" : "datetime-local"}
                    value={form.is_all_day ? form.start_time.slice(0, 10) : form.start_time}
                    onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">終了</Label>
                  <input
                    type={form.is_all_day ? "date" : "datetime-local"}
                    value={form.is_all_day ? form.end_time.slice(0, 10) : form.end_time}
                    onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>

              {/* カラー選択 */}
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">カラー</Label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button
                      key={c.value}
                      title={c.label}
                      onClick={() => setForm(f => ({ ...f, color: c.value }))}
                      className={`w-8 h-8 rounded-full transition transform hover:scale-110 ${form.color === c.value ? "ring-2 ring-offset-2 ring-slate-400 scale-110" : ""}`}
                      style={{ backgroundColor: c.value }}
                    />
                  ))}
                </div>
              </div>

              {/* 担当者 */}
              <div className="space-y-1">
                <Label className="text-xs text-slate-500 flex items-center gap-1"><Users className="w-3 h-3" /> 担当者</Label>
                <Input
                  value={form.member_name}
                  onChange={e => setForm(f => ({ ...f, member_name: e.target.value }))}
                  placeholder="例: パパ、ママ、太郎..."
                  className="text-sm h-9"
                />
              </div>

              {/* 繰り返し */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_recurring"
                    checked={form.is_recurring}
                    onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked, recurrence_rule: e.target.checked ? "weekly" : "" }))}
                    className="rounded accent-violet-600"
                  />
                  <Label htmlFor="is_recurring" className="text-sm text-slate-600 cursor-pointer flex items-center gap-1">
                    <Repeat className="w-3 h-3" /> 繰り返しイベント
                  </Label>
                </div>
                {form.is_recurring && (
                  <select
                    value={form.recurrence_rule}
                    onChange={e => setForm(f => ({ ...f, recurrence_rule: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="daily">毎日</option>
                    <option value="weekly">毎週同じ曜日</option>
                    <option value="monthly">毎月同じ日</option>
                  </select>
                )}
              </div>

              {/* メモ */}
              <div className="space-y-1">
                <Label className="text-xs text-slate-500 flex items-center gap-1"><AlignLeft className="w-3 h-3" /> メモ</Label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="メモを追加..."
                  rows={2}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                />
              </div>
            </div>

            {/* アクションボタン */}
            <div className="flex items-center justify-between p-5 border-t border-slate-100">
              {editingEvent ? (
                <button
                  onClick={() => handleDelete(editingEvent.id)}
                  className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 transition"
                >
                  <Trash2 className="w-4 h-4" /> 削除
                </button>
              ) : <div />}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowForm(false)} className="h-9 text-sm">キャンセル</Button>
                <Button
                  onClick={handleSave}
                  disabled={!form.title.trim() || saving}
                  className="bg-violet-600 hover:bg-violet-700 text-white h-9 text-sm px-5"
                >
                  {saving ? "保存中..." : "保存"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
