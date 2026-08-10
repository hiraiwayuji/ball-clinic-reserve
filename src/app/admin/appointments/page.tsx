"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  format, addDays, startOfWeek, subWeeks, addWeeks, parseISO, isSameDay,
  startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, addMonths, subMonths,
} from "date-fns";
import { ja } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft, ChevronRight, Calendar, Settings, Loader2, Plus, User, CalendarDays, Search, LayoutList, Coffee, X,
} from "lucide-react";
import Link from "next/link";
import { EditAppointmentDialog } from "@/components/admin/EditAppointmentDialog";
import { CancelledAppointmentDialog, cancelKindLabel } from "@/components/admin/CancelledAppointmentDialog";
import { getEndingSeriesAlerts, getMonthCrossingFirstVisits, type EndingSeriesAlert } from "@/app/actions/adminReserve";
import { AddAppointmentDialog } from "@/components/admin/AddAppointmentDialog";
import { AddBreakDialog } from "@/components/admin/AddBreakDialog";
import { PatientSearchPanel } from "@/components/admin/PatientSearchPanel";
import { getAdminTimeSlots, isWithinBusinessHours } from "@/lib/time-slots";
import { useSpecialDays, findSpecialDay } from "@/lib/use-special-days";
import { getBlockedSlots, deleteBlockedSlot, type BlockedSlot } from "@/app/actions/blocked-slots";
import { toast } from "sonner";
import { useClinicSlotDuration } from "@/lib/use-clinic-slot-duration";
import { useClinicSchedule } from "@/lib/use-clinic-schedule";
import { getMyClinicId } from "@/app/actions/auth";
import { getClinicSettings } from "@/app/actions/settings";
import { realtimeGuard } from "@/lib/realtime-guard";
import TodayTimelineWidget from "@/components/admin/TodayTimelineWidget";
import { PendingReservationsButton } from "@/components/admin/PendingReservationsButton";

export default function AdminWeeklyGridPage() {
  const slotMinutes = useClinicSlotDuration();
  const schedule = useClinicSchedule();
  const TIME_SLOTS = useMemo(() => getAdminTimeSlots(slotMinutes, schedule), [slotMinutes, schedule]);
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  // 臨時営業日（お盆など）。白/灰セル判定と休診日表示に使う
  const specialDays = useSpecialDays();
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [loading, setLoading] = useState(true);
  // 休憩モード: ON のときカレンダーの枠をタップすると「予約」ではなく「休憩」を追加する
  const [breakMode, setBreakMode] = useState(false);
  const [isBreakDialogOpen, setIsBreakDialogOpen] = useState(false);
  const [breakDialogDate, setBreakDialogDate] = useState<Date | undefined>();
  const [breakDialogStart, setBreakDialogStart] = useState<string>("");
  const [breakDialogEnd, setBreakDialogEnd] = useState<string>("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  // キャンセル済み（薄い表示）をタップしたときの復活/完全削除ダイアログ
  const [cancelledApt, setCancelledApt] = useState<any>(null);
  // 「隠す」にしたキャンセルを一時的に表示するトグル
  const [showHiddenGhosts, setShowHiddenGhosts] = useState(false);
  // 毎週予約（連続予約）の最終回が近い患者のお知らせ
  const [endingSeries, setEndingSeries] = useState<EndingSeriesAlert[]>([]);
  // 月またぎ（先月から継続の患者様の今月最初の来院）バッジ対象の予約ID
  const [monthCrossIds, setMonthCrossIds] = useState<Set<string>>(new Set());
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedAddDate, setSelectedAddDate] = useState<Date | undefined>();
  const [selectedAddTime, setSelectedAddTime] = useState("");
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);
  const [clinicId, setClinicId] = useState<string | null>(null);
  // PC 表示モード。timetable はスタッフ別の縦軸×時間軸（ダッシュボードと同じ UI）
  const [viewMode, setViewMode] = useState<"week" | "day" | "month" | "timetable">("week");
  // 院ごとのデフォルト表示モードの読み込み状態（最初の clinic_settings 取得が終わるまで切り替えを抑制）
  const [viewModeReady, setViewModeReady] = useState(false);
  // 複数roomを持つ院（マッスル等）でフィルタするための state
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);
  const [roomFilter, setRoomFilter] = useState<string>(""); // "" = 全て表示
  // 部門（サロン/カフェ）フィルタ。clinic_settings.departments が空の院はタブを出さない。
  const [departments, setDepartments] = useState<string[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<string>(""); // "" = 全部門

  // 月ビュー用: 月の全日付（前月末・翌月頭の空白セルも含めて週単位で並べる）
  const monthGrid = useMemo(() => {
    const base = currentDate ?? new Date();
    const monthStart = startOfMonth(base);
    const monthEnd = endOfMonth(base);
    // 週はじまりを月曜に合わせる（既存の startOfWeek と整合）
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = startOfWeek(addDays(monthEnd, 6), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [currentDate]);

  const weekStart = useMemo(() => {
    if (!currentDate) return startOfWeek(new Date(), { weekStartsOn: 1 });
    return startOfWeek(currentDate, { weekStartsOn: 1 });
  }, [currentDate]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  }, [weekStart]);

  useEffect(() => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDay(today);
    getMyClinicId().then(setClinicId);

    (async () => {
      try {
        const settings = await getClinicSettings();
        // 部門（サロン/カフェ）。空の院ではタブを出さない。
        setDepartments(settings?.departments ?? []);

        const isValid = (v: string | null | undefined): v is "week" | "day" | "month" | "timetable" =>
          v === "week" || v === "day" || v === "month" || v === "timetable";

        // 院の初期表示設定があれば、それを最優先にする。
        // からだ院のように「予約を開いたら必ずスタッフ別から」という運用があるため、
        // 個人の localStorage より院の設定を優先する（設定が無い院は今まで通り個人の記憶）。
        const clinicDefault = settings?.default_appointments_view;
        if (isValid(clinicDefault)) {
          setViewMode(clinicDefault);
          return;
        }

        const personal = typeof window !== "undefined"
          ? localStorage.getItem("admin_appointments_view")
          : null;
        if (isValid(personal)) setViewMode(personal);
      } catch (e) {
        console.warn("[appointments] failed to load default view mode:", e);
      } finally {
        setViewModeReady(true);
      }
    })();
  }, []);

  // ユーザーが切り替えたら localStorage に保存（院の初期表示設定が無い院では次回も同じビューで開く）
  const handleViewModeChange = (mode: "week" | "day" | "month" | "timetable") => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      try { localStorage.setItem("admin_appointments_view", mode); } catch {}
    }
  };

  const handleWeekChange = (newDate: Date) => {
    setCurrentDate(newDate);
    const newWeekStart = startOfWeek(newDate, { weekStartsOn: 1 });
    const today = new Date();
    const days = Array.from({ length: 7 }).map((_, i) => addDays(newWeekStart, i));
    const todayInWeek = days.some(d => isSameDay(d, today));
    setSelectedDay(todayInWeek ? today : newWeekStart);
  };

  useEffect(() => {
    async function fetchData() {
      if (clinicId === null) return; // clinic_id が取得できるまで待つ
      setLoading(true);
      const weekEnd = addDays(weekStart, 7);
      try {
        const supabase = createClient();
        // キャンセル済みも取得する（薄く「○○様 キャンセル」と表示して、
        // 入れ忘れとキャンセルを区別できるようにするため）。件数カウントからは除外する。
        const { data: aptData } = await supabase
          .from("appointments")
          .select(`id, start_time, end_time, memo, is_first_visit, status, cancel_kind, no_show, cancel_hidden, customer_id, series_id, clinic_id, course_id, course_name, staff_id, staff_name, room_id, room_name, additional_courses, additional_staff, department, party_size, customers(name, phone, medical_record_number, birth_date)`)
          .eq("clinic_id", clinicId)
          .gte("start_time", weekStart.toISOString())
          .lt("start_time", weekEnd.toISOString());
        if (aptData) setAppointments(aptData);

        // 月またぎバッジ（先月から継続・今月最初の来院）の対象を取得
        try {
          const ids = await getMonthCrossingFirstVisits(weekStart.toISOString(), weekEnd.toISOString());
          setMonthCrossIds(new Set(ids));
        } catch (e) {
          console.warn("[appointments] failed to load month-crossing flags:", e);
          setMonthCrossIds(new Set());
        }

        const { data: holidayData, error: holidayErr } = await supabase
          .from("clinic_holidays")
          .select("*")
          .eq("clinic_id", clinicId);
        if (holidayData && !holidayErr) setHolidays(holidayData);

        // 臨時の休憩枠（その週の分）。サーバーアクション側で自院の clinic_id に絞られる。
        try {
          const breaks = await getBlockedSlots(
            format(weekStart, "yyyy-MM-dd"),
            format(addDays(weekStart, 6), "yyyy-MM-dd"),
          );
          setBlockedSlots(breaks);
        } catch (e) {
          console.warn("[appointments] failed to load blocked slots:", e);
        }

        // rooms 取得（複数roomを持つ院ではフィルタタブを表示）
        const { data: roomData } = await supabase
          .from("reservation_rooms")
          .select("id, name")
          .eq("clinic_id", clinicId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true });
        if (roomData) setRooms(roomData);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [weekStart, refreshKey, clinicId]);

  useEffect(() => {
    const supabase = createClient();
    const guardedRefresh = realtimeGuard(() => setRefreshKey(k => k + 1));
    const channel = supabase
      .channel("admin-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, guardedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "clinic_holidays" }, guardedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "clinic_blocked_slots" }, guardedRefresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // 予約日が患者の誕生日なら true（受付での声かけ用 🎂 バッジ）
  const isBirthdayOnDate = (birthDate: string | null | undefined, date: Date): boolean => {
    if (!birthDate) return false;
    const b = new Date(birthDate);
    if (isNaN(b.getTime())) return false;
    return b.getMonth() === date.getMonth() && b.getDate() === date.getDate();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-amber-100 text-amber-800 border-amber-200";
      case "waiting": return "bg-orange-100 text-orange-800 border-orange-200";
      case "confirmed": return "bg-blue-100 text-blue-800 border-blue-200";
      case "cancelled": return "bg-slate-50/80 text-slate-400 border-slate-200 border-dashed";
      default: return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "pending": return "確認待ち";
      case "waiting": return "C待ち";
      case "confirmed": return "確定";
      case "cancelled": return "キャンセル";
      default: return status;
    }
  };

  // 予約カード/ブロックのタップ時: キャンセル済みは復活ダイアログ、通常は編集ダイアログ
  const openAppointment = (apt: any) => {
    const normalized = { ...apt, customers: Array.isArray(apt.customers) ? apt.customers[0] : apt.customers };
    if (apt.status === "cancelled") {
      setCancelledApt(normalized);
    } else {
      setSelectedAppointment(normalized);
      setIsEditDialogOpen(true);
    }
  };

  // 臨時営業日（お盆など）は、定休曜日でもその時間帯を「営業中（白セル）」として扱う。
  // 患者側は既に対応済みなので、ここを見ないと管理画面だけ灰色のままでズレる。
  const toMinHHMM = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };

  const isBusinessHour = (date: Date, timeSlot: string) => {
    if (holidays.some(h => isSameDay(parseISO(h.date), date))) return false;
    const special = findSpecialDay(specialDays, format(date, "yyyy-MM-dd"));
    if (special?.closed) return false;
    if (special && (special.openTime || special.closeTime)) {
      const t = toMinHHMM(timeSlot);
      if (special.openTime && t < toMinHHMM(special.openTime)) return false;
      if (special.closeTime && t >= toMinHHMM(special.closeTime)) return false;
      return true;
    }
    return isWithinBusinessHours(date, timeSlot, schedule);
  };

  const isDayOff = (date: Date) => {
    const day = date.getDay();
    if (holidays.some(h => isSameDay(parseISO(h.date), date))) return true;
    const special = findSpecialDay(specialDays, format(date, "yyyy-MM-dd"));
    if (special?.closed) return true;
    if (special && (special.openTime || special.closeTime)) return false;
    return schedule.closedDays.includes(day);
  };

  // ── 休憩枠ヘルパー ──
  const hmToMin = (hm: string) => {
    const [h, m] = hm.slice(0, 5).split(":").map(Number);
    return h * 60 + m;
  };
  const minToHm = (n: number) =>
    `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

  // その日付・その時刻スロットを覆っている休憩枠を返す（なければ null）
  const getCellBreak = (date: Date, slot: string): BlockedSlot | null => {
    const dateStr = format(date, "yyyy-MM-dd");
    const slotMin = hmToMin(slot);
    return (
      blockedSlots.find(
        (b) => b.date === dateStr && slotMin >= hmToMin(b.start_time) && slotMin < hmToMin(b.end_time),
      ) ?? null
    );
  };
  // そのスロットが休憩の「開始セル」か（ブロック描画の起点）
  const getBreakStartingAt = (date: Date, slot: string): BlockedSlot | null => {
    const dateStr = format(date, "yyyy-MM-dd");
    return blockedSlots.find((b) => b.date === dateStr && b.start_time === slot) ?? null;
  };

  const handleDeleteBreak = async (b: BlockedSlot) => {
    if (!window.confirm(`${b.start_time}〜${b.end_time} の「${b.reason}」を削除しますか？`)) return;
    const res = await deleteBlockedSlot(b.id);
    if (res.success) {
      toast.success("休憩を削除しました。");
      setRefreshKey((k) => k + 1);
    } else {
      toast.error(res.error || "削除に失敗しました。");
    }
  };

  // 休憩モードでセルをタップ → 休憩ダイアログをプリフィルで開く
  const openBreakDialogForCell = (date: Date, slot: string) => {
    setBreakDialogDate(date);
    setBreakDialogStart(slot);
    setBreakDialogEnd(minToHm(Math.min(hmToMin(slot) + (slotMinutes || 30), 23 * 60 + 59)));
    setIsBreakDialogOpen(true);
  };

  // 部門・room フィルタ適用後の appointments（キャンセル済み含む・隠したものも含む）
  const filteredAppointments = useMemo(() => {
    let list = appointments;
    if (departmentFilter) list = list.filter(a => a.department === departmentFilter);
    if (roomFilter) list = list.filter(a => a.room_id === roomFilter);
    return list;
  }, [appointments, roomFilter, departmentFilter]);

  // 「隠す」にしたキャンセルの件数（この週）。トグルボタンの表示に使う
  const hiddenGhostCount = useMemo(
    () => filteredAppointments.filter(a => a.status === "cancelled" && a.cancel_hidden).length,
    [filteredAppointments],
  );

  // カレンダー描画用（トグルOFFのときは隠したキャンセルを除外）
  const displayedAppointments = useMemo(
    () => showHiddenGhosts
      ? filteredAppointments
      : filteredAppointments.filter(a => !(a.status === "cancelled" && a.cancel_hidden)),
    [filteredAppointments, showHiddenGhosts],
  );

  // 件数カウント用（キャンセル済みを除く）。日付ピルの数字や月の合計はこちらを使う
  const activeAppointments = useMemo(
    () => displayedAppointments.filter(a => a.status !== "cancelled"),
    [displayedAppointments],
  );

  // 毎週予約（連続予約）の最終回が近い患者を取得（入れ忘れ防止バナー）
  useEffect(() => {
    if (clinicId === null) return;
    getEndingSeriesAlerts().then(setEndingSeries).catch(() => setEndingSeries([]));
  }, [clinicId, refreshKey]);

  const selectedDayAppointments = useMemo(() => {
    if (!selectedDay) return [];
    return displayedAppointments
      .filter(apt => isSameDay(new Date(apt.start_time), selectedDay))
      .sort((a, b) => {
        const diff = new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
        if (diff !== 0) return diff;
        // 同時刻ならキャンセル済み（薄い表示）を後ろに
        return (a.status === "cancelled" ? 1 : 0) - (b.status === "cancelled" ? 1 : 0);
      });
  }, [displayedAppointments, selectedDay]);

  const selectedDayBreaks = useMemo(() => {
    if (!selectedDay) return [];
    const dateStr = format(selectedDay, "yyyy-MM-dd");
    return blockedSlots
      .filter((b) => b.date === dateStr)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [blockedSlots, selectedDay]);

  if (!currentDate || !selectedDay) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div>
      {/* ====================================================
          HEADER (shared)
      ==================================================== */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">予約カレンダー</h1>
          <p className="text-slate-500 mt-0.5 text-sm hidden sm:block">
            週間グリッド表示（PC）/ 日別リスト表示（スマホ）
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSearchPanelOpen(true)}
            className="border-blue-200 text-blue-700 dark:text-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950 font-semibold"
          >
            <Search className="w-4 h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">患者検索・予測</span>
            <span className="sm:hidden">検索</span>
          </Button>
          <AddAppointmentDialog
            open={isAddDialogOpen}
            onOpenChange={setIsAddDialogOpen}
            defaultDate={selectedAddDate}
            defaultTime={selectedAddTime}
            onSuccess={() => setRefreshKey(k => k + 1)}
          />
          {/* 仮予約（確認待ち）ボタン。件数バッジ付き。クリックで一覧→各行から確定できる。 */}
          <PendingReservationsButton
            clinicId={clinicId}
            onChanged={() => setRefreshKey(k => k + 1)}
          />
          <div className="flex items-center gap-2 p-1.5 bg-slate-50 rounded-xl border border-slate-200">
            <Button
              variant={breakMode ? "default" : "outline"}
              size="sm"
              onClick={() => setBreakMode((v) => !v)}
              className={breakMode
                ? "bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center gap-2"
                : "border-amber-300 text-amber-700 hover:bg-amber-50 hover:border-amber-400 flex items-center gap-2"}
              title="ONのあいだ、カレンダーの枠をタップすると休憩を追加できます"
            >
              <Coffee className="w-4 h-4" />
              <span className="font-bold">{breakMode ? "休憩モード ON" : "休憩"}</span>
            </Button>
            <Link href="/admin/waitlist">
              <Button
                variant="default"
                size="sm"
                className="bg-orange-600 hover:bg-orange-700 text-white shadow-sm flex items-center gap-2"
              >
                <CalendarDays className="w-4 h-4" />
                <span className="font-bold">キャンセル待ち</span>
              </Button>
            </Link>
            <Link href="/admin/holidays">
              <Button variant="outline" size="sm" className="border-slate-300 text-slate-600 hover:bg-white hover:text-blue-600 hover:border-blue-300 transition-all">
                <Settings className="w-4 h-4 mr-1.5" />
                <span className="font-bold">休診日設定</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* 毎週予約（連続予約）の最終回が近い方のお知らせ（入れ忘れ防止） */}
      {endingSeries.length > 0 && (
        <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30 px-3 py-2.5 text-sm text-indigo-800 dark:text-indigo-200">
          <p className="font-bold flex items-center gap-1.5 mb-1">
            <CalendarDays className="w-4 h-4 shrink-0" />
            毎週予約がもうすぐ終わる方（続ける場合は次の予約を忘れずに）
          </p>
          <ul className="space-y-0.5 pl-5 list-disc">
            {endingSeries.map((s) => (
              <li key={s.seriesId}>
                <span className="font-semibold">{s.customerName}</span>
                <span className="text-slate-400">様</span>
                <span className="ml-1 text-xs">
                  （毎週{s.weekday}曜 {s.timeLabel}）最終回 {format(parseISO(s.lastStartTime), "M月d日（E）", { locale: ja })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 「隠す」にしたキャンセルの再表示トグル（この週に非表示があるときだけ出す） */}
      {hiddenGhostCount > 0 && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => setShowHiddenGhosts(v => !v)}
            className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
          >
            {showHiddenGhosts
              ? "非表示のキャンセルを隠す"
              : `非表示のキャンセルを表示（${hiddenGhostCount}件）`}
          </button>
        </div>
      )}

      {/* 休憩モードの案内バナー */}
      {breakMode && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Coffee className="w-4 h-4 shrink-0" />
          <span className="font-semibold">休憩モード：</span>
          <span>カレンダーの空き枠をタップすると、その時間を休憩（予約不可）にできます。終わったら右上のボタンでOFFに。</span>
        </div>
      )}

      {/* ====================================================
          MOBILE VIEW (< md)
      ==================================================== */}
      <div className="md:hidden space-y-3">
        {/* Week navigation strip */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl"
            onClick={() => handleWeekChange(subWeeks(currentDate, 1))}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <button
            onClick={() => handleWeekChange(new Date())}
            className="text-sm font-semibold text-slate-700 dark:text-slate-200 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 transition-colors"
          >
            {format(weekDays[0], "M月d日", { locale: ja })}
            <span className="text-slate-500 dark:text-slate-500 mx-1.5">—</span>
            {format(weekDays[6], "M月d日", { locale: ja })}
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl"
            onClick={() => handleWeekChange(addWeeks(currentDate, 1))}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Day selector pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {weekDays.map((date, i) => {
            const dayStr = format(date, "E", { locale: ja });
            const dateNum = format(date, "d");
            const isSelected = isSameDay(date, selectedDay);
            const isToday = isSameDay(date, new Date());
            const isOff = isDayOff(date);
            const dayApptCount = activeAppointments.filter(a =>
              isSameDay(new Date(a.start_time), date)
            ).length;

            return (
              <button
                key={i}
                onClick={() => setSelectedDay(date)}
                className={`
                  flex flex-col items-center rounded-2xl px-3 py-2.5 min-w-[50px] flex-shrink-0
                  transition-all duration-150 select-none
                  ${isSelected
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-200/60"
                    : isToday
                    ? "bg-blue-50 text-blue-700 ring-1 ring-blue-300"
                    : "bg-white border border-slate-200 text-slate-600 active:bg-slate-50"
                  }
                  ${isOff && !isSelected ? "opacity-40" : ""}
                `}
              >
                <span className={`text-[10px] font-semibold ${
                  dayStr === "土" && !isSelected ? "text-blue-500" :
                  dayStr === "日" && !isSelected ? "text-rose-500" : ""
                }`}>
                  {dayStr}
                </span>
                <span className="text-lg font-black leading-tight">{dateNum}</span>
                {dayApptCount > 0 ? (
                  <span className={`mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                    isSelected ? "bg-white/25 text-white" : "bg-blue-100 text-blue-600"
                  }`}>
                    {dayApptCount}
                  </span>
                ) : (
                  <span className="mt-0.5 h-[14px]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Selected day header */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <h2 className="text-base font-bold text-slate-800">
              {format(selectedDay, "M月d日（E）", { locale: ja })}
            </h2>
            {isDayOff(selectedDay) && (
              <span className="text-xs text-rose-500 font-semibold">休診日</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isDayOff(selectedDay) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setBreakDialogDate(selectedDay);
                  setBreakDialogStart("12:00");
                  setBreakDialogEnd("13:00");
                  setIsBreakDialogOpen(true);
                }}
                className="border-amber-300 text-amber-700 hover:bg-amber-50 rounded-xl h-9"
              >
                <Coffee className="w-4 h-4 mr-1" />
                休憩
              </Button>
            )}
            {!isDayOff(selectedDay) && (
              <Button
                size="sm"
                onClick={() => {
                  setSelectedAddDate(selectedDay);
                  setSelectedAddTime("12:00");
                  setIsAddDialogOpen(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-9 shadow-md shadow-blue-200/60"
              >
                <Plus className="w-4 h-4 mr-1" />
                予約追加
              </Button>
            )}
          </div>
        </div>

        {/* この日の休憩一覧（モバイル） */}
        {selectedDayBreaks.length > 0 && (
          <div className="space-y-1.5">
            {selectedDayBreaks.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
              >
                <div className="flex items-center gap-2 text-amber-800 text-sm font-semibold">
                  <Coffee className="w-4 h-4" />
                  <span className="tabular-nums">{b.start_time}〜{b.end_time}</span>
                  <span className="font-normal text-amber-700">{b.reason}</span>
                </div>
                <button
                  onClick={() => handleDeleteBreak(b)}
                  className="rounded-lg p-1 text-amber-600 hover:bg-amber-200"
                  title="削除"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Appointment list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : selectedDayAppointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <CalendarDays className="w-14 h-14 mb-3 opacity-30" />
            <p className="text-sm font-semibold text-slate-500">予約はありません</p>
            {!isDayOff(selectedDay) && (
              <button
                onClick={() => {
                  setSelectedAddDate(selectedDay);
                  setSelectedAddTime("12:00");
                  setIsAddDialogOpen(true);
                }}
                className="mt-4 text-blue-500 text-sm underline underline-offset-2 font-medium"
              >
                予約を追加する
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2 pb-4">
            {selectedDayAppointments.map((apt) => {
              const cust = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
              const name = cust?.name || "名前なし";
              const phone = cust?.phone || "";
              const mrn = cust?.medical_record_number || "";
              const startTime = new Date(apt.start_time);
              const endTime = apt.end_time
                ? new Date(apt.end_time)
                : new Date(startTime.getTime() + 30 * 60000);
              const timeStr = format(startTime, "HH:mm");
              const endTimeStr = format(endTime, "HH:mm");
              const isCancelled = apt.status === "cancelled";
              const accentColor =
                isCancelled ? "bg-slate-300" :
                apt.status === "confirmed" ? "bg-blue-500" :
                apt.status === "pending" ? "bg-amber-400" : "bg-orange-400";
              const cardBg =
                isCancelled ? "bg-slate-50/70 border-slate-200 border-dashed" :
                apt.status === "confirmed" ? "bg-white border-slate-200" :
                apt.status === "pending" ? "bg-amber-50 border-amber-200" : "bg-orange-50 border-orange-200";

              return (
                <button
                  key={apt.id}
                  className={`w-full text-left ${isCancelled ? "opacity-70" : ""}`}
                  onClick={() => openAppointment(apt)}
                >
                  <Card className={`border ${cardBg} transition-all hover:shadow-md active:scale-[0.99]`}>
                    <div className="flex items-stretch gap-0 overflow-hidden rounded-xl">
                      {/* Accent bar */}
                      <div className={`w-1 ${accentColor} shrink-0`} />
                      <div className="flex items-start gap-3 px-3 py-3 flex-1 min-w-0">
                        {/* Time */}
                        <div className="flex flex-col items-center min-w-[52px] pt-0.5">
                          <span className={`text-base font-black tabular-nums ${isCancelled ? "text-slate-400 line-through" : "text-slate-800"}`}>{timeStr}</span>
                          <span className="text-[10px] text-slate-500 tabular-nums">〜{endTimeStr}</span>
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`font-bold text-[15px] ${isCancelled ? "text-slate-400 line-through" : "text-slate-900"}`}>{name}</span>
                            {isCancelled && (
                              <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full border border-slate-200 leading-none">
                                {cancelKindLabel(apt.cancel_kind, apt.no_show)}{apt.cancel_hidden ? "・非表示中" : ""}
                              </span>
                            )}
                            {mrn && (
                              <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-full border border-slate-200 leading-none tabular-nums">
                                No.{mrn}
                              </span>
                            )}
                            {apt.is_first_visit && (
                              <span className="text-[9px] font-black bg-amber-500 text-white px-1.5 py-0.5 rounded-full leading-none">
                                初診
                              </span>
                            )}
                            {isBirthdayOnDate(cust?.birth_date, startTime) && (
                              <span className="text-[9px] font-black bg-pink-500 text-white px-1.5 py-0.5 rounded-full leading-none">
                                🎂 誕生日
                              </span>
                            )}
                            {!isCancelled && monthCrossIds.has(apt.id) && (
                              <span
                                className="text-[9px] font-black bg-violet-600 text-white px-1.5 py-0.5 rounded-full leading-none"
                                title="先月から継続の患者様・今月最初の来院です（保険証確認など月初の対応を）"
                              >
                                🔖 月初
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge
                              variant="outline"
                              className={`text-[10px] py-0 h-4 ${getStatusColor(apt.status)}`}
                            >
                              {getStatusText(apt.status)}
                            </Badge>
                            {phone && (
                              <span className="text-[11px] text-slate-500 flex items-center gap-0.5">
                                <User className="w-2.5 h-2.5" />
                                {phone}
                              </span>
                            )}
                          </div>
                          {(apt.department === "カフェ" || apt.course_name) && (
                            <p className="text-[11px] mt-1 truncate font-bold">
                              {apt.department === "カフェ" && <span className="text-orange-600">☕ </span>}
                              <span className={apt.department === "カフェ" ? "text-orange-700" : "text-slate-600"}>{apt.course_name}</span>
                              {apt.party_size != null && <span className="text-orange-700"> ・{apt.party_size}名</span>}
                            </p>
                          )}
                          {apt.memo && apt.memo.trim() && (
                            <p className="text-[11px] text-slate-500 mt-1 truncate">{apt.memo}</p>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-500 shrink-0 mt-1" />
                      </div>
                    </div>
                  </Card>
                </button>
              );
            })}
          </div>
        )}

        {/* iCal sync (mobile compact) */}
        <Card className="bg-blue-50 border-blue-200">
          <div className="p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-blue-900 text-xs">カレンダー同期URL</p>
              <code className="text-[10px] text-blue-700 truncate block">
                https://ball-clinic.vercel.app/api/calendar/sync
              </code>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 bg-white border-blue-200 text-blue-700 text-xs h-8"
              onClick={() => window.open("/api/calendar/sync", "_blank")}
            >
              DL
            </Button>
          </div>
        </Card>
      </div>

      {/* ====================================================
          DESKTOP VIEW (≥ md)
      ==================================================== */}
      <div
        className="hidden md:flex flex-col gap-4"
        style={{ height: "calc(100vh - 12rem)", overflow: "hidden" }}
      >
        {/* Navigation bar */}
        <Card className="shrink-0 rounded-b-none border-b-0">
          <div className="flex items-center justify-between p-3 px-4">
            {/* timetable モードのときは日付ナビは TodayTimelineWidget 側に持たせるので非表示 */}
            <div className={`flex items-center gap-2 ${viewMode === "timetable" ? "invisible" : ""}`}>
              <Button
                variant="outline"
                size="icon"
                onClick={() => viewMode === "week"
                  ? handleWeekChange(subWeeks(currentDate, 1))
                  : setSelectedDay(d => d ? addDays(d, -1) : d)
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => {
                handleWeekChange(new Date());
                setSelectedDay(new Date());
              }}>
                今日
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => viewMode === "week"
                  ? handleWeekChange(addWeeks(currentDate, 1))
                  : setSelectedDay(d => d ? addDays(d, 1) : d)
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className={`text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center ${viewMode === "timetable" ? "invisible" : ""}`}>
              <Calendar className="w-5 h-5 mr-2 text-slate-500 dark:text-slate-500 shrink-0" />
              {viewMode === "week" ? (
                <>
                  <span>{format(weekDays[0], "yyyy年 M月 d日", { locale: ja })}</span>
                  <span className="text-slate-500 dark:text-slate-500 mx-2">〜</span>
                  <span>{format(weekDays[6], "M月 d日", { locale: ja })}</span>
                </>
              ) : viewMode === "day" ? (
                <span>{selectedDay ? format(selectedDay, "yyyy年M月d日（E）", { locale: ja }) : ""}</span>
              ) : (
                <span>{currentDate ? format(currentDate, "yyyy年 M月", { locale: ja }) : ""}</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* ビュー切り替えタブ */}
              <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 gap-0.5">
                <button
                  onClick={() => handleViewModeChange("week")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    viewMode === "week"
                      ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" /> 週間
                </button>
                <button
                  onClick={() => handleViewModeChange("day")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    viewMode === "day"
                      ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <LayoutList className="w-3.5 h-3.5" /> 日別
                </button>
                <button
                  onClick={() => handleViewModeChange("month")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    viewMode === "month"
                      ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5" /> 月
                </button>
                <button
                  onClick={() => handleViewModeChange("timetable")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    viewMode === "timetable"
                      ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                  title="スタッフ別の縦軸×時間軸グリッド（ダッシュボードと同じ）"
                >
                  <User className="w-3.5 h-3.5" /> スタッフ別
                </button>
              </div>
              {/* 部門タブ（サロン/カフェ等。departments 設定院のみ表示） */}
              {departments.length > 0 && (
                <div className="flex bg-indigo-50 dark:bg-indigo-900/30 rounded-lg p-0.5 gap-0.5 border border-indigo-200 dark:border-indigo-800">
                  <button
                    onClick={() => setDepartmentFilter("")}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      departmentFilter === ""
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-800/40"
                    }`}
                  >
                    全部門
                  </button>
                  {departments.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDepartmentFilter(d)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        departmentFilter === d
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-800/40"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}
              {/* room フィルタ（複数room保有院のみ表示） */}
              {rooms.length > 1 && (
                <div className="flex bg-emerald-50 dark:bg-emerald-900/30 rounded-lg p-0.5 gap-0.5 border border-emerald-200 dark:border-emerald-800">
                  <button
                    onClick={() => setRoomFilter("")}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      roomFilter === ""
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-800/40"
                    }`}
                  >
                    全て
                  </button>
                  {rooms.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setRoomFilter(r.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        roomFilter === r.id
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-800/40"
                      }`}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-blue-100 border border-blue-200 rounded-sm mr-1" />
                  確定
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-orange-100 border border-orange-200 rounded-sm mr-1" />
                  C待ち
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* 院の初期表示設定を読み終わるまでは何も描かない。
            先に週間を描いてからスタッフ別に切り替わると、画面がちらついて見えるため。 */}
        {!viewModeReady && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        )}

        {/* タイムテーブルビュー（PC）: スタッフ別の縦軸×時間軸グリッド。
            ダッシュボードと同じ UI（TodayTimelineWidget）を流用。
            内部で日付ナビゲーション・データ取得・Realtime 更新を完結。 */}
        {viewModeReady && viewMode === "timetable" && (
          <div className="flex-1 overflow-auto">
            {/* 予約画面のヘッダーに既に「仮予約」ボタンがあるので、ここでは重複表示しない。
                休憩モードON のときは、この画面の空きセルをタップしても休憩を追加できるようにする
                （からだ鍼灸整骨院の既定表示がこのタイムテーブルのため、週表示だけ対応だと使えなかった）。 */}
            <TodayTimelineWidget
              showPendingButton={false}
              breakMode={breakMode}
              onBreakCell={openBreakDialogForCell}
            />
          </div>
        )}

        {/* 日別ビュー（PC）: 日付セレクターバー */}
        {viewModeReady && viewMode === "day" && (
          <div className="shrink-0 flex gap-1.5 overflow-x-auto pb-1 px-1">
            {weekDays.map((date, i) => {
              const dayStr = format(date, "E", { locale: ja });
              const isSelected = selectedDay ? isSameDay(date, selectedDay) : false;
              const isToday = isSameDay(date, new Date());
              const isOff = isDayOff(date);
              const dayApptCount = activeAppointments.filter(a => isSameDay(new Date(a.start_time), date)).length;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(date)}
                  className={`flex flex-col items-center rounded-xl px-4 py-2 min-w-[60px] flex-shrink-0 transition-all
                    ${isSelected ? "bg-blue-600 text-white shadow-md" : isToday ? "bg-blue-50 text-blue-700 ring-1 ring-blue-300" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}
                    ${isOff && !isSelected ? "opacity-40" : ""}
                  `}
                >
                  <span className={`text-[11px] font-semibold ${dayStr === "土" && !isSelected ? "text-blue-500" : dayStr === "日" && !isSelected ? "text-rose-500" : ""}`}>{dayStr}</span>
                  <span className="text-base font-black">{format(date, "d")}</span>
                  {dayApptCount > 0 ? (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isSelected ? "bg-white/25 text-white" : "bg-blue-100 text-blue-600"}`}>{dayApptCount}</span>
                  ) : <span className="h-[18px]" />}
                </button>
              );
            })}
          </div>
        )}

        {/* Monthly grid（月モード）— 件数のみ表示、クリックで日別へ */}
        {viewModeReady && viewMode === "month" && (
          <Card className="flex-1 overflow-auto rounded-t-none border-t bg-slate-50 p-3">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              </div>
            ) : (
              <div>
                {/* 月ヘッダ: 前月/翌月切替 + 月集計 */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <button
                    onClick={() => setCurrentDate(subMonths(currentDate ?? new Date(), 1))}
                    className="px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold"
                  >
                    ← 前月
                  </button>
                  <div className="text-base font-bold text-slate-800">
                    {format(currentDate ?? new Date(), "yyyy年 M月", { locale: ja })}
                    <span className="ml-3 text-sm font-semibold text-blue-600">
                      合計 {activeAppointments.filter(a => isSameMonth(new Date(a.start_time), currentDate ?? new Date())).length} 件
                    </span>
                  </div>
                  <button
                    onClick={() => setCurrentDate(addMonths(currentDate ?? new Date(), 1))}
                    className="px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold"
                  >
                    翌月 →
                  </button>
                </div>

                {/* 曜日ヘッダ */}
                <div className="grid grid-cols-7 gap-1 mb-1 text-center text-xs font-bold text-slate-500">
                  {["月", "火", "水", "木", "金", "土", "日"].map((d) => (
                    <div key={d} className={d === "土" ? "text-blue-500" : d === "日" ? "text-rose-500" : ""}>{d}</div>
                  ))}
                </div>

                {/* 日付グリッド */}
                <div className="grid grid-cols-7 gap-1">
                  {monthGrid.map((date) => {
                    const inMonth = isSameMonth(date, currentDate ?? new Date());
                    const isToday = isSameDay(date, new Date());
                    const isHoliday = holidays.some(h => isSameDay(parseISO(h.date), date));
                    const dayApps = activeAppointments.filter(a => isSameDay(new Date(a.start_time), date));
                    const cnt = dayApps.length;
                    const dow = date.getDay();
                    return (
                      <button
                        key={date.toISOString()}
                        onClick={() => { setSelectedDay(date); setCurrentDate(date); handleViewModeChange("day"); }}
                        className={`relative min-h-[78px] p-1.5 rounded-md border text-left transition-all
                          ${inMonth ? "bg-white border-slate-200 hover:bg-blue-50 hover:border-blue-300" : "bg-slate-50 border-slate-100 opacity-50"}
                          ${isToday ? "ring-2 ring-blue-400" : ""}
                        `}
                      >
                        <div className={`text-xs font-bold
                          ${dow === 6 && inMonth ? "text-blue-600" : ""}
                          ${(dow === 0 || isHoliday) && inMonth ? "text-rose-600" : ""}
                          ${!inMonth ? "text-slate-400" : ""}
                        `}>
                          {format(date, "d")}
                        </div>
                        {cnt > 0 && (
                          <div className="absolute bottom-1.5 right-1.5">
                            <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full bg-blue-600 text-white text-sm font-bold shadow-sm">
                              {cnt}
                            </span>
                          </div>
                        )}
                        {isHoliday && (
                          <div className="absolute top-1.5 right-1.5 text-[9px] font-bold text-rose-500">休</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Weekly grid（週間モード） */}
        {viewModeReady && viewMode === "week" && <Card className="flex-1 overflow-auto rounded-t-none border-t bg-slate-50">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : (
            <div className="min-w-[800px] h-full relative">
              {/* Day headers */}
              <div className="flex sticky top-0 z-20 bg-white border-b shadow-sm">
                <div className="w-20 shrink-0 border-r bg-slate-50" />
                {weekDays.map((date, i) => {
                  const isToday = isSameDay(date, new Date());
                  const isHoliday = holidays.some(h => isSameDay(parseISO(h.date), date));
                  const dayStr = format(date, "E", { locale: ja });

                  return (
                    <div
                      key={i}
                      className={`flex-1 min-w-[120px] text-center py-2 border-r ${isToday ? "bg-blue-50" : ""}`}
                    >
                      <div className={`text-sm font-bold
                        ${dayStr === "土" ? "text-blue-600" : ""}
                        ${dayStr === "日" || isHoliday ? "text-rose-600" : "text-slate-700"}
                      `}>
                        {format(date, "M/d (E)", { locale: ja })}
                      </div>
                      {isHoliday && (
                        <div className="text-[10px] text-rose-500 font-bold mt-0.5">休診日</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Time slot rows */}
              <div className="bg-white">
                {TIME_SLOTS.map((slot, rowIndex) => (
                  <div key={slot} className="flex border-b">
                    <div className="w-20 shrink-0 border-r bg-slate-50 flex items-center justify-center text-xs font-medium text-slate-500 py-4">
                      {slot}
                    </div>
                    {weekDays.map((date, colIndex) => {
                      const isBusiness = isBusinessHour(date, slot);
                      const jstTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
                        timeZone: "Asia/Tokyo",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      });
                      const slotAppts = displayedAppointments
                        .filter(apt => {
                          const aptDate = new Date(apt.start_time);
                          return isSameDay(aptDate, date) && jstTimeFormatter.format(aptDate) === slot;
                        })
                        // キャンセル済み（薄い表示）は右側に寄せる
                        .sort((a, b) => (a.status === "cancelled" ? 1 : 0) - (b.status === "cancelled" ? 1 : 0));
                      const cellBreak = getCellBreak(date, slot);
                      const breakStart = getBreakStartingAt(date, slot);

                      return (
                        <div
                          key={`${rowIndex}-${colIndex}`}
                          className={`flex-1 min-w-[120px] border-r relative p-1 transition-colors
                            ${cellBreak
                              ? "bg-amber-50 cursor-default"
                              : isBusiness
                              ? breakMode
                                ? "bg-white hover:bg-amber-50 cursor-pointer"
                                : "bg-white hover:bg-blue-50/50 cursor-pointer"
                              : "bg-slate-100/80 cursor-not-allowed"
                            }
                          `}
                          onClick={() => {
                            if (cellBreak) return; // 休憩セルは専用の削除ボタンで操作
                            if (!isBusiness) return;
                            if (breakMode) {
                              openBreakDialogForCell(date, slot);
                            } else {
                              setSelectedAddDate(date);
                              setSelectedAddTime(slot);
                              setIsAddDialogOpen(true);
                            }
                          }}
                          style={{ height: "50px" }}
                        >
                          {/* 休憩ブロック（開始セルに、時間ぶんの高さで表示） */}
                          {breakStart && (
                            <div
                              className="absolute inset-x-0.5 top-0.5 z-[5] rounded border border-amber-300 bg-amber-100/90 px-1.5 py-1 text-[11px] leading-tight text-amber-800 overflow-hidden"
                              style={{ height: `${Math.max(1, (hmToMin(breakStart.end_time) - hmToMin(breakStart.start_time)) / (slotMinutes || 30)) * 50 - 4}px` }}
                            >
                              <div className="flex items-start justify-between gap-1">
                                <span className="font-bold flex items-center gap-0.5">
                                  <Coffee className="w-3 h-3" />
                                  {breakStart.reason}
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteBreak(breakStart); }}
                                  className="shrink-0 rounded p-0.5 hover:bg-amber-200 text-amber-700"
                                  title="この休憩を削除"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="text-[10px] opacity-80 mt-0.5 tabular-nums">
                                {breakStart.start_time}〜{breakStart.end_time}
                              </div>
                            </div>
                          )}
                          {!isBusiness && !cellBreak && slotAppts.length === 0 && (
                            <div
                              className="absolute inset-0 opacity-50 pointer-events-none"
                              style={{
                                backgroundImage: `url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIj48L3JlY3Q+CjxnIGZpbGw9IiNlN2U1ZTQiPgo8cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMiIgaGVpZ2h0PSIyIj48L3JlY3Q+CjxyZWN0IHg9IjIiIHk9IjIiIHdpZHRoPSIyIiBoZWlnaHQ9IjIiPjwvcmVjdD4KPC9nPgo8L3N2Zz4=')`,
                              }}
                            />
                          )}
                          {slotAppts.map((apt, index) => {
                            const cust = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
                            const name = cust?.name || "名前なし";
                            const mrn = cust?.medical_record_number || "";
                            const isFirst = apt.is_first_visit;
                            const startTime = new Date(apt.start_time);
                            const endTime = apt.end_time
                              ? new Date(apt.end_time)
                              : new Date(startTime.getTime() + 30 * 60000);
                            const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60000;
                            // 1行の高さは院の予約枠（20分刻みの院で30分決め打ちにすると
                            // 60分の予約が40分ぶんの高さで描かれ、空いていると勘違いする）
                            const slotCount = Math.max(1, Math.ceil(durationMinutes / (slotMinutes || 30)));
                            const heightPx = slotCount * 50 - 4;
                            const widthPercent = 100 / (slotAppts.length || 1);
                            const leftOffset = index * widthPercent;

                            const isCancelled = apt.status === "cancelled";
                            return (
                              <div
                                key={apt.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAppointment(apt);
                                }}
                                title={isCancelled ? `${name}様 ${cancelKindLabel(apt.cancel_kind, apt.no_show)}（タップで復活できます）` : undefined}
                                className={`absolute top-0 p-1.5 rounded border text-xs leading-tight cursor-pointer overflow-hidden hover:opacity-80
                                  ${isCancelled ? "z-[8]" : "z-10 shadow-sm"}
                                  ${getStatusColor(apt.status)}
                                `}
                                style={{
                                  height: `${heightPx}px`,
                                  width: `calc(${widthPercent}% - 6px)`,
                                  left: `calc(${leftOffset}% + 2px)`,
                                  marginTop: "2px",
                                }}
                              >
                                <div className="font-bold flex items-center justify-between">
                                  <span className={`truncate ${isCancelled ? "line-through" : ""}`}>
                                    {!isCancelled && isBirthdayOnDate(cust?.birth_date, startTime) && "🎂"}
                                    {name}
                                  </span>
                                  <span className="flex items-center gap-0.5 shrink-0">
                                    {isFirst && !isCancelled && (
                                      <span className="bg-amber-500 text-white text-[9px] px-1 rounded">初</span>
                                    )}
                                    {!isCancelled && monthCrossIds.has(apt.id) && (
                                      <span
                                        className="bg-violet-600 text-white text-[9px] px-1 rounded"
                                        title="先月から継続の患者様・今月最初の来院です（保険証確認など月初の対応を）"
                                      >
                                        月初
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <div className="text-[10px] opacity-80 mt-0.5 flex items-center gap-1">
                                  <span>{isCancelled ? `${cancelKindLabel(apt.cancel_kind, apt.no_show)}${apt.cancel_hidden ? "・非表示中" : ""}` : getStatusText(apt.status)}</span>
                                  {mrn && !isCancelled && <span className="tabular-nums font-semibold">No.{mrn}</span>}
                                </div>
                                {!isCancelled && apt.staff_name && (
                                  <div className="text-[10px] opacity-70 truncate">担当: {apt.staff_name}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>}

        {/* 日別リストビュー（日別モード） */}
        {viewModeReady && viewMode === "day" && (
          <Card className="flex-1 overflow-auto rounded-t-none border-t bg-slate-50">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              </div>
            ) : !selectedDay ? null : (
              <div className="p-4">
                {/* 日付ヘッダー */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                      {format(selectedDay, "M月d日（E）", { locale: ja })}
                    </h2>
                    {isDayOff(selectedDay) && (
                      <span className="text-sm text-rose-500 font-semibold">休診日</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!isDayOff(selectedDay) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setBreakDialogDate(selectedDay);
                          setBreakDialogStart("12:00");
                          setBreakDialogEnd("13:00");
                          setIsBreakDialogOpen(true);
                        }}
                        className="border-amber-300 text-amber-700 hover:bg-amber-50"
                      >
                        <Coffee className="w-4 h-4 mr-1" />
                        休憩を追加
                      </Button>
                    )}
                    {!isDayOff(selectedDay) && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedAddDate(selectedDay);
                          setSelectedAddTime("12:00");
                          setIsAddDialogOpen(true);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        予約追加
                      </Button>
                    )}
                  </div>
                </div>

                {/* この日の休憩一覧（PC日別） */}
                {selectedDayBreaks.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {selectedDayBreaks.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5"
                      >
                        <div className="flex items-center gap-2 text-amber-800 font-semibold">
                          <Coffee className="w-4 h-4" />
                          <span className="tabular-nums">{b.start_time}〜{b.end_time}</span>
                          <span className="font-normal text-amber-700">{b.reason}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteBreak(b)}
                          className="rounded-lg p-1 text-amber-600 hover:bg-amber-200"
                          title="削除"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {selectedDayAppointments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                    <CalendarDays className="w-16 h-16 mb-3 opacity-20" />
                    <p className="text-base font-semibold text-slate-500">この日の予約はありません</p>
                    {!isDayOff(selectedDay) && (
                      <button
                        onClick={() => { setSelectedAddDate(selectedDay); setSelectedAddTime("12:00"); setIsAddDialogOpen(true); }}
                        className="mt-4 text-blue-500 text-sm underline underline-offset-2 font-medium"
                      >
                        予約を追加する
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedDayAppointments.map((apt) => {
                      const cust = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
                      const name = cust?.name || "名前なし";
                      const phone = cust?.phone || "";
                      const mrn = cust?.medical_record_number || "";
                      const startTime = new Date(apt.start_time);
                      const endTime = apt.end_time ? new Date(apt.end_time) : new Date(startTime.getTime() + 30 * 60000);
                      const isCancelled = apt.status === "cancelled";
                      const accentColor = isCancelled ? "bg-slate-300" : apt.status === "confirmed" ? "bg-blue-500" : apt.status === "pending" ? "bg-amber-400" : "bg-orange-400";
                      const cardBg = isCancelled ? "bg-slate-50/70 border-slate-200 border-dashed" : apt.status === "confirmed" ? "bg-white border-slate-200" : apt.status === "pending" ? "bg-amber-50 border-amber-200" : "bg-orange-50 border-orange-200";

                      return (
                        <button
                          key={apt.id}
                          className={`w-full text-left ${isCancelled ? "opacity-70" : ""}`}
                          onClick={() => openAppointment(apt)}
                        >
                          <Card className={`border ${cardBg} transition-all hover:shadow-md`}>
                            <div className="flex items-stretch gap-0 overflow-hidden rounded-xl">
                              <div className={`w-1.5 ${accentColor} shrink-0`} />
                              <div className="flex items-center gap-4 px-4 py-3 flex-1">
                                <div className="text-center min-w-[64px]">
                                  <p className={`text-xl font-black tabular-nums ${isCancelled ? "text-slate-400 line-through" : "text-slate-800"}`}>{format(startTime, "HH:mm")}</p>
                                  <p className="text-xs text-slate-500 tabular-nums">〜{format(endTime, "HH:mm")}</p>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`font-bold text-base ${isCancelled ? "text-slate-400 line-through" : "text-slate-900"}`}>{name}</span>
                                    {isCancelled && (
                                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                                        {cancelKindLabel(apt.cancel_kind, apt.no_show)}{apt.cancel_hidden ? "・非表示中" : ""}
                                      </span>
                                    )}
                                    {mrn && (
                                      <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 tabular-nums">No.{mrn}</span>
                                    )}
                                    {apt.is_first_visit && (
                                      <span className="text-[10px] font-black bg-amber-500 text-white px-2 py-0.5 rounded-full">初診</span>
                                    )}
                                    {isBirthdayOnDate(cust?.birth_date, startTime) && (
                                      <span className="text-[10px] font-black bg-pink-500 text-white px-2 py-0.5 rounded-full">🎂 誕生日</span>
                                    )}
                                    {!isCancelled && monthCrossIds.has(apt.id) && (
                                      <span
                                        className="text-[10px] font-black bg-violet-600 text-white px-2 py-0.5 rounded-full"
                                        title="先月から継続の患者様・今月最初の来院です（保険証確認など月初の対応を）"
                                      >
                                        🔖 月初
                                      </span>
                                    )}
                                    <Badge variant="outline" className={`text-xs py-0 h-5 ${getStatusColor(apt.status)}`}>
                                      {getStatusText(apt.status)}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                                    {(apt.department === "カフェ" || apt.course_name) && (
                                      <span className="font-bold flex items-center gap-1">
                                        {apt.department === "カフェ" && <span className="text-orange-600">☕</span>}
                                        <span className={apt.department === "カフェ" ? "text-orange-700" : "text-slate-600"}>{apt.course_name}</span>
                                        {apt.party_size != null && <span className="text-orange-700">・{apt.party_size}名</span>}
                                      </span>
                                    )}
                                    {phone && <span className="flex items-center gap-1"><User className="w-3 h-3" />{phone}</span>}
                                    {apt.memo && <span className="truncate">{apt.memo}</span>}
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                              </div>
                            </div>
                          </Card>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* iCal sync card (desktop) */}
        <Card className="shrink-0 bg-blue-50 border-blue-200">
          <div className="p-4 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-blue-900 text-sm">カレンダー同期URL（Googleカレンダー用）</h3>
              <p className="text-xs text-blue-700 mt-1">
                このURLをGoogleカレンダーやiPhoneの「照会カレンダー」に追加すると、予約と「家族カレンダー」の予定がすべて自動同期されます。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-white border border-blue-200 px-3 py-1.5 rounded select-all">
                https://ball-clinic.vercel.app/api/calendar/sync
              </code>
              <Button
                variant="outline"
                size="sm"
                className="bg-white border-blue-200 hover:bg-blue-100 text-blue-700"
                onClick={() => window.open("/api/calendar/sync", "_blank")}
              >
                .icsをダウンロード
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Edit dialog */}
      {selectedAppointment && (
        <EditAppointmentDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          appointment={selectedAppointment}
          onSuccess={() => {
            setRefreshKey(k => k + 1);
            setSelectedAppointment(null);
          }}
        />
      )}

      {/* キャンセル済み（薄い表示）タップ時の復活/完全削除ダイアログ */}
      <CancelledAppointmentDialog
        open={!!cancelledApt}
        onOpenChange={(o) => { if (!o) setCancelledApt(null); }}
        appointment={cancelledApt}
        onSuccess={() => {
          setRefreshKey(k => k + 1);
          setCancelledApt(null);
        }}
      />

      {/* 休憩追加ダイアログ */}
      <AddBreakDialog
        open={isBreakDialogOpen}
        onOpenChange={setIsBreakDialogOpen}
        defaultDate={breakDialogDate}
        defaultStart={breakDialogStart}
        defaultEnd={breakDialogEnd}
        onSuccess={() => setRefreshKey(k => k + 1)}
      />

      {/* Patient search panel */}
      <PatientSearchPanel
        open={isSearchPanelOpen}
        onOpenChange={setIsSearchPanelOpen}
        onRefresh={() => setRefreshKey(k => k + 1)}
      />

      {/* モバイルで FAB（AI秘書ボタン・リマインダー）に最終行が隠れないよう保険のスペーサー */}
      <div className="h-24 md:hidden" aria-hidden />
    </div>
  );
}
