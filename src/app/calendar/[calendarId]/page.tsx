"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, X, Pencil, Trash2, Check, Clock, User, CalendarDays, Settings2, Palette, Bell, BellOff, MapPin, ListChecks, Lock, Loader2, KeyRound, Copy, RefreshCw, Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  ensureCalendarExists,
  updateCalendarMembers,
  bulkUpdateEventMemberName,
  verifyCalendarPassword,
  updateCalendarPassword,
  type CalendarEvent,
  type CalendarEventItem,
  type CalendarMember,
} from "@/app/actions/family-calendar";
import { cn } from "@/lib/utils";
import { usePushNotification } from "@/hooks/usePushNotification";
import CalendarPasswordGate from "@/components/CalendarPasswordGate";
import { toast } from "sonner";

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

// ISOString → JST の YYYY-MM-DD（タイムゾーンずれ対策）
function toJSTDateStr(iso: string) {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(f.formatToParts(d).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type ModalMode = "create" | "edit" | "view" | "settings";
type ViewMode = "month" | "week" | "day";
type EditScope = "all" | "single";
interface Form {
  title: string; description: string; date: string;
  startTime: string; endTime: string; endDate: string; isAllDay: boolean; isMultiDay: boolean; memberName: string;
  location: string;
  isShared: boolean;
  items: CalendarEventItem[];
  isRecurring: boolean;
  recurrenceFreq: "daily" | "weekly" | "monthly";
  recurrenceDays: number[];
  reminderMinutesBefore: number | null;
}

const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "なし" },
  { value: 5,    label: "5分前" },
  { value: 10,   label: "10分前" },
  { value: 30,   label: "30分前" },
  { value: 60,   label: "1時間前" },
  { value: 1440, label: "1日前" },
];

function getWeekDays(dateStr: string): string[] {
  const [sy, sm, sd] = dateStr.split("-").map(Number);
  const dow = new Date(sy, sm - 1, sd).getDay(); // 0=Sun
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sy, sm - 1, sd - dow + i);
    return toLocalDateStr(d);
  });
}

function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function buildRecurrenceRule(freq: string, days: number[]): string {
  if (freq === "daily") return "DAILY";
  if (freq === "monthly") return "MONTHLY";
  if (days.length > 0) return `WEEKLY:${days.join(",")}`;
  return "WEEKLY";
}
function parseRecurrenceFreq(rule?: string | null): "daily" | "weekly" | "monthly" {
  if (!rule) return "weekly";
  if (rule.startsWith("DAILY")) return "daily";
  if (rule.startsWith("MONTHLY")) return "monthly";
  return "weekly";
}
function parseRecurrenceDays(rule?: string | null): number[] {
  if (!rule) return [];
  // EXDATEセクションを除いたWEEKLY部分だけを見る
  const base = rule.split(";")[0];
  if (!base.startsWith("WEEKLY:")) return [];
  return base.replace("WEEKLY:", "").split(",").map(Number).filter(n => !isNaN(n));
}
// 除外日のリストを取得（"EXDATE:2026-04-15,2026-04-22" → ["2026-04-15","2026-04-22"]）
function parseExceptions(rule?: string | null): string[] {
  if (!rule) return [];
  const part = rule.split(";").find(p => p.startsWith("EXDATE:"));
  if (!part) return [];
  return part.replace("EXDATE:", "").split(",").filter(Boolean);
}
// 除外日を追加したruleを返す
function addException(rule: string | null | undefined, dateStr: string): string {
  const base = rule || "WEEKLY";
  const existing = parseExceptions(base);
  if (existing.includes(dateStr)) return base;
  const newExceptions = [...existing, dateStr];
  const withoutExdate = base.split(";").filter(p => !p.startsWith("EXDATE:")).join(";");
  return `${withoutExdate};EXDATE:${newExceptions.join(",")}`;
}

// 繰り返しイベントをビュー期間内に展開する（除外日はスキップ）
function expandRecurringEvents(events: CalendarEvent[], viewStart: Date, viewEnd: Date): CalendarEvent[] {
  const nonRecurring = events.filter(e => !e.is_recurring);
  const recurring = events.filter(e => e.is_recurring);
  const instances: CalendarEvent[] = [];
  for (const ev of recurring) {
    const freq = parseRecurrenceFreq(ev.recurrence_rule);
    const days = parseRecurrenceDays(ev.recurrence_rule);
    const exceptions = parseExceptions(ev.recurrence_rule);
    const evStart = new Date(ev.start_time);
    const evEnd = new Date(ev.end_time);
    const duration = evEnd.getTime() - evStart.getTime();
    const cursorStart = evStart > viewStart ? new Date(evStart) : new Date(viewStart);
    let cursor = new Date(cursorStart.getFullYear(), cursorStart.getMonth(), cursorStart.getDate());
    while (cursor <= viewEnd) {
      const dateKey = toLocalDateStr(cursor);
      let matches = false;
      if (freq === "daily") {
        matches = true;
      } else if (freq === "weekly") {
        if (days.length > 0) matches = days.includes(cursor.getDay());
        else matches = cursor.getDay() === evStart.getDay();
      } else if (freq === "monthly") {
        matches = cursor.getDate() === evStart.getDate();
      }
      // 除外日はスキップ
      if (matches && !exceptions.includes(dateKey)) {
        const instStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), evStart.getHours(), evStart.getMinutes());
        const instEnd = new Date(instStart.getTime() + duration);
        instances.push({
          ...ev,
          id: `${ev.id};${dateKey}`,
          start_time: instStart.toISOString(),
          end_time: instEnd.toISOString(),
        });
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
  }
  return [...nonRecurring, ...instances];
}

// 繰り返しイベントのIDからベースIDを取得
function getBaseEventId(id: string): string {
  return id.includes(";") ? id.split(";")[0] : id;
}

const blankForm = (date = toLocalDateStr(new Date()), defaultMember = "家族"): Form => ({
  title: "", description: "", date,
  startTime: "09:00", endTime: "10:00", endDate: date, isAllDay: false, isMultiDay: false, memberName: defaultMember,
  location: "", isShared: true, items: [],
  isRecurring: false, recurrenceFreq: "weekly", recurrenceDays: [],
  reminderMinutesBefore: 10,
});

export default function FamilyCalendarPage() {
  const params = useParams();
  const calendarId = params?.calendarId as string;
  const today = new Date();

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [anchorDate, setAnchorDate] = useState<Date>(today);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarName, setCalendarName] = useState("ファミリーカレンダー");
  const [members, setMembers] = useState<CalendarMember[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: ModalMode; event?: CalendarEvent; date?: string } | null>(null);
  const [form, setForm] = useState<Form>(blankForm());
  const [saving, setSaving] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTagModal, setBulkTagModal] = useState(false);
  const [daySheet, setDaySheet] = useState<string | null>(null); // "YYYY-MM-DD" (月表示のみ)
  
  // パスワード認証関連
  const [hasPassword, setHasPassword] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [aiReview, setAiReview] = useState<string | null>(null);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  // 複数日イベントの編集スコープ選択
  const [scopePicker, setScopePicker] = useState<{ event: CalendarEvent; fromDate: string } | null>(null);
  // 繰り返しイベントのスコープ選択（この日のみ / すべて）
  const [recurringPicker, setRecurringPicker] = useState<{
    event: CalendarEvent; dateStr: string; action: "edit" | "delete";
  } | null>(null);
  // 繰り返しの「この日のみ編集」モード
  const [recurringDayEdit, setRecurringDayEdit] = useState<{ baseEvent: CalendarEvent; dateStr: string } | null>(null);
  // 「この日のみ」編集モード：保存時に元イベントを分割する
  const [singleDayEdit, setSingleDayEdit] = useState<{ originalEvent: CalendarEvent; fromDate: string } | null>(null);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  // 初回読み込み時にlocalStorageから表示ユーザーを取得
  useEffect(() => {
    const saved = localStorage.getItem(`family_calendar_user_${calendarId}`);
    if (saved) setCurrentUser(saved);
  }, [calendarId]);

  const handleUserSwitch = (name: string) => {
    setCurrentUser(name);
    localStorage.setItem(`family_calendar_user_${calendarId}`, name);
    toast.success(`${name}として表示します`);
  };

  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();

  function navPrev() {
    if (viewMode === "month") setAnchorDate(new Date(year, month - 1, 1));
    else if (viewMode === "week") setAnchorDate(new Date(year, month, anchorDate.getDate() - 7));
    else setAnchorDate(new Date(year, month, anchorDate.getDate() - 1));
  }
  function navNext() {
    if (viewMode === "month") setAnchorDate(new Date(year, month + 1, 1));
    else if (viewMode === "week") setAnchorDate(new Date(year, month, anchorDate.getDate() + 7));
    else setAnchorDate(new Date(year, month, anchorDate.getDate() + 1));
  }
  function switchView(v: ViewMode) {
    setViewMode(v);
    setDaySheet(null);
  }
  function getNavTitle() {
    if (viewMode === "month") return { main: `${month + 1}月`, sub: String(year) };
    if (viewMode === "week") {
      const w = getWeekDays(toLocalDateStr(anchorDate));
      const [fy, fm, fd] = w[0].split("-").map(Number);
      const [, lm, ld] = w[6].split("-").map(Number);
      return { main: `${fm}/${fd}〜${lm}/${ld}`, sub: String(fy) };
    }
    return { main: `${month + 1}月${anchorDate.getDate()}日（${WEEKDAYS[anchorDate.getDay()]}）`, sub: String(year) };
  }

  const [notifySheet, setNotifySheet] = useState(false);
  const [notifyPrefs, setNotifyPrefs] = useState<{ memberName: string | null; notifyOthers: boolean }>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`push_prefs_${calendarId}`);
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return { memberName: null, notifyOthers: true };
  });

  const { state: pushState, isProcessing: pushProcessing, subscribe: subscribePush, unsubscribe: unsubscribePush, updatePrefs: updatePushPrefs } = usePushNotification(calendarId, notifyPrefs);

  const saveNotifyPrefs = async (prefs: { memberName: string | null; notifyOthers: boolean }) => {
    setNotifyPrefs(prefs);
    localStorage.setItem(`push_prefs_${calendarId}`, JSON.stringify(prefs));
    if (pushState === "subscribed") {
      await updatePushPrefs(prefs);
    }
    toast.success("通知設定を保存しました");
    setNotifySheet(false);
  };

  function getMember(name?: string | null) {
    return members.find((m) => m.name === name) ?? members[0] ?? COLOR_PRESETS[4];
  }

  // カレンダー初期化
  useEffect(() => {
    if (!calendarId) return;
    ensureCalendarExists(calendarId, "ファミリーカレンダー").then(async (cal) => {
      if (cal?.name) setCalendarName(cal.name);
      if (cal?.members) setMembers(cal.members);
      
      const hasPwd = cal?.hasPassword ?? false;
      setHasPassword(hasPwd);
      
      if (hasPwd) {
        // 保存済みのパスワードで検証
        const savedPwd = localStorage.getItem(`family_calendar_auth_${calendarId}`);
        if (savedPwd) {
          const res = await verifyCalendarPassword(calendarId, savedPwd);
          if (res.success) setIsAuthenticated(true);
          else localStorage.removeItem(`family_calendar_auth_${calendarId}`);
        }
      } else {
        setIsAuthenticated(true);
      }
      setAuthLoading(false);
    });
  }, [calendarId]);

  // イベント取得
  const fetchEvents = useCallback(async () => {
    if (!calendarId) return;
    setLoading(true);
    const y = anchorDate.getFullYear(), mo = anchorDate.getMonth(), d = anchorDate.getDate();
    let startD: Date, endD: Date;
    if (viewMode === "month") {
      startD = new Date(y, mo, 1);
      endD = new Date(y, mo + 1, 0, 23, 59, 59);
    } else if (viewMode === "week") {
      const dow = anchorDate.getDay();
      startD = new Date(y, mo, d - dow);
      endD = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate() + 6, 23, 59, 59);
    } else {
      startD = new Date(y, mo, d, 0, 0, 0);
      endD = new Date(y, mo, d + 1, 23, 59, 59); // 翌日分も取得
    }
    const data = await getEvents(calendarId, startD.toISOString(), endD.toISOString());
    setEvents(expandRecurringEvents(data, startD, endD));
    setLoading(false);
  }, [calendarId, viewMode, anchorDate]);

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
      // フィルタリング: 非共有かつ自分以外の予定は隠す
      if (!e.is_shared && currentUser && e.member_name !== currentUser) return false;
      if (filter && e.member_name !== filter) return false;
      return toJSTDateStr(e.start_time) === dateStr;
    });
  }

  function eventsForDayStr(dateStr: string, applyFilter = false) {
    return events.filter((e) => {
      // フィルタリング: 非共有かつ自分以外の予定は隠す
      if (!e.is_shared && currentUser && e.member_name !== currentUser) return false;
      if (applyFilter && filter && e.member_name !== filter) return false;
      return toJSTDateStr(e.start_time) === dateStr;
    });
  }

  // モーダル操作
  function openCreate(date: string) { setForm(blankForm(date, members[0]?.name || "家族")); setModal({ mode: "create", date }); }
  function openView(e: CalendarEvent, fromDate?: string) {
    // 繰り返しイベントは実IDを持つ元イベントを表示
    setModal({ mode: "view", event: { ...e, id: getBaseEventId(e.id) }, date: fromDate });
  }

  function handleCopy(ev: CalendarEvent) {
    const startDateStr = toJSTDateStr(ev.start_time);
    const endDateStr = toJSTDateStr(ev.end_time);
    const s = new Date(ev.start_time);
    const en = new Date(ev.end_time);
    const multiDay = startDateStr !== endDateStr;
    setForm({
      title: ev.title,
      description: ev.description ?? "",
      date: startDateStr,
      startTime: `${String(s.getHours()).padStart(2,"0")}:${String(s.getMinutes()).padStart(2,"0")}`,
      endTime: `${String(en.getHours()).padStart(2,"0")}:${String(en.getMinutes()).padStart(2,"0")}`,
      endDate: endDateStr,
      isAllDay: ev.is_all_day,
      isMultiDay: multiDay,
      memberName: ev.member_name ?? "家族",
      location: ev.location ?? "",
      isShared: ev.is_shared ?? true,
      items: ev.items ? [...ev.items] : [],
      isRecurring: false,
      recurrenceFreq: "weekly",
      recurrenceDays: [],
      reminderMinutesBefore: ev.reminder_minutes_before ?? null,
    });
    setModal({ mode: "create" });
  }

  async function handleAiReview() {
    setAiReviewLoading(true);
    setAiReview(null);
    const y = anchorDate.getFullYear(), mo = anchorDate.getMonth();
    const monthEvents = events.filter(e => {
      const d = new Date(e.start_time);
      return d.getFullYear() === y && d.getMonth() === mo;
    });
    const eventList = monthEvents.map(e => {
      const s = new Date(e.start_time);
      return `・${e.member_name || "家族"}：${e.title}（${s.getMonth()+1}/${s.getDate()} ${e.is_all_day ? "終日" : formatTime(e.start_time)}〜）`;
    }).join("\n");
    try {
      const res = await fetch("/api/ai-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: `${y}年${mo+1}月`, events: eventList }),
      });
      const json = await res.json();
      setAiReview(json.review || "レビューを取得できませんでした");
    } catch {
      setAiReview("AI秘書の呼び出しに失敗しました");
    } finally {
      setAiReviewLoading(false);
    }
  }

  function openEdit(e: CalendarEvent, fromDate?: string) {
    const isInstance = e.id.includes(";");
    // 繰り返しインスタンスはスコープ選択を出す
    if (isInstance) {
      const dateStr = e.id.split(";")[1];
      const baseEvent = { ...e, id: getBaseEventId(e.id) };
      setRecurringPicker({ event: baseEvent, dateStr, action: "edit" });
      return;
    }
    const baseEvent = { ...e, id: getBaseEventId(e.id) };
    const startDateStr = toJSTDateStr(baseEvent.start_time);
    const endDateStr = toJSTDateStr(baseEvent.end_time);
    const isMultiDay = startDateStr !== endDateStr;
    if (isMultiDay && fromDate && !baseEvent.is_recurring) {
      setScopePicker({ event: baseEvent, fromDate });
      return;
    }
    applyEditForm(baseEvent);
  }

  function openRecurringDayEdit(baseEvent: CalendarEvent, dateStr: string) {
    const evStart = new Date(baseEvent.start_time);
    const evEnd = new Date(baseEvent.end_time);
    setForm({
      title: baseEvent.title,
      description: baseEvent.description ?? "",
      date: dateStr,
      endDate: dateStr,
      startTime: `${String(evStart.getHours()).padStart(2,"0")}:${String(evStart.getMinutes()).padStart(2,"0")}`,
      endTime: `${String(evEnd.getHours()).padStart(2,"0")}:${String(evEnd.getMinutes()).padStart(2,"0")}`,
      isAllDay: baseEvent.is_all_day,
      isMultiDay: false,
      memberName: baseEvent.member_name ?? "家族",
      location: baseEvent.location ?? "",
      isShared: baseEvent.is_shared ?? true,
      items: baseEvent.items ? [...baseEvent.items] : [],
      isRecurring: false,
      recurrenceFreq: "weekly",
      recurrenceDays: [],
      reminderMinutesBefore: baseEvent.reminder_minutes_before ?? null,
    });
    setRecurringDayEdit({ baseEvent, dateStr });
    setRecurringPicker(null);
    setModal({ mode: "create" });
  }

  function applyEditForm(e: CalendarEvent) {
    const s = new Date(e.start_time), en = new Date(e.end_time);
    const startDateStr = toJSTDateStr(e.start_time);
    const endDateStr = toJSTDateStr(e.end_time);
    const multiDay = startDateStr !== endDateStr;
    setForm({
      title: e.title, description: e.description ?? "",
      date: startDateStr,
      startTime: `${String(s.getHours()).padStart(2,"0")}:${String(s.getMinutes()).padStart(2,"0")}`,
      endTime: `${String(en.getHours()).padStart(2,"0")}:${String(en.getMinutes()).padStart(2,"0")}`,
      endDate: endDateStr,
      isAllDay: e.is_all_day, isMultiDay: multiDay, memberName: e.member_name ?? "家族",
      location: e.location ?? "", isShared: e.is_shared ?? true, items: e.items ? [...e.items] : [],
      isRecurring: e.is_recurring ?? false,
      recurrenceFreq: parseRecurrenceFreq(e.recurrence_rule),
      recurrenceDays: parseRecurrenceDays(e.recurrence_rule),
      reminderMinutesBefore: e.reminder_minutes_before ?? null,
    });
    setSingleDayEdit(null);
    setModal({ mode: "edit", event: e });
  }

  function applyEditFormSingleDay(e: CalendarEvent, fromDate: string) {
    const s = new Date(e.start_time), en = new Date(e.end_time);
    setForm({
      title: e.title, description: e.description ?? "",
      date: fromDate, endDate: fromDate,
      startTime: `${String(s.getHours()).padStart(2,"0")}:${String(s.getMinutes()).padStart(2,"0")}`,
      endTime: `${String(en.getHours()).padStart(2,"0")}:${String(en.getMinutes()).padStart(2,"0")}`,
      isAllDay: e.is_all_day, isMultiDay: false, memberName: e.member_name ?? "家族",
      location: e.location ?? "", isShared: e.is_shared ?? true, items: e.items ? [...e.items] : [],
      isRecurring: false, recurrenceFreq: "weekly", recurrenceDays: [],
      reminderMinutesBefore: e.reminder_minutes_before ?? null,
    });
    setSingleDayEdit({ originalEvent: e, fromDate });
    setModal({ mode: "edit", event: e });
  }

  // 保存
  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    const member = getMember(form.memberName);
    const endDateTarget = form.isMultiDay ? form.endDate : form.date;
    const startIso = form.isAllDay
      ? `${form.date}T00:00:00+09:00`
      : `${form.date}T${form.startTime}:00+09:00`;
    const endIso = form.isAllDay
      ? `${endDateTarget}T23:59:59+09:00`
      : `${endDateTarget}T${form.endTime}:00+09:00`;
    const payload = {
      title: form.title, description: form.description || null,
      location: form.location || null,
      items: form.items.length > 0 ? form.items : null,
      start_time: startIso, end_time: endIso,
      is_all_day: form.isAllDay, color: member.color,
      member_name: form.memberName,
      is_recurring: form.isRecurring,
      recurrence_rule: form.isRecurring ? buildRecurrenceRule(form.recurrenceFreq, form.recurrenceDays) : null,
      is_shared: form.isShared,
      reminder_minutes_before: form.reminderMinutesBefore,
    };

    let res: { success: boolean; error?: string };

    if (recurringDayEdit) {
      // ─── 繰り返しのこの日のみ編集：新規1日イベント作成 + 除外日を追加 ───
      res = await createEvent(calendarId, { ...payload, is_recurring: false, recurrence_rule: null });
      if (res.success) {
        const newRule = addException(recurringDayEdit.baseEvent.recurrence_rule, recurringDayEdit.dateStr);
        await updateEvent(recurringDayEdit.baseEvent.id, { recurrence_rule: newRule });
      }
    } else if (singleDayEdit) {
      // ─── この日のみ編集：新規1日イベント作成 + 元イベント分割 ───
      res = await createEvent(calendarId, payload);
      if (res.success) {
        const orig = singleDayEdit.originalEvent;
        const fd = singleDayEdit.fromDate;
        const origStart = toJSTDateStr(orig.start_time);
        const origEnd = toJSTDateStr(orig.end_time);
        const s = new Date(orig.start_time), en = new Date(orig.end_time);
        const hhmm = (d: Date) => `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
        const shift = (dateStr: string, days: number) => {
          const [y, m, d] = dateStr.split("-").map(Number);
          return toLocalDateStr(new Date(y, m - 1, d + days));
        };

        if (origStart === fd && origEnd === fd) {
          // 元々1日イベント → 削除
          await deleteEvent(orig.id);
        } else if (origStart === fd) {
          // 先頭日 → 開始日を翌日に
          const newStart = shift(fd, 1);
          await updateEvent(orig.id, {
            start_time: orig.is_all_day ? `${newStart}T00:00:00+09:00` : `${newStart}T${hhmm(s)}:00+09:00`,
          });
        } else if (origEnd === fd) {
          // 末尾日 → 終了日を前日に
          const newEnd = shift(fd, -1);
          await updateEvent(orig.id, {
            end_time: orig.is_all_day ? `${newEnd}T23:59:59+09:00` : `${newEnd}T${hhmm(en)}:00+09:00`,
          });
        } else {
          // 中間日 → 元イベントを前半に縮め、後半を新規作成
          const dayBefore = shift(fd, -1);
          const dayAfter = shift(fd, 1);
          await updateEvent(orig.id, {
            end_time: orig.is_all_day ? `${dayBefore}T23:59:59+09:00` : `${dayBefore}T${hhmm(en)}:00+09:00`,
          });
          await createEvent(calendarId, {
            title: orig.title, description: orig.description ?? null,
            location: orig.location ?? null, items: orig.items ?? null,
            start_time: orig.is_all_day ? `${dayAfter}T00:00:00+09:00` : `${dayAfter}T${hhmm(s)}:00+09:00`,
            end_time: orig.end_time,
            is_all_day: orig.is_all_day, color: orig.color,
            member_name: orig.member_name ?? null, is_recurring: false, recurrence_rule: null,
            is_shared: orig.is_shared ?? true,
            reminder_minutes_before: orig.reminder_minutes_before ?? null,
          });
        }
      }
    } else if (modal?.mode === "create") {
      res = await createEvent(calendarId, payload);
    } else if (modal?.mode === "edit" && modal.event) {
      res = await updateEvent(modal.event.id, payload);
    } else {
      res = { success: false, error: "不明なモード" };
    }

    if (!res.success) {
      toast.error(res.error || "保存に失敗しました");
      setSaving(false);
      return;
    }

    const wasRecurringDay = !!recurringDayEdit;
    const wasSingleDay = !!singleDayEdit;
    setSingleDayEdit(null);
    setRecurringDayEdit(null);
    toast.success(wasRecurringDay ? "この日のみ変更しました" : wasSingleDay ? "この日のみ変更しました" : modal?.mode === "create" ? "予定を追加しました" : "予定を更新しました");
    await fetchEvents();
    setSaving(false);
    setModal(null);
  }

  async function handleDelete(id: string) {
    const isInstance = id.includes(";");
    if (isInstance) {
      // 繰り返しインスタンス → スコープ選択シートを出す（イベント情報を events から引く）
      const baseId = getBaseEventId(id);
      const dateStr = id.split(";")[1];
      const baseEvent = events.find(e => e.id === id || e.id === baseId);
      if (baseEvent) {
        setModal(null);
        setRecurringPicker({ event: { ...baseEvent, id: baseId }, dateStr, action: "delete" });
        return;
      }
    }
    if (!confirm("この予定を削除しますか？")) return;
    await deleteEvent(id);
    await fetchEvents();
    setModal(null);
  }

  async function handleDeleteRecurringDay(baseEvent: CalendarEvent, dateStr: string) {
    const newRule = addException(baseEvent.recurrence_rule, dateStr);
    await updateEvent(baseEvent.id, { recurrence_rule: newRule });
    await fetchEvents();
    setRecurringPicker(null);
    toast.success("この日の予定を削除しました");
  }

  async function handleDeleteAllRecurring(baseEvent: CalendarEvent) {
    if (!confirm("繰り返しの予定をすべて削除しますか？")) return;
    await deleteEvent(baseEvent.id);
    await fetchEvents();
    setRecurringPicker(null);
    toast.success("繰り返し予定をすべて削除しました");
  }

  async function handleToggleItem(ev: CalendarEvent, idx: number) {
    if (!ev.items) return;
    const newItems = ev.items.map((item, i) => i === idx ? { ...item, checked: !item.checked } : item);
    await updateEvent(ev.id, { items: newItems });
    await fetchEvents();
    // Update modal event reference
    if (modal?.mode === "view" && modal.event?.id === ev.id) {
      setModal({ mode: "view", event: { ...ev, items: newItems } });
    }
  }

  async function handleBulkTagChange(newMemberName: string) {
    setSaving(true);
    const member = getMember(newMemberName);
    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          updateEvent(id, { member_name: newMemberName, color: member.color })
        )
      );
      await fetchEvents();
    } finally {
      setSaving(false);
      setBulkTagModal(false);
      setSelectMode(false);
      setSelectedIds(new Set());
    }
  }

  async function handleUpdateMembers(newMembers: CalendarMember[], renames: { oldName: string; newName: string; bulk: boolean }[]) {
    setSaving(true);
    try {
      const result = await updateCalendarMembers(calendarId, newMembers);
      if (!result.success) {
        toast.error("保存に失敗しました: " + (result.error ?? "不明なエラー"));
        return;
      }
      // 一括変更チェックが入っているメンバーの既存予定を更新
      for (const r of renames) {
        if (r.bulk && r.oldName !== r.newName) {
          await bulkUpdateEventMemberName(calendarId, r.oldName, r.newName);
        }
      }
      setMembers(newMembers);
      await fetchEvents();
      setModal(null);
    } catch (e) {
      toast.error("保存中にエラーが発生しました。再度お試しください。");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (hasPassword && !isAuthenticated) {
    return <CalendarPasswordGate calendarId={calendarId} onVerified={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* 通知設定シート */}
      {notifySheet && (
        <NotifySettingsSheet
          members={members}
          pushState={pushState}
          pushProcessing={pushProcessing}
          prefs={notifyPrefs}
          onSubscribe={(prefs) => { subscribePush(prefs); saveNotifyPrefs(prefs); }}
          onUnsubscribe={unsubscribePush}
          onSave={saveNotifyPrefs}
          onClose={() => setNotifySheet(false)}
        />
      )}

      {/* ヘッダー */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        {/* 上段：タイトル・ボタン */}
        <div className="px-3 py-2 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-violet-400 shrink-0" />
          <span className="font-bold text-sm flex-1 truncate">{calendarName}</span>
          {/* 通知ベルボタン */}
          {pushState !== "unsupported" && (
            <button
              onClick={() => setNotifySheet(true)}
              disabled={pushProcessing || pushState === "loading"}
              className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                pushState === "subscribed"
                  ? "bg-violet-600 border-violet-500"
                  : pushState === "denied"
                  ? "bg-slate-800 border-slate-700 opacity-40 cursor-not-allowed"
                  : "bg-slate-800 border-slate-700 hover:bg-slate-700"
              }`}
            >
              {pushState === "subscribed"
                ? <Bell className="w-4 h-4 text-white" />
                : <BellOff className="w-4 h-4 text-slate-400" />
              }
            </button>
          )}
          <button onClick={() => setModal({ mode: "settings" })}
            className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
            <Settings2 className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* 閲覧者選択（ぼーる・まち対応） */}
        <div className="px-3 pb-2 flex items-center gap-2">
          <div className="text-[10px] font-bold text-slate-500 mr-1 uppercase tracking-wider">閲覧中の人:</div>
          <div className="flex bg-slate-800 p-0.5 rounded-lg flex-1">
            {members.slice(0, 2).map((m) => {
              const isActive = currentUser === m.name;
              return (
                <button
                  key={m.name}
                  onClick={() => handleUserSwitch(m.name)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-1 rounded-md text-[10px] font-black transition-all",
                    isActive ? "bg-slate-700 text-white shadow-sm ring-1 ring-white/10" : "text-slate-500 hover:text-slate-400"
                  )}
                >
                  <div className={cn("w-1.5 h-1.5 rounded-full", m.bg)} />
                  {m.name}
                </button>
              );
            })}
            <button
              onClick={() => handleUserSwitch("")}
              className={cn(
                "flex-1 py-1 rounded-md text-[10px] font-black transition-all",
                !currentUser ? "bg-slate-700 text-white shadow-sm ring-1 ring-white/10" : "text-slate-500 hover:text-slate-400"
              )}
            >
              全員
            </button>
          </div>
        </div>

        {/* 下段：ビュー切替タブ（大きく・目立つ） */}
        <div className="flex border-t border-slate-800">
          {([
            { v: "month" as ViewMode, label: "月表示", sub: "カレンダー" },
            { v: "week"  as ViewMode, label: "週表示", sub: "7日間リスト" },
            { v: "day"   as ViewMode, label: "日表示", sub: "タイムライン" },
          ]).map(({ v, label, sub }) => (
            <button key={v} onClick={() => switchView(v)}
              className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 border-b-2 transition-colors ${
                viewMode === v
                  ? "border-violet-500 bg-violet-950/30"
                  : "border-transparent hover:bg-slate-800/50"
              }`}>
              <span className={`text-sm font-black leading-none ${viewMode === v ? "text-violet-400" : "text-slate-400"}`}>
                {label}
              </span>
              <span className={`text-[9px] leading-none ${viewMode === v ? "text-violet-500/70" : "text-slate-600"}`}>
                {sub}
              </span>
            </button>
          ))}
        </div>

        {/* メンバーフィルター */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none px-3 py-2 border-t border-slate-800/60">
          <button onClick={() => setFilter(null)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition whitespace-nowrap ${!filter ? "bg-violet-500 text-white" : "bg-slate-800 text-slate-400"}`}>
            全員
          </button>
          {members.map((m) => (
            <button key={m.name} onClick={() => setFilter(filter === m.name ? null : m.name)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition whitespace-nowrap ${filter === m.name ? `${m.bg} text-white` : "bg-slate-800 text-slate-400"}`}>
              {m.name}
            </button>
          ))}
        </div>
      </header>

      {/* ナビ */}
      {(() => {
        const { main, sub } = getNavTitle();
        return (
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <button onClick={navPrev}
              className="w-12 h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition shadow-lg">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="text-center">
              <p className="text-2xl font-black tracking-tight">{main}</p>
              <p className="text-xs text-slate-500 font-bold tracking-widest">{sub}</p>
            </div>
            <button onClick={navNext}
              className="w-12 h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition shadow-lg">
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        );
      })()}

      {/* ─── 月表示 ─── */}
      {viewMode === "month" && (<>
        {/* 曜日ヘッダー */}
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
                <div key={idx} onClick={() => setDaySheet(dateStr)}
                  className="bg-slate-900 h-20 p-1 cursor-pointer hover:bg-slate-800 transition group relative">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mb-0.5 mx-auto ${isToday ? "bg-violet-500 text-white" : dow===0 ? "text-red-400" : dow===6 ? "text-blue-400" : "text-slate-300"}`}>
                    {day}
                  </div>
                  <div className="space-y-0.5 overflow-hidden">
                    {dayEvents.slice(0, 2).map((e) => {
                      const m = getMember(e.member_name);
                      const isMatch = e.member_name === "試合" || e.title.includes("🔴");
                      return (
                        <div key={getBaseEventId(e.id)} onClick={(ev) => { ev.stopPropagation(); setDaySheet(dateStr); }}
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
        <div className="px-4 py-5 pb-32">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">今月の予定</p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAiReview}
                disabled={aiReviewLoading}
                className="flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full bg-violet-900/50 text-violet-300 border border-violet-700/40 hover:bg-violet-800/60 transition disabled:opacity-40"
              >
                {aiReviewLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                AI秘書
              </button>
              <button onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
                className={`text-xs font-bold px-3 py-1 rounded-full transition ${selectMode ? "bg-violet-500 text-white" : "bg-slate-800 text-slate-400"}`}>
                {selectMode ? "キャンセル" : "選択する"}
              </button>
            </div>
          </div>
          {/* AI秘書レビュー */}
          {aiReview && (
            <div className="mb-4 bg-violet-950/40 border border-violet-700/40 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-xs font-bold text-violet-300">AI秘書からのコメント</span>
                </div>
                <button onClick={() => setAiReview(null)} className="text-slate-500 hover:text-slate-300">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{aiReview}</p>
            </div>
          )}
          {selectMode && selectedIds.size > 0 && (
            <div className="mb-3 flex items-center gap-2 bg-violet-900/30 border border-violet-700/40 rounded-xl px-4 py-2">
              <span className="text-xs text-violet-300 flex-1">{selectedIds.size}件選択中</span>
              <button onClick={() => setBulkTagModal(true)}
                className="text-xs font-bold bg-violet-500 hover:bg-violet-400 text-white px-4 py-1.5 rounded-full transition">
                タグを変更
              </button>
            </div>
          )}
          {events.filter(e => {
            if (!e.is_shared && currentUser && e.member_name !== currentUser) return false;
            return !filter || e.member_name === filter;
          }).length === 0 ? (
            <p className="text-slate-600 text-sm text-center py-6">予定なし</p>
          ) : (
            <div className="space-y-2">
              {events.filter(e => {
                if (!e.is_shared && currentUser && e.member_name !== currentUser) return false;
                return !filter || e.member_name === filter;
              }).map((e) => {
                const m = getMember(e.member_name);
                const s = new Date(e.start_time);
                const isSelected = selectedIds.has(e.id);
                return (
                  <div key={e.id}
                    onClick={() => {
                      if (selectMode) { const next = new Set(selectedIds); isSelected ? next.delete(e.id) : next.add(e.id); setSelectedIds(next); }
                      else openView(e);
                    }}
                    className={cn("flex items-center gap-3 rounded-2xl p-4 cursor-pointer transition border shadow-sm",
                      isSelected ? "bg-violet-900/40 border-violet-600"
                      : (e.member_name === "試合" || e.title.includes("🔴")) ? "bg-red-950/20 border-red-900/50 hover:bg-slate-800"
                      : "bg-slate-900 border-slate-800 hover:bg-slate-800")}>
                    {selectMode && (
                      <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition ${isSelected ? "bg-violet-500 border-violet-500" : "border-slate-600"}`}>
                        {isSelected && <Check className="w-3 h-3 text-white stroke-[3]" />}
                      </div>
                    )}
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
                    {e.member_name && <span className={cn("text-xs font-black px-3 py-1 rounded-full shrink-0", m.light, m.text)}>{e.member_name}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </>)}

      {/* ─── 週表示 ─── */}
      {viewMode === "week" && (
        <div className="px-3 py-3 pb-28 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-7 h-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : getWeekDays(toLocalDateStr(anchorDate)).map((dateStr) => {
            const [wy, wm, wd] = dateStr.split("-").map(Number);
            const dow = new Date(wy, wm - 1, wd).getDay();
            const dayEvts = eventsForDayStr(dateStr).filter(e => !filter || e.member_name === filter)
              .sort((a, b) => {
                if (a.is_all_day && !b.is_all_day) return -1;
                if (!a.is_all_day && b.is_all_day) return 1;
                return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
              });
            const isToday = dateStr === toLocalDateStr(today);
            const isAnchor = dateStr === toLocalDateStr(anchorDate);
            return (
              <div key={dateStr}>
                {/* 日ヘッダー */}
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => { setAnchorDate(new Date(wy, wm - 1, wd)); switchView("day"); }}
                    className={`w-10 h-10 rounded-full flex flex-col items-center justify-center shrink-0 transition ${isToday ? "bg-violet-500" : isAnchor ? "bg-slate-700 ring-2 ring-violet-500" : "bg-slate-800 hover:bg-slate-700"}`}>
                    <span className={`text-[9px] font-bold leading-none ${isToday ? "text-white/70" : dow === 0 ? "text-red-400" : dow === 6 ? "text-blue-400" : "text-slate-500"}`}>{WEEKDAYS[dow]}</span>
                    <span className={`text-sm font-black leading-tight ${isToday ? "text-white" : dow === 0 ? "text-red-400" : dow === 6 ? "text-blue-400" : "text-slate-200"}`}>{wd}</span>
                  </button>
                  <div className={`flex-1 h-px ${isToday ? "bg-violet-700" : "bg-slate-800"}`} />
                  <button onClick={() => openCreate(dateStr)} className="text-slate-600 hover:text-violet-400 transition active:scale-90">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {/* イベント */}
                {dayEvts.length === 0 ? (
                  <div className="ml-12 text-xs text-slate-700 py-1 italic">予定なし</div>
                ) : (
                  <div className="ml-12 space-y-1.5">
                    {dayEvts.map((ev) => {
                      const mbr = getMember(ev.member_name);
                      const isMatch = ev.member_name === "試合" || ev.title.includes("🔴");
                      return (
                        <div key={ev.id} onClick={() => openView(ev, dateStr)}
                          className={cn("flex items-stretch rounded-xl border overflow-hidden cursor-pointer transition active:scale-[0.98]",
                            isMatch ? "bg-red-950/30 border-red-900/50" : "bg-slate-800 border-slate-700 hover:bg-slate-750")}>
                          <div className={cn("w-1 shrink-0", isMatch ? "bg-red-500" : mbr.bg)} />
                          <div className="flex items-center gap-2 px-2.5 py-2 flex-1 min-w-0">
                            <div className="text-center min-w-[38px] shrink-0">
                              {ev.is_all_day ? <span className="text-[9px] font-bold text-slate-400">終日</span> : (
                                <>
                                  <p className="text-xs font-black text-white tabular-nums leading-none">{formatTime(ev.start_time)}</p>
                                  <p className="text-[9px] text-slate-500">〜{formatTime(ev.end_time)}</p>
                                </>
                              )}
                            </div>
                            <div className="w-px self-stretch bg-slate-700 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm text-white truncate">{isMatch && "🔴 "}{ev.title}</p>
                              {ev.location && <p className="text-[10px] text-slate-400 truncate">📍 {ev.location}</p>}
                              {ev.items && ev.items.length > 0 && <p className="text-[9px] text-slate-500">☑ {ev.items.filter(i=>i.checked).length}/{ev.items.length}</p>}
                            </div>
                            {ev.member_name && <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0", mbr.light, mbr.text)}>{ev.member_name}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── 日表示 ─── */}
      {viewMode === "day" && (() => {
        const dateStr = toLocalDateStr(anchorDate);
        const tomorrow = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() + 1);
        const tomorrowStr = toLocalDateStr(tomorrow);
        const allDayEvts = events.filter(e => e.is_all_day && toJSTDateStr(e.start_time) === dateStr && (!filter || e.member_name === filter));
        const timedEvts = events.filter(e => !e.is_all_day && toJSTDateStr(e.start_time) === dateStr && (!filter || e.member_name === filter))
          .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
        const tomorrowEvts = events.filter(e => toJSTDateStr(e.start_time) === tomorrowStr && (!filter || e.member_name === filter))
          .sort((a, b) => {
            if (a.is_all_day && !b.is_all_day) return -1;
            if (!a.is_all_day && b.is_all_day) return 1;
            return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
          });
        const nowHour = new Date().getHours();
        return (
          <div className="px-4 py-4 pb-28">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="w-7 h-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (<>
              {/* 終日 */}
              {allDayEvts.length > 0 && (
                <div className="mb-4 space-y-1.5">
                  <p className="text-[10px] font-bold text-slate-500 mb-1">終日</p>
                  {allDayEvts.map(ev => {
                    const mbr = getMember(ev.member_name);
                    return (
                      <div key={ev.id} onClick={() => openView(ev, dateStr)}
                        className={cn("flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer transition", mbr.light)}>
                        <span className={cn("font-bold text-sm flex-1 truncate", mbr.text)}>{ev.title}</span>
                        {ev.member_name && <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0", mbr.light, mbr.text)}>{ev.member_name}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* タイムライン */}
              <div className="space-y-0">
                {Array.from({ length: 18 }, (_, i) => i + 6).map((hour) => {
                  const hourEvts = timedEvts.filter(e => new Date(e.start_time).getHours() === hour);
                  const isNowHour = hour === nowHour && dateStr === toLocalDateStr(today);
                  return (
                    <div key={hour} className="flex gap-3 min-h-[52px]">
                      <div className="w-10 pt-1 text-right shrink-0">
                        <span className={`text-xs font-bold tabular-nums ${isNowHour ? "text-violet-400" : "text-slate-700"}`}>{String(hour).padStart(2,"0")}:00</span>
                      </div>
                      <div className={`flex-1 border-t pt-1 pb-1 space-y-1.5 relative ${isNowHour ? "border-violet-500/60" : "border-slate-800"}`}>
                        {hourEvts.map(ev => {
                          const mbr = getMember(ev.member_name);
                          const isMatch = ev.member_name === "試合" || ev.title.includes("🔴");
                          return (
                            <div key={ev.id} onClick={() => openView(ev, dateStr)}
                              className={cn("rounded-xl overflow-hidden cursor-pointer transition active:scale-[0.98] flex items-stretch border",
                                isMatch ? "bg-red-950/30 border-red-900/50" : "bg-slate-800 border-slate-700 hover:bg-slate-750")}>
                              <div className={cn("w-1 shrink-0", isMatch ? "bg-red-500" : mbr.bg)} />
                              <div className="px-2.5 py-2 flex-1 min-w-0">
                                <p className="font-bold text-sm text-white truncate">{isMatch && "🔴 "}{ev.title}</p>
                                <p className="text-[10px] text-slate-400">{formatTime(ev.start_time)}〜{formatTime(ev.end_time)}</p>
                                {ev.location && <p className="text-[10px] text-slate-500 truncate">📍 {ev.location}</p>}
                                {ev.items && ev.items.length > 0 && <p className="text-[9px] text-slate-500">☑ {ev.items.filter(i=>i.checked).length}/{ev.items.length}</p>}
                              </div>
                              {ev.member_name && <span className={cn("text-[9px] font-bold px-2 self-center shrink-0 mr-2 py-0.5 rounded-full", mbr.light, mbr.text)}>{ev.member_name}</span>}
                            </div>
                          );
                        })}
                        {hourEvts.length === 0 && (
                          <button onClick={() => {
                            const t = `${String(hour).padStart(2,"0")}:00`;
                            setForm({ ...blankForm(dateStr, members[0]?.name || "家族"), startTime: t, endTime: addOneHour(t) });
                            setModal({ mode: "create", date: dateStr });
                          }} className="w-full h-7 text-slate-700 hover:text-violet-500 hover:bg-slate-900 rounded-lg transition text-xs text-left px-2 opacity-0 hover:opacity-100">
                            ＋
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* ─── 明日のプレビュー ─── */}
              <div className="mt-6">
                {/* 区切り線 */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px flex-1 bg-slate-800" />
                  <button
                    onClick={() => { setAnchorDate(tomorrow); }}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-1.5 rounded-full transition active:scale-95"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-black text-slate-300">
                      明日 {tomorrow.getMonth()+1}/{tomorrow.getDate()}（{WEEKDAYS[tomorrow.getDay()]}）
                    </span>
                  </button>
                  <div className="h-px flex-1 bg-slate-800" />
                </div>

                {tomorrowEvts.length === 0 ? (
                  <p className="text-center text-slate-600 text-sm py-4 italic">明日の予定はありません</p>
                ) : (
                  <div className="space-y-2">
                    {tomorrowEvts.map((ev) => {
                      const mbr = getMember(ev.member_name);
                      const isMatch = ev.member_name === "試合" || ev.title.includes("🔴");
                      return (
                        <div key={ev.id}
                          onClick={() => { setAnchorDate(tomorrow); openView(ev, tomorrowStr); }}
                          className={cn(
                            "flex items-stretch rounded-2xl border overflow-hidden cursor-pointer transition active:scale-[0.98]",
                            isMatch ? "bg-red-950/20 border-red-900/40" : "bg-slate-900 border-slate-700 hover:bg-slate-800"
                          )}
                        >
                          <div className={cn("w-1.5 shrink-0 opacity-60", isMatch ? "bg-red-500" : mbr.bg)} />
                          <div className="flex items-center gap-3 px-3 py-3 flex-1 min-w-0">
                            <div className="text-center min-w-[44px] shrink-0">
                              {ev.is_all_day ? (
                                <span className="text-[10px] font-bold text-slate-500">終日</span>
                              ) : (
                                <>
                                  <p className="text-sm font-black text-slate-300 tabular-nums leading-none">{formatTime(ev.start_time)}</p>
                                  <p className="text-[10px] text-slate-600 tabular-nums">〜{formatTime(ev.end_time)}</p>
                                </>
                              )}
                            </div>
                            <div className="w-px self-stretch bg-slate-800" />
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm text-slate-300 truncate">{isMatch && "🔴 "}{ev.title}</p>
                              {ev.location && <p className="text-xs text-slate-500 truncate">📍 {ev.location}</p>}
                              {ev.items && ev.items.length > 0 && (
                                <p className="text-[10px] text-slate-600">☑ {ev.items.filter(i => i.checked).length}/{ev.items.length}</p>
                              )}
                            </div>
                            {ev.member_name && (
                              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 opacity-70", mbr.light, mbr.text)}>
                                {ev.member_name}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 追加ボタン */}
              <div className="mt-4">
                <button onClick={() => openCreate(dateStr)}
                  className="w-full bg-violet-600 hover:bg-violet-500 active:scale-95 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition shadow-xl shadow-violet-900/20">
                  <Plus className="w-5 h-5 stroke-[3]" />この日に予定を追加
                </button>
              </div>
            </>)}
          </div>
        );
      })()}

      {/* ─── 編集スコープ選択シート ─── */}
      {scopePicker && (() => {
        const ev = scopePicker.event;
        const fd = scopePicker.fromDate;
        const [, fm, fdDay] = fd.split("-").map(Number);
        const startStr = toJSTDateStr(ev.start_time);
        const endStr = toJSTDateStr(ev.end_time);
        const [, sm2, sd2] = startStr.split("-").map(Number);
        const [, em2, ed2] = endStr.split("-").map(Number);
        const m = getMember(ev.member_name);
        return (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) setScopePicker(null); }}>
            <div className="bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-700 overflow-hidden shadow-2xl">
              {/* ヘッダー */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800">
                <div>
                  <p className="text-xs text-slate-500 mb-1">編集の範囲を選択</p>
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${m.bg}`} />
                    <h2 className="text-base font-black truncate">{ev.title}</h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {sm2}/{sd2}（{WEEKDAYS[new Date(ev.start_time).getDay()]}）〜{em2}/{ed2}（{WEEKDAYS[new Date(ev.end_time).getDay()]}）
                  </p>
                </div>
                <button onClick={() => setScopePicker(null)} className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center border border-slate-700">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                {/* この日のみ */}
                <button
                  onClick={() => { applyEditFormSingleDay(ev, fd); setScopePicker(null); }}
                  className="w-full text-left bg-violet-950/40 hover:bg-violet-900/50 border-2 border-violet-700 rounded-2xl p-4 transition active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center shrink-0">
                      <CalendarDays className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-black text-white">{fm}/{fdDay}（{WEEKDAYS[new Date(+ev.start_time.slice(0,4), +fd.split("-")[1]-1, fdDay).getDay()]}）のみ変更</p>
                      <p className="text-xs text-slate-400 mt-0.5">この日だけ別の予定として保存。他の日は変わりません</p>
                    </div>
                  </div>
                </button>

                {/* 全日程 */}
                <button
                  onClick={() => { applyEditForm(ev); setScopePicker(null); }}
                  className="w-full text-left bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-2xl p-4 transition active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                      <ChevronRight className="w-5 h-5 text-slate-300" />
                    </div>
                    <div>
                      <p className="font-black text-white">全日程を変更</p>
                      <p className="text-xs text-slate-400 mt-0.5">{sm2}/{sd2}〜{em2}/{ed2} の予定すべてを変更します</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── 繰り返し予定スコープ選択シート ─── */}
      {recurringPicker && (() => {
        const { event: ev, dateStr, action } = recurringPicker;
        const [dy, dm, dd] = dateStr.split("-").map(Number);
        const dow = new Date(dy, dm - 1, dd).getDay();
        const m = getMember(ev.member_name);
        const isEdit = action === "edit";
        return (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) setRecurringPicker(null); }}>
            <div className="bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-700 overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800">
                <div>
                  <p className="text-xs text-slate-500 mb-1">{isEdit ? "変更の範囲を選択" : "削除の範囲を選択"}</p>
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${m.bg}`} />
                    <h2 className="text-base font-black truncate">{ev.title}</h2>
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-900/40 text-violet-300 border border-violet-700/30">
                      <RotateCcw className="w-2.5 h-2.5" />繰り返し
                    </span>
                  </div>
                </div>
                <button onClick={() => setRecurringPicker(null)} className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center border border-slate-700">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                {/* この日のみ */}
                <button
                  onClick={() => {
                    if (isEdit) {
                      openRecurringDayEdit(ev, dateStr);
                    } else {
                      handleDeleteRecurringDay(ev, dateStr);
                    }
                  }}
                  className="w-full text-left bg-violet-950/40 hover:bg-violet-900/50 border-2 border-violet-700 rounded-2xl p-4 transition active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center shrink-0">
                      <CalendarDays className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-black text-white">{dm}/{dd}（{WEEKDAYS[dow]}）のみ{isEdit ? "変更" : "削除"}</p>
                      <p className="text-xs text-slate-400 mt-0.5">この日だけ{isEdit ? "別の予定として保存" : "削除"}。他の日は変わりません</p>
                    </div>
                  </div>
                </button>
                {/* すべての繰り返し */}
                <button
                  onClick={() => {
                    if (isEdit) {
                      setRecurringPicker(null);
                      applyEditForm(ev);
                    } else {
                      handleDeleteAllRecurring(ev);
                    }
                  }}
                  className="w-full text-left bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-2xl p-4 transition active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isEdit ? "bg-slate-700" : "bg-red-900/60"}`}>
                      {isEdit
                        ? <RotateCcw className="w-5 h-5 text-slate-300" />
                        : <Trash2 className="w-5 h-5 text-red-400" />
                      }
                    </div>
                    <div>
                      <p className={`font-black ${isEdit ? "text-white" : "text-red-400"}`}>
                        すべての繰り返しを{isEdit ? "変更" : "削除"}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">今後の繰り返し予定すべてに反映されます</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 一括タグ変更モーダル */}
      {bulkTagModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setBulkTagModal(false); }}>
          <div className="bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-700 overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h2 className="text-lg font-black">タグを変更（{selectedIds.size}件）</h2>
              <button onClick={() => setBulkTagModal(false)} className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition border border-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-2">
              <p className="text-xs text-slate-500 mb-3">変更先のタグを選んでください</p>
              {members.map(m => (
                <button key={m.name}
                  onClick={() => handleBulkTagChange(m.name)}
                  disabled={saving}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-700 hover:bg-slate-800 transition disabled:opacity-40`}
                >
                  <div className={`w-4 h-4 rounded-full ${m.bg}`} />
                  <span className="font-bold text-white">{m.name}</span>
                  {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin ml-auto" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── 日別ボトムシート ─── */}
      {daySheet && (() => {
        const sheetEvents = eventsForDayStr(daySheet);
        const [sy, sm, sd] = daySheet.split("-").map(Number);
        const sheetDate = new Date(sy, sm - 1, sd);
        const dow = sheetDate.getDay();
        const isToday = daySheet === toLocalDateStr(today);
        return (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-end sm:items-center justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) setDaySheet(null); }}
          >
            <div className="bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-700 shadow-2xl flex flex-col max-h-[80dvh]">

              {/* ヘッダー */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800 shrink-0">
                <div>
                  <p className="text-xs text-slate-500 font-bold tracking-widest">{sy}年 {sm}月</p>
                  <h2 className="text-2xl font-black flex items-center gap-2">
                    <span className={dow === 0 ? "text-red-400" : dow === 6 ? "text-blue-400" : "text-white"}>
                      {sd}日（{WEEKDAYS[dow]}）
                    </span>
                    {isToday && <span className="text-xs font-bold bg-violet-500 text-white px-2 py-0.5 rounded-full">今日</span>}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { openCreate(daySheet); }}
                    className="h-9 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm flex items-center gap-1.5 transition active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    追加
                  </button>
                  <button
                    onClick={() => setDaySheet(null)}
                    className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition border border-slate-700"
                  >
                    <X className="w-4 h-4 text-slate-300" />
                  </button>
                </div>
              </div>

              {/* 週ストリップ */}
              <div className="flex gap-1 px-4 py-2 shrink-0 border-b border-slate-800">
                {getWeekDays(daySheet).map((d) => {
                  const [wy, wm, wd] = d.split("-").map(Number);
                  const isSelected = d === daySheet;
                  const isTodayDay = d === toLocalDateStr(today);
                  const dayEvts = eventsForDayStr(d);
                  const dow = new Date(wy, wm - 1, wd).getDay();
                  return (
                    <button key={d} onClick={() => setDaySheet(d)}
                      className={`flex flex-col items-center flex-1 py-1.5 rounded-xl transition active:scale-95 ${isSelected ? "bg-violet-600" : "bg-slate-800 hover:bg-slate-700"}`}>
                      <span className={`text-[9px] font-bold ${isSelected ? "text-white/70" : dow === 0 ? "text-red-400" : dow === 6 ? "text-blue-400" : "text-slate-500"}`}>
                        {WEEKDAYS[dow]}
                      </span>
                      <span className={`text-sm font-black leading-tight ${isSelected ? "text-white" : isTodayDay ? "text-violet-400" : "text-slate-200"}`}>
                        {wd}
                      </span>
                      <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${dayEvts.length > 0 ? (isSelected ? "bg-white/70" : "bg-violet-400") : "bg-transparent"}`} />
                    </button>
                  );
                })}
              </div>

              {/* イベントリスト */}
              <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
                {sheetEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-600">
                    <CalendarDays className="w-12 h-12 mb-3 opacity-30" />
                    <p className="text-sm font-semibold">この日の予定はありません</p>
                    <button
                      onClick={() => openCreate(daySheet)}
                      className="mt-4 text-violet-400 text-sm underline underline-offset-2"
                    >
                      予定を追加する
                    </button>
                  </div>
                ) : (
                  sheetEvents
                    .sort((a, b) => {
                      if (a.is_all_day && !b.is_all_day) return -1;
                      if (!a.is_all_day && b.is_all_day) return 1;
                      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
                    })
                    .map((ev) => {
                      const m = getMember(ev.member_name);
                      const isMatch = ev.member_name === "試合" || ev.title.includes("🔴");
                      return (
                        <div
                          key={ev.id}
                          onClick={() => openView(ev, daySheet!)}
                          className={cn(
                            "flex items-stretch gap-0 rounded-2xl border overflow-hidden cursor-pointer transition active:scale-[0.98] shadow-sm",
                            isMatch
                              ? "bg-red-950/30 border-red-900/50 hover:bg-red-950/50"
                              : "bg-slate-800 border-slate-700 hover:bg-slate-750"
                          )}
                        >
                          {/* カラーバー */}
                          <div className={cn("w-1.5 shrink-0", isMatch ? "bg-red-500" : m.bg)} />
                          <div className="flex items-center gap-3 px-3 py-3 flex-1 min-w-0">
                            {/* 時間 */}
                            <div className="text-center min-w-[44px]">
                              {ev.is_all_day ? (
                                <span className="text-[10px] font-bold text-slate-400">終日</span>
                              ) : (
                                <>
                                  <p className="text-sm font-black text-white tabular-nums leading-none">{formatTime(ev.start_time)}</p>
                                  <p className="text-[10px] text-slate-500 tabular-nums">〜{formatTime(ev.end_time)}</p>
                                </>
                              )}
                            </div>
                            {/* 区切り */}
                            <div className="w-px self-stretch bg-slate-700" />
                            {/* タイトル・タグ */}
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-[15px] text-white truncate">
                                {isMatch && "🔴 "}{ev.title}
                              </p>
                              {(ev.description || ev.location) && (
                                <p className="text-xs text-slate-400 truncate mt-0.5">
                                  {ev.location ? `📍 ${ev.location}` : ev.description}
                                </p>
                              )}
                              {ev.items && ev.items.length > 0 && (
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                  ☑ {ev.items.filter(i => i.checked).length}/{ev.items.length}
                                </p>
                              )}
                            </div>
                            {ev.member_name && (
                              <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full shrink-0", m.light, m.text)}>
                                {ev.member_name}
                              </span>
                            )}
                            {/* 編集アイコン */}
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); setDaySheet(null); handleCopy(ev); }}
                                className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition"
                                title="コピー"
                              >
                                <Copy className="w-3.5 h-3.5 text-slate-300" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); openEdit(ev, daySheet!); }}
                                className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition"
                              >
                                <Pencil className="w-3.5 h-3.5 text-slate-300" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(ev.id); }}
                                className="w-8 h-8 rounded-lg bg-red-900/40 hover:bg-red-900/60 flex items-center justify-center transition"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>

              {/* フッター */}
              <div className="px-4 pb-6 pt-3 border-t border-slate-800 shrink-0">
                <button
                  onClick={() => openCreate(daySheet)}
                  className="w-full bg-violet-600 hover:bg-violet-500 active:scale-95 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition shadow-xl shadow-violet-900/20 text-base"
                >
                  <Plus className="w-5 h-5 stroke-[3]" />
                  この日に予定を追加
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* FAB */}
      <button onClick={() => openCreate(toLocalDateStr(today))}
        className="fixed bottom-6 right-5 w-14 h-14 bg-violet-500 hover:bg-violet-400 active:scale-95 rounded-2xl shadow-lg shadow-violet-900/50 flex items-center justify-center z-20 transition">
        <Plus className="w-7 h-7" />
      </button>

      {/* モーダル */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) { setModal(null); setRecurringDayEdit(null); } }}>
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
                        <button onClick={() => { setModal(null); handleCopy(ev); }} className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition border border-slate-700" title="コピー">
                          <Copy className="w-4 h-4 text-slate-300" />
                        </button>
                        <button onClick={() => openEdit(ev, modal.date)} className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition border border-slate-700">
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
                          {(() => {
                            const startStr = `${s.getFullYear()}/${s.getMonth()+1}/${s.getDate()}（${WEEKDAYS[s.getDay()]}）`;
                            const endDateStr = toJSTDateStr(ev.end_time);
                            const startDateStr = toJSTDateStr(ev.start_time);
                            const isMultiDay = startDateStr !== endDateStr;
                            if (ev.is_all_day) {
                              return isMultiDay
                                ? `${startStr} 〜 ${en.getFullYear()}/${en.getMonth()+1}/${en.getDate()}（${WEEKDAYS[en.getDay()]}） 終日`
                                : `${startStr} 終日`;
                            }
                            return isMultiDay
                              ? `${startStr} ${formatTime(ev.start_time)} 〜 ${en.getFullYear()}/${en.getMonth()+1}/${en.getDate()}（${WEEKDAYS[en.getDay()]}） ${formatTime(ev.end_time)}`
                              : `${startStr} ${formatTime(ev.start_time)} 〜 ${formatTime(ev.end_time)}`;
                          })()}
                        </span>
                      </div>
                      {ev.member_name && (
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-500 shrink-0" />
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${m.light} ${m.text}`}>{ev.member_name}</span>
                          {ev.is_recurring && (
                            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-900/40 text-violet-300 border border-violet-700/30">
                              <RotateCcw className="w-2.5 h-2.5" />繰り返し
                            </span>
                          )}
                        </div>
                      )}
                      {ev.description && (
                        <p className="text-slate-400 bg-slate-800 rounded-xl p-3 leading-relaxed border border-slate-700">{ev.description}</p>
                      )}
                      {ev.location && (
                        <div className="flex items-center gap-2 text-slate-300">
                          <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
                          <span className="text-sm">{ev.location}</span>
                        </div>
                      )}
                      {ev.items && ev.items.length > 0 && (
                        <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 space-y-2">
                          <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1 mb-2">
                            <ListChecks className="w-3 h-3" />持ち物リスト
                          </p>
                          {ev.items.map((item, idx) => (
                            <button key={idx} type="button"
                              onClick={() => handleToggleItem(ev, idx)}
                              className="w-full flex items-center gap-3 text-left hover:bg-slate-700/50 rounded-lg px-1 py-1 transition">
                              <div className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition ${item.checked ? "bg-violet-500 border-violet-500" : "border-slate-600"}`}>
                                {item.checked && <Check className="w-3 h-3 text-white stroke-[3]" />}
                              </div>
                              <span className={`text-sm ${item.checked ? "line-through text-slate-500" : "text-slate-200"}`}>{item.text}</span>
                            </button>
                          ))}
                        </div>
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
                  <div>
                    <h2 className="text-lg font-black">
                      {recurringDayEdit
                        ? "この日のみ変更"
                        : modal.mode === "create"
                        ? "予定を追加"
                        : singleDayEdit
                        ? "この日のみ編集"
                        : "予定を編集"}
                    </h2>
                    {recurringDayEdit && (
                      <p className="text-xs text-violet-400 mt-0.5 flex items-center gap-1">
                        <RotateCcw className="w-3 h-3" />
                        {recurringDayEdit.dateStr.replace(/-/g, "/")} のみ変更
                      </p>
                    )}
                    {singleDayEdit && (
                      <p className="text-xs text-violet-400 mt-0.5">
                        {singleDayEdit.fromDate.replace(/-/g, "/")} のみ変更
                      </p>
                    )}
                  </div>
                  <button onClick={() => { setModal(null); setRecurringDayEdit(null); }} className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition border border-slate-700">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-5 space-y-4 overflow-y-auto max-h-[65vh] scrollbar-none">

                  {/* タイトル（予測入力付き） */}
                  <div className="relative">
                    <label className="text-xs font-bold text-slate-400 block mb-1.5">タイトル</label>
                    <input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                      placeholder="例: パパ サッカー試合" autoFocus
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500 text-sm" />
                    {form.title.length >= 1 && (() => {
                      const q = form.title.toLowerCase();
                      const suggestions = [...new Set(
                        events.filter(e => e.title.toLowerCase().includes(q) && e.title !== form.title)
                          .map(e => e.title)
                      )].slice(0, 4);
                      if (suggestions.length === 0) return null;
                      return (
                        <div className="absolute z-10 top-full mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-xl">
                          {suggestions.map(s => (
                            <button key={s} type="button"
                              onClick={() => setForm({...form, title: s})}
                              className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-700 transition">
                              {s}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
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
                    <label className="text-xs font-bold text-slate-400 block mb-1.5">開始日</label>
                    <input type="date" value={form.date}
                      onChange={e => setForm({...form, date: e.target.value, endDate: e.target.value > form.endDate ? e.target.value : form.endDate})}
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

                  {/* 時間（終日でない場合） */}
                  {!form.isAllDay && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-slate-400 block mb-1.5">
                          <Clock className="w-3 h-3 inline mr-1" />開始時間
                        </label>
                        <input type="time" value={form.startTime}
                          onChange={e => { const s = e.target.value; setForm({...form, startTime: s, endTime: addOneHour(s)}); }}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-violet-500 text-sm" />
                      </div>
                      {!form.isMultiDay && (
                        <div>
                          <label className="text-xs font-bold text-slate-400 block mb-1.5">
                            <Clock className="w-3 h-3 inline mr-1" />終了時間
                          </label>
                          <input type="time" value={form.endTime}
                            onChange={e => setForm({...form, endTime: e.target.value})}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-violet-500 text-sm" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* 翌日以降チェック */}
                  <div className="flex items-center justify-between bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-800">
                    <span className="text-sm text-slate-300">翌日以降に終わる</span>
                    <button onClick={() => setForm({...form, isMultiDay: !form.isMultiDay, endDate: form.date})}
                      className={`w-12 h-6 rounded-full transition-colors relative ${form.isMultiDay ? "bg-violet-500" : "bg-slate-700"}`}>
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all ${form.isMultiDay ? "left-[26px]" : "left-0.5"}`} />
                    </button>
                  </div>

                  {/* 繰り返し設定 */}
                  <div className="flex items-center justify-between bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-800">
                    <div className="flex items-center gap-2">
                      <RotateCcw className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-300">繰り返し</span>
                    </div>
                    <button onClick={() => setForm({...form, isRecurring: !form.isRecurring})}
                      className={`w-12 h-6 rounded-full transition-colors relative ${form.isRecurring ? "bg-violet-500" : "bg-slate-700"}`}>
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all ${form.isRecurring ? "left-[26px]" : "left-0.5"}`} />
                    </button>
                  </div>
                  {form.isRecurring && (
                    <div className="bg-slate-800/30 rounded-xl p-3 border border-violet-700/30 space-y-3">
                      {/* 頻度 */}
                      <div className="flex gap-2">
                        {(["daily", "weekly", "monthly"] as const).map((f) => (
                          <button key={f} onClick={() => setForm({...form, recurrenceFreq: f})}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${form.recurrenceFreq === f ? "bg-violet-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"}`}>
                            {f === "daily" ? "毎日" : f === "weekly" ? "毎週" : "毎月"}
                          </button>
                        ))}
                      </div>
                      {/* 毎週の場合：曜日選択 */}
                      {form.recurrenceFreq === "weekly" && (
                        <div className="flex gap-1">
                          {WEEKDAYS.map((label, i) => {
                            const sel = form.recurrenceDays.includes(i);
                            return (
                              <button key={i} onClick={() => {
                                const next = sel ? form.recurrenceDays.filter(d => d !== i) : [...form.recurrenceDays, i];
                                setForm({...form, recurrenceDays: next});
                              }}
                                className={`flex-1 py-1.5 rounded-lg text-[11px] font-black transition ${sel ? (i===0?"bg-red-600 text-white":i===6?"bg-blue-600 text-white":"bg-violet-600 text-white") : "bg-slate-700 text-slate-500 hover:bg-slate-600"}`}>
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <p className="text-[10px] text-violet-400">※ 編集・削除すると全ての繰り返しに反映されます</p>
                    </div>
                  )}

                  {/* 共有設定 */}
                  <div className="flex items-center justify-between bg-violet-900/10 rounded-xl px-4 py-3 border border-violet-900/40">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-violet-100">家族に予定を共有する</span>
                      <span className="text-[10px] text-violet-400">
                        {form.isShared ? "全員のカレンダーに表示されます" : "自分のカレンダーにのみ表示されます"}
                      </span>
                    </div>
                    <button onClick={() => setForm({...form, isShared: !form.isShared})}
                      className={`w-12 h-6 rounded-full transition-colors relative ${form.isShared ? "bg-violet-500" : "bg-slate-700"}`}>
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all ${form.isShared ? "left-[26px]" : "left-0.5"}`} />
                    </button>
                  </div>

                  {/* リマインド */}
                  <div className="bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-800">
                    <div className="flex items-center gap-2 mb-2">
                      <Bell className="w-4 h-4 text-amber-400" />
                      <span className="text-sm font-bold text-slate-200">リマインド</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {REMINDER_OPTIONS.map((opt) => {
                        const sel = form.reminderMinutesBefore === opt.value;
                        return (
                          <button
                            key={String(opt.value)}
                            type="button"
                            onClick={() => setForm({ ...form, reminderMinutesBefore: opt.value })}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                              sel ? "bg-amber-500 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    {form.isAllDay && form.reminderMinutesBefore !== null && (
                      <p className="text-[10px] text-slate-500 mt-2">※ 終日予定は当日 0:00 を基準に通知します</p>
                    )}
                  </div>

                  {/* 終了日・終了時間（翌日以降の場合） */}
                  {form.isMultiDay && (
                    <div className="bg-slate-800/30 rounded-xl p-3 border border-slate-700 space-y-3">
                      <div>
                        <label className="text-xs font-bold text-slate-400 block mb-1.5">終了日</label>
                        <input type="date" value={form.endDate} min={form.date}
                          onChange={e => setForm({...form, endDate: e.target.value})}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500 text-sm" />
                      </div>
                      {!form.isAllDay && (
                        <div>
                          <label className="text-xs font-bold text-slate-400 block mb-1.5">
                            <Clock className="w-3 h-3 inline mr-1" />終了時間
                          </label>
                          <input type="time" value={form.endTime}
                            onChange={e => setForm({...form, endTime: e.target.value})}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-violet-500 text-sm" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* メモ */}
                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-1.5">メモ（任意）</label>
                    <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                      placeholder="会場、持ち物など..." rows={3}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500 text-sm resize-none" />
                  </div>

                  {/* 場所 */}
                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-1.5 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />場所（任意）
                    </label>
                    <input value={form.location} onChange={e => setForm({...form, location: e.target.value})}
                      placeholder="例: 〇〇体育館、駅前公園..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500 text-sm" />
                  </div>

                  {/* 持ち物リスト */}
                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-1.5 flex items-center gap-1">
                      <ListChecks className="w-3 h-3" />持ち物リスト（任意）
                    </label>
                    <div className="space-y-2">
                      {form.items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <button type="button"
                            onClick={() => setForm({...form, items: form.items.map((it, i) => i === idx ? {...it, checked: !it.checked} : it)})}
                            className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition ${item.checked ? "bg-violet-500 border-violet-500" : "border-slate-600"}`}>
                            {item.checked && <Check className="w-3 h-3 text-white stroke-[3]" />}
                          </button>
                          <input value={item.text}
                            onChange={e => setForm({...form, items: form.items.map((it, i) => i === idx ? {...it, text: e.target.value} : it)})}
                            className={`flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 ${item.checked ? "line-through text-slate-500" : ""}`} />
                          <button type="button"
                            onClick={() => setForm({...form, items: form.items.filter((_, i) => i !== idx)})}
                            className="w-7 h-7 rounded-lg bg-red-900/30 hover:bg-red-900/50 flex items-center justify-center text-red-400 transition">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <button type="button"
                        onClick={() => setForm({...form, items: [...form.items, { text: "", checked: false }]})}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 transition text-sm">
                        <Plus className="w-3.5 h-3.5" />項目を追加
                      </button>
                    </div>
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
              <MemberSettings 
                members={members} 
                calendarId={calendarId}
                hasPassword={hasPassword}
                onSave={handleUpdateMembers} 
                onPasswordUpdate={(pwd) => {
                  setHasPassword(!!pwd);
                  if (pwd) localStorage.setItem(`family_calendar_auth_${calendarId}`, pwd);
                  else localStorage.removeItem(`family_calendar_auth_${calendarId}`);
                }}
                onCancel={() => setModal(null)} 
                saving={saving} 
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── メンバー設定コンポーネント ───────────────────────────────────
function MemberSettings({ members, calendarId, hasPassword, onSave, onPasswordUpdate, onCancel, saving }: {
  members: CalendarMember[];
  calendarId: string;
  hasPassword: boolean;
  onSave: (m: CalendarMember[], renames: { oldName: string; newName: string; bulk: boolean }[]) => void;
  onPasswordUpdate: (pwd: string | null) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [localMembers, setLocalMembers] = useState<CalendarMember[]>([...members]);
  // 元の名前を記録（一括変更の比較用）
  const [originalNames] = useState<string[]>(members.map(m => m.name));
  // 一括変更チェック状態
  const [bulkFlags, setBulkFlags] = useState<boolean[]>(members.map(() => false));
  
  // パスワード設定
  const [newPassword, setNewPassword] = useState("");
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const updateMember = (index: number, updates: Partial<CalendarMember>) => {
    const next = [...localMembers];
    next[index] = { ...next[index], ...updates };
    setLocalMembers(next);
  };

  const addMember = () => {
    const preset = COLOR_PRESETS[localMembers.length % COLOR_PRESETS.length];
    setLocalMembers([...localMembers, { name: "新しい名前", ...preset }]);
    setBulkFlags([...bulkFlags, false]);
  };

  const removeMember = (index: number) => {
    if (localMembers.length <= 1) return;
    setLocalMembers(localMembers.filter((_, i) => i !== index));
    setBulkFlags(bulkFlags.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const renames = localMembers.map((m, i) => ({
      oldName: originalNames[i] ?? m.name,
      newName: m.name,
      bulk: bulkFlags[i] ?? false,
    }));
    onSave(localMembers, renames);
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
      <div className="p-5 space-y-6 overflow-y-auto max-h-[60vh] scrollbar-none">
        
        {/* セキュリティ設定 */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-400 flex items-center gap-2">
            <Lock className="w-4 h-4" /> セキュリティ設定
          </p>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white">合言葉での保護</span>
                <span className="text-[10px] text-slate-500">
                  {hasPassword ? "現在、合言葉で保護されています" : "合言葉なし（秘密のURLのみ）"}
                </span>
              </div>
              <button 
                onClick={() => setShowPasswordInput(!showPasswordInput)}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors ${showPasswordInput ? "bg-slate-800 text-slate-400" : "bg-violet-600/20 text-violet-400 hover:bg-violet-600/30"}`}
              >
                {hasPassword ? "変更・解除" : "設定する"}
              </button>
            </div>

            {showPasswordInput && (
              <div className="mt-4 space-y-3 pt-3 border-t border-slate-800 animate-in fade-in slide-in-from-top-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-500 font-bold px-1">新しい合言葉</label>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={hasPassword ? "変更しない場合は空欄" : "例: 家族の記念日など"}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    disabled={isUpdatingPassword || (!newPassword && !hasPassword)}
                    onClick={async () => {
                      setIsUpdatingPassword(true);
                      try {
                        const res = await updateCalendarPassword(calendarId, newPassword || null);
                        if (res.success) {
                          toast.success(newPassword ? "合言葉を設定しました" : "合言葉を解除しました");
                          onPasswordUpdate(newPassword || null);
                          setNewPassword("");
                          setShowPasswordInput(false);
                        } else {
                          toast.error("更新に失敗しました");
                        }
                      } finally {
                        setIsUpdatingPassword(false);
                      }
                    }}
                    className="flex-1 bg-violet-600 hover:bg-violet-500 h-9 text-xs font-bold"
                  >
                    {isUpdatingPassword ? <Loader2 className="w-3 h-3 animate-spin" /> : "更新"}
                  </Button>
                  {hasPassword && (
                    <Button 
                      variant="ghost"
                      disabled={isUpdatingPassword}
                      onClick={async () => {
                        if (!confirm("保護を解除しますか？")) return;
                        setIsUpdatingPassword(true);
                        try {
                          const res = await updateCalendarPassword(calendarId, null);
                          if (res.success) {
                            toast.success("保護を解除しました");
                            onPasswordUpdate(null);
                            setShowPasswordInput(false);
                          }
                        } finally {
                          setIsUpdatingPassword(false);
                        }
                      }}
                      className="h-9 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-950/30"
                    >
                      解除
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-400 flex items-center gap-2">
            <Palette className="w-4 h-4" /> メンバー設定
          </p>
          <div className="space-y-3">
            {localMembers.map((m, idx) => {
              const nameChanged = m.name !== (originalNames[idx] ?? m.name);
              return (
                <div key={idx} className="bg-slate-800/50 p-3 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-3">
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
                  {/* 名前が変わった場合のみ一括変更オプションを表示 */}
                  {nameChanged && (
                    <label className="flex items-center gap-2 cursor-pointer bg-violet-900/20 rounded-lg px-3 py-2 border border-violet-800/30">
                      <input
                        type="checkbox"
                        checked={bulkFlags[idx] ?? false}
                        onChange={e => {
                          const next = [...bulkFlags];
                          next[idx] = e.target.checked;
                          setBulkFlags(next);
                        }}
                        className="w-4 h-4 accent-violet-500"
                      />
                      <span className="text-xs text-violet-300">
                        「{originalNames[idx]}」の既存予定をすべて「{m.name}」に変更する
                      </span>
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={addMember}
            className="w-full py-3 rounded-xl border border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 transition text-xs font-bold flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" />
            メンバーを追加
          </button>
        </div>
      </div>
      <div className="p-4 border-t border-slate-800 bg-slate-900/50">
        <button onClick={handleSave} disabled={saving}
          className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition shadow-xl shadow-violet-900/20 text-base">
          {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Check className="w-5 h-5 stroke-[3]" />設定を保存</>}
        </button>
      </div>
    </>
  );
}

// ─── 通知設定シート ────────────────────────────────────────────────────────────
function NotifySettingsSheet({
  members, pushState, pushProcessing, prefs,
  onSubscribe, onUnsubscribe, onSave, onClose,
}: {
  members: CalendarMember[];
  pushState: string;
  pushProcessing: boolean;
  prefs: { memberName: string | null; notifyOthers: boolean };
  onSubscribe: (prefs: { memberName: string | null; notifyOthers: boolean }) => void;
  onUnsubscribe: () => void;
  onSave: (prefs: { memberName: string | null; notifyOthers: boolean }) => void;
  onClose: () => void;
}) {
  const [memberName, setMemberName] = useState(prefs.memberName);
  const [notifyOthers, setNotifyOthers] = useState(prefs.notifyOthers);
  const isSubscribed = pushState === "subscribed";
  const isDenied = pushState === "denied";

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-700 rounded-t-3xl p-6 space-y-5 animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-violet-400" />
            <h3 className="font-black text-white text-base">通知設定</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isDenied ? (
          <div className="bg-rose-950/50 border border-rose-800 rounded-2xl p-4 text-sm text-rose-300">
            ブラウザの通知が拒否されています。<br />
            スマホの設定 → ブラウザ → 通知 → このサイトを「許可」にしてください。
          </div>
        ) : (
          <>
            {/* 通知のオン/オフ */}
            <div className="flex items-center justify-between bg-slate-800 rounded-2xl px-4 py-3">
              <div>
                <p className="text-sm font-bold text-white">予定追加の通知</p>
                <p className="text-xs text-slate-400 mt-0.5">新しい予定が追加されたときに通知</p>
              </div>
              <button
                onClick={() => isSubscribed ? onUnsubscribe() : onSubscribe({ memberName, notifyOthers })}
                disabled={pushProcessing || pushState === "loading"}
                className={`relative w-12 h-6 rounded-full transition-colors ${isSubscribed ? "bg-violet-600" : "bg-slate-600"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isSubscribed ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
            </div>

            {/* 自分の名前設定 */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">このデバイスを使う人</p>
              <div className="grid grid-cols-4 gap-2">
                {members.slice(0, 6).map((m) => (
                  <button
                    key={m.name}
                    onClick={() => setMemberName(m.name)}
                    className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                      memberName === m.name
                        ? "border-violet-500 bg-violet-600 text-white"
                        : "border-slate-700 bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
                <button
                  onClick={() => setMemberName(null)}
                  className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                    memberName === null
                      ? "border-violet-500 bg-violet-600 text-white"
                      : "border-slate-700 bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  未設定
                </button>
              </div>
            </div>

            {/* 他の人の予定を通知するか */}
            <div className="flex items-center justify-between bg-slate-800 rounded-2xl px-4 py-3">
              <div>
                <p className="text-sm font-bold text-white">他の人の予定も通知する</p>
                <p className="text-xs text-slate-400 mt-0.5">オフにすると自分の予定だけ通知</p>
              </div>
              <button
                onClick={() => setNotifyOthers(v => !v)}
                className={`relative w-12 h-6 rounded-full transition-colors ${notifyOthers ? "bg-violet-600" : "bg-slate-600"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${notifyOthers ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
            </div>

            <button
              onClick={() => onSave({ memberName, notifyOthers })}
              className="w-full bg-violet-600 hover:bg-violet-500 text-white font-black py-3 rounded-2xl text-sm"
            >
              設定を保存
            </button>
          </>
        )}
      </div>
    </>
  );
}
