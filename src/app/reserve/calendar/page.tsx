"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { format, isSameMonth, isSameDay, isToday, isPast, startOfDay, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek } from "date-fns";
import { ja } from "date-fns/locale";
import { ChevronLeft, ChevronRight, ArrowLeft, Clock, CalendarDays, X, CheckCircle2, AlertCircle, Sparkles, Phone, MessageCircle } from "lucide-react";
import { createWaitlistReservation, getDailyAvailability, getAutoCourseSelection } from "@/app/actions/reserve";
import { getClinicHolidays, type ClinicHoliday } from "@/app/actions/holidays";
import { getActiveCourses, getActiveStaff, getCourseRequiredStaffSchedule, getCoursesAvailability, type ReservationCourse } from "@/app/actions/courses";
import { getBlockedTimesForCurrentClinic } from "@/app/actions/staff-schedule";
import { isStaffAvailableOn, type StaffSchedule } from "@/lib/staff-availability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

import { getTimeSlots, getMaxSlots, isDateWithinAllowedRange, isTimeSlotWithinTwoHours, type SlotMinutes, type Schedule } from "@/lib/time-slots";
import { useClinicSlotDuration } from "@/lib/use-clinic-slot-duration";
import { useClinicSchedule } from "@/lib/use-clinic-schedule";
import { CLINIC_CONFIG } from "@/lib/clinic-config";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";

// 静的なTIME_SLOTS, MAX_SLOTSを削除

type AvailabilityLevel = "available" | "few" | "full" | "closed" | "past";

// 予約可能期間の人にやさしい表示。90 → "3ヶ月"、30 → "1ヶ月"、それ以外は "〇日"。
function horizonLabel(days: number): string {
  if (days % 30 === 0) return `${days / 30}ヶ月`;
  return `${days}日`;
}

// "2026-06-08" → "6/8（月）"
function formatShortDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const wd = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${Number(m[2])}/${Number(m[3])}（${wd}）`;
}

function getAvailabilityLevel(dateStr: string, bookedCount: number, date: Date, clinicHolidays: ClinicHoliday[], slotMinutes: SlotMinutes, schedule: Schedule, staffSchedule?: StaffSchedule | null): AvailabilityLevel {
  const isHoliday = clinicHolidays.some(h => h.date === dateStr);
  if (isHoliday) return "closed";

  const day = date.getDay();
  if (schedule.closedDays.includes(day)) return "closed";
  if (isPast(startOfDay(date)) && !isToday(date)) return "past";

  // 担当固定コース（さみ整体など）：そのスタッフの出勤日以外は休診扱いにして選べなくする
  if (staffSchedule && !isStaffAvailableOn(date, staffSchedule)) return "closed";

  // 予約可能期間（院ごと clinic_settings.booking_horizon_days）外は休診扱い
  if (!isDateWithinAllowedRange(date, false, schedule.bookingHorizonDays)) return "closed";

  // 実際に予約可能なスロット（2時間前制限にかかっていないもの）をカウントする
  const allSlots = getTimeSlots(date, { slotMinutes, schedule });
  const totalSlots = allSlots.length;

  if (totalSlots === 0) return "closed";

  const freeCount = totalSlots - bookedCount;
  const freeRate = freeCount / totalSlots;

  // 1. 全て埋まっている場合 (空き 0) -> × (full)
  if (freeCount <= 0) return "full";
  
  // 2. 空き率が 50% 未満の場合 -> △ (few)
  if (freeRate < 0.5) return "few";

  // 3. 空き率が 50% 以上の場合 -> ◯ (available)
  return "available";
}

const levelConfig = {
  available: {
    bg: "bg-emerald-500/10 hover:bg-emerald-500/20",
    border: "border-emerald-500/30",
    dot: "bg-emerald-400",
    label: "◯ 空き",
    symbol: "◯",
    labelClass: "text-emerald-400",
    text: "text-white",
  },
  few: {
    bg: "bg-amber-500/10 hover:bg-amber-500/20",
    border: "border-amber-500/30",
    dot: "bg-amber-400",
    label: "△ 残りわずか",
    symbol: "△",
    labelClass: "text-amber-400",
    text: "text-white",
  },
  // ぼーるくんメモ: 「× 予約済」は廃止し、超混雑＝赤△「要問合せ」に統一。
  // クリック時はキャンセル待ち登録 or お電話/LINE問合せの2択モーダルを表示。
  full: {
    bg: "bg-rose-500/10 hover:bg-rose-500/20",
    border: "border-rose-500/30",
    dot: "bg-rose-400",
    label: "△ 要問合せ",
    symbol: "△",
    labelClass: "text-rose-300",
    text: "text-white",
  },
  closed: {
    bg: "bg-white/5",
    border: "border-white/10",
    dot: "bg-slate-600",
    label: "休診",
    labelClass: "text-slate-500",
    text: "text-slate-500",
  },
  past: {
    bg: "bg-transparent",
    border: "border-transparent",
    dot: "bg-slate-700",
    label: "",
    labelClass: "",
    text: "text-slate-600",
  },
};

type WaitlistState = "idle" | "form" | "submitting" | "success" | "needsQuestionnaire";

export default function ReserveCalendarPage() {
  return (
    <Suspense fallback={<CalendarLoading />}>
      <ReserveCalendarContent />
    </Suspense>
  );
}

function CalendarLoading() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center" style={{ backgroundColor: '#0f172a' }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-300 text-sm font-bold">カレンダーを読み込み中...</p>
      </div>
    </div>
  );
}

function ReserveCalendarContent() {
  const slotMinutes = useClinicSlotDuration();
  const schedule = useClinicSchedule();
  const searchParams = useSearchParams();
  const router = useRouter();
  const courseIdParam = searchParams.get("courseId");

  // ── メニュー未選択ゲート ──
  // courseId 無しでは空き状況を出さない（メニュー未選択だと定員プール判定になり、
  // 埋まっている時間まで「◯空き」に見えてダブルブッキングの温床になるため）。
  // 患者情報（LINE家族・前回入力）があれば年齢からメニューを自動選択し、
  // なければメニュー選択ページへ誘導する。
  const [menuGate, setMenuGate] = useState<"checking" | "ok" | "required">(courseIdParam ? "ok" : "checking");
  const [autoSelectedNote, setAutoSelectedNote] = useState<string | null>(null);

  const [selectedCourse, setSelectedCourse] = useState<ReservationCourse | null>(null);
  // スタッフ(レーン)タブ：担当ごとに「そのスタッフのメニュー」を切り替えるための一覧
  type Lane = { staffId: string; staffName: string; courses: ReservationCourse[]; schedule: StaffSchedule | null };
  const [lanes, setLanes] = useState<Lane[]>([]);
  // 複数メニューを持つレーンを開いたときのメニュー選択用
  const [openLaneId, setOpenLaneId] = useState<string | null>(null);
  // 担当固定コース（さみ整体など）のスタッフ出勤日。設定時は出勤日以外を選べなくする。
  const [staffSchedule, setStaffSchedule] = useState<StaffSchedule | null>(null);
  const [staffScheduleName, setStaffScheduleName] = useState<string>("");
  // 選択コースの最短の空き日（"yyyy-MM-dd" / null=空き無し / undefined=未取得）
  const [courseNextDate, setCourseNextDate] = useState<string | null | undefined>(undefined);
  // 日付を押したら時間帯パネルへ自動スクロールするための ref
  const timePanelRef = useRef<HTMLDivElement | null>(null);
  const [currentMonth, setCurrentMonth] = useState<Date | null>(null);
  const [monthlyData, setMonthlyData] = useState<Record<string, number>>({});
  const [clinicHolidays, setClinicHolidays] = useState<ClinicHoliday[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<AvailabilityLevel | null>(null);
  const [dailySlots, setDailySlots] = useState<string[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<string[]>([]);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [loadingDay, setLoadingDay] = useState(false);

  // キャンセル待ちフォーム状態
  const [waitlistState, setWaitlistState] = useState<WaitlistState>("idle");
  const [waitlistStart, setWaitlistStart] = useState("15:00");
  const [waitlistEnd, setWaitlistEnd] = useState("20:00");
  const [waitlistName, setWaitlistName] = useState("");
  const [waitlistPhone, setWaitlistPhone] = useState("");
  const [waitlistSymptoms, setWaitlistSymptoms] = useState("");
  const [waitlistError, setWaitlistError] = useState("");
  const [waitlistNumber, setWaitlistNumber] = useState("");

  // 選択コースの担当(レーン)。設定されていれば月グリッドもそのレーンの空きで色付けする。
  const requiredStaffId = selectedCourse?.required_staff_id ?? null;

  const fetchMonthData = useCallback(async (monthDate: Date) => {
    setLoadingMonth(true);
    const supabase = createClient();
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth() + 1;
    const lastDay = new Date(year, month, 0).getDate();
    
    const startOfMonthJST = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+09:00`);
    const endOfMonthJST = new Date(`${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59+09:00`);
    
    // DBのUTC形式と100%一致させるためにtoISOString()で変換
    const startOfMonthUTC = startOfMonthJST.toISOString();
    const endOfMonthUTC = endOfMonthJST.toISOString();

    // 直接Supabaseからデータを取得（マルチテナント漏洩対策で clinic_id フィルタ必須・
    // customers JOIN は他院の患者名漏洩リスクのため取得しない）
    const [ { data: aptData }, { data: holidayData } ] = await Promise.all([
      supabase.from("appointments").select("start_time, end_time, staff_id, status")
        .eq("clinic_id", PUBLIC_CLINIC_ID)
        .gte("start_time", startOfMonthUTC)
        .lte("start_time", endOfMonthUTC)
        .neq("status", "cancelled"),
      supabase.from("clinic_holidays").select("*")
        .eq("clinic_id", PUBLIC_CLINIC_ID),
    ]);

    const counts: Record<string, number> = {};
    if (aptData) {
      const stepMs = slotMinutes * 60000;
      aptData.forEach((app: { start_time: string; end_time?: string | null; staff_id?: string | null; status?: string }) => {
        // コースに担当(レーン)がある場合は、そのレーンの予約を数える。
        // 担当未設定の実予約（pending/confirmed）は全レーンの埋まり扱い（サーバ側と同じ基準）。
        if (requiredStaffId && app.staff_id !== requiredStaffId) {
          const isUnassignedRealBooking = !app.staff_id && app.status !== "waiting";
          if (!isUnassignedRealBooking) return;
        }
        const dStart = new Date(app.start_time);
        const dEnd = app.end_time ? new Date(app.end_time) : new Date(dStart.getTime() + stepMs);
        let current = dStart.getTime();

        while (current < dEnd.getTime()) {
          // 絶対時間 (UTC) に 9時間 (JST) を足して、UTCのメソッドでJSTの時刻を取得する
          const jstDate = new Date(current + 9 * 3600000);
          const yyyy = jstDate.getUTCFullYear();
          const mon = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
          const dd = String(jstDate.getUTCDate()).padStart(2, '0');
          const hh = String(jstDate.getUTCHours()).padStart(2, '0');
          const mm = String(jstDate.getUTCMinutes()).padStart(2, '0');

          const dateKey = `${yyyy}-${mon}-${dd}`; // YYYY-MM-DD
          const slotTime = `${hh}:${mm}`; // HH:mm

          const slotDateObj = new Date(`${dateKey}T00:00:00+09:00`);
          const businessSlots = getTimeSlots(slotDateObj, { slotMinutes, schedule });

          if (businessSlots.includes(slotTime)) {
            counts[dateKey] = (counts[dateKey] || 0) + 1;
          }
          current += stepMs;
        }
      });
    }

    setMonthlyData(counts);
    setClinicHolidays(holidayData || []);
    setLoadingMonth(false);
  }, [requiredStaffId, slotMinutes, schedule]);

  useEffect(() => {
    setCurrentMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  }, []);

  // メニュー未選択で来た場合：患者情報からの自動選択を試み、できなければメニュー選択へ誘導
  useEffect(() => {
    if (courseIdParam) { setMenuGate("ok"); return; }
    let mounted = true;
    (async () => {
      let input: { customerId?: string; name?: string | null; phone?: string | null } | null = null;
      try {
        const selectedId = localStorage.getItem("ballClinic_selectedCustomerId");
        if (selectedId) input = { customerId: selectedId };
      } catch {}
      if (!input) {
        try {
          const savedName = localStorage.getItem("ballClinic_savedName");
          const savedPhone = localStorage.getItem("ballClinic_savedPhone");
          if (savedName || savedPhone) input = { name: savedName, phone: savedPhone };
        } catch {}
      }
      if (input) {
        try {
          const auto = await getAutoCourseSelection(input);
          if (!mounted) return;
          if (auto) {
            setAutoSelectedNote(
              `ご登録情報にあわせて「${auto.courseName}」を自動選択しました。違うメニューをご希望の場合は「変更」から選び直せます。`,
            );
            const params = new URLSearchParams(Array.from(searchParams.entries()));
            params.set("courseId", auto.courseId);
            router.replace(`/reserve/calendar?${params.toString()}`, { scroll: false });
            setMenuGate("ok");
            return;
          }
        } catch {}
      }
      if (mounted) setMenuGate("required");
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseIdParam]);

  // courseId から該当コースを取得
  useEffect(() => {
    if (!courseIdParam) {
      setSelectedCourse(null);
      setStaffSchedule(null);
      setStaffScheduleName("");
      setCourseNextDate(undefined);
      return;
    }
    let mounted = true;
    getActiveCourses().then(courses => {
      if (!mounted) return;
      const found = courses.find(c => c.id === courseIdParam) ?? null;
      setSelectedCourse(found);
    });
    // このコースの最短の空き日（予約・出勤日・所要時間を考慮）を取得して前向きに案内する
    setCourseNextDate(undefined);
    getCoursesAvailability().then(list => {
      if (!mounted) return;
      const hit = list.find(a => a.courseId === courseIdParam);
      setCourseNextDate(hit ? hit.nextDate : null);
    }).catch(() => { if (mounted) setCourseNextDate(null); });
    // 担当固定コースなら、そのスタッフの出勤日スケジュールを取得（さみ整体など）
    getCourseRequiredStaffSchedule(courseIdParam).then(res => {
      if (!mounted) return;
      if (res) { setStaffSchedule({ weekdays: res.weekdays, dates: res.dates }); setStaffScheduleName(res.staffName); }
      else { setStaffSchedule(null); setStaffScheduleName(""); }
    }).catch(() => { if (mounted) { setStaffSchedule(null); setStaffScheduleName(""); } });
    return () => { mounted = false; };
  }, [courseIdParam]);

  // スタッフ(レーン)タブ用：担当付きコースをスタッフごとにまとめて読み込む
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [courses, staff] = await Promise.all([getActiveCourses(), getActiveStaff()]);
        if (!mounted) return;
        const staffById = new Map(staff.map((s) => [s.id, s]));
        const byStaff = new Map<string, ReservationCourse[]>();
        for (const c of courses) {
          const sid = c.required_staff_id;
          if (!sid) continue;
          const st = staffById.get(sid);
          if (!st || st.is_active === false || st.available_for_online_booking === false) continue;
          if (!byStaff.has(sid)) byStaff.set(sid, []);
          byStaff.get(sid)!.push(c);
        }
        const laneList: Lane[] = [];
        for (const [sid, cs] of byStaff) {
          const st = staffById.get(sid)!;
          let schedule: StaffSchedule | null = null;
          if (st.schedule_based_booking) {
            try {
              const r = await getCourseRequiredStaffSchedule(cs[0].id);
              if (r) schedule = { weekdays: r.weekdays, dates: r.dates };
            } catch {}
          }
          laneList.push({ staffId: sid, staffName: st.name, courses: cs, schedule });
        }
        if (mounted) setLanes(laneList);
      } catch { /* タブ無しでも予約は可能 */ }
    })();
    return () => { mounted = false; };
  }, []);

  // メニュー担当(レーン)を切り替える：URLのcourseIdを差し替えて各表示を連動させる
  const selectLaneCourse = (course: ReservationCourse) => {
    setOpenLaneId(null);
    setSelectedCourse(course);
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set("courseId", course.id);
    router.replace(`/reserve/calendar?${params.toString()}`, { scroll: false });
  };

  // コース(レーン)を切り替えたら、選択中の日付の空きを取り直す
  useEffect(() => {
    if (!selectedDate) return;
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    getDailyAvailability(dateStr, courseIdParam).then(setDailySlots).catch(() => {});
    // selectedDate の変更は handleDayClick 側で取得するため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseIdParam]);

  // 月データ取得（月 or レーン切替で再取得）。選択中の日付はここでは消さない。
  useEffect(() => {
    if (currentMonth) {
      fetchMonthData(currentMonth);
    }
  }, [currentMonth, fetchMonthData]);

  // 月が変わったときだけ選択をリセット（レーンタブ切替では日付選択を維持する）
  useEffect(() => {
    setSelectedDate(null);
    setDailySlots([]);
    setWaitlistState("idle");
  }, [currentMonth]);

  // リアルタイム同期の設定 (Supabase Real-time)
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("public-calendar-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => {
          console.log("[REALTIME] Appointment change, refreshing...");
          if (currentMonth) fetchMonthData(currentMonth);
          if (selectedDate) {
            const dateStr = format(selectedDate, "yyyy-MM-dd");
            getDailyAvailability(dateStr, courseIdParam)
              .then((bookedTimes) => setDailySlots(bookedTimes))
              .catch(() => {});
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clinic_holidays" },
        () => {
          console.log("[REALTIME] Holiday change, refreshing...");
          if (currentMonth) fetchMonthData(currentMonth);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentMonth, selectedDate, fetchMonthData, courseIdParam]);

  // 日付を選んだら、下の時間帯パネルへ自動スクロール（スマホで探さなくて済むように）。
  // 時間枠の読み込み完了後（loadingDay=false）に実行＝レイアウト確定後なので確実に上端まで寄る。
  useEffect(() => {
    if (!selectedDate || loadingDay) return;
    const id = setTimeout(() => {
      timePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => clearTimeout(id);
  }, [selectedDate, loadingDay]);

  const handleDayClick = async (date: Date, level: AvailabilityLevel) => {
    if (level === "closed" || level === "past") return;
    setSelectedDate(date);
    setSelectedLevel(level);
    setWaitlistState("idle");
    setLoadingDay(true);
    
    const dateStr = format(date, "yyyy-MM-dd");

    // 並行してスタッフ予定（全スタッフ不在の時間帯）を取得
    getBlockedTimesForCurrentClinic(dateStr)
      .then((blocked) => setBlockedSlots(blocked))
      .catch(() => setBlockedSlots([]));

    // 埋まっている時間帯はサーバ側で「コースの担当(レーン)の空き」を基準に判定する。
    // （定員/レーンのロジックを reserve.ts の1か所に集約。clinic_id フィルタもサーバ側で実施）
    try {
      const bookedTimes = await getDailyAvailability(dateStr, courseIdParam);
      setDailySlots(bookedTimes);
    } catch (e) {
      console.error("空き時間の取得に失敗:", e);
      setDailySlots([]);
    }
    setLoadingDay(false);
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate) return;
    setWaitlistError("");

    if (!waitlistName || !waitlistPhone || !waitlistStart || !waitlistEnd) {
      setWaitlistError("必須項目をすべてご入力ください。");
      return;
    }
    if (waitlistStart >= waitlistEnd) {
      setWaitlistError("終了時間は開始時間より後にしてください。");
      return;
    }

    setWaitlistState("submitting");
    const fd = new FormData();
    fd.append("date", format(selectedDate, "yyyy-MM-dd"));
    fd.append("startTime", waitlistStart);
    fd.append("endTime", waitlistEnd);
    fd.append("name", waitlistName);
    fd.append("phone", waitlistPhone);
    fd.append("symptoms", waitlistSymptoms);

    const result = await createWaitlistReservation(fd);
    if (result.success) {
      setWaitlistNumber(result.reservationNumber || "");
      setWaitlistState("success");
    } else if ((result as any).requiresQuestionnaire) {
      // 初めての方（顧客未登録）→ アンケート誘導（通常予約と同じゲート）
      setWaitlistState("needsQuestionnaire");
    } else {
      setWaitlistError(result.error || "エラーが発生しました。");
      setWaitlistState("form");
    }
  };

  // ── メニュー未選択ゲートの表示 ──
  // 自動選択を確認中はスピナー、自動選択できなければメニュー選択へ誘導する。
  // この間は空き状況の計算・表示は一切行わない（誤った「◯空き」を見せないため）。
  if (menuGate !== "ok") {
    return (
      <div className="min-h-screen bg-slate-900 text-white" data-dark-page style={{ backgroundColor: '#0f172a', color: 'white' }}>
        <div className="sticky top-0 z-20 bg-slate-900/95 border-b border-zinc-800">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <Link href="/reserve" className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 transition shrink-0">
              <ArrowLeft className="w-4 h-4 text-zinc-300" />
            </Link>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-300 font-bold">{CLINIC_CONFIG.nameShort}</p>
              <h1 className="text-sm font-black text-white truncate">予約空き状況カレンダー</h1>
            </div>
          </div>
        </div>
        {menuGate === "checking" ? (
          <div className="flex items-center justify-center py-32">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-zinc-300 text-sm font-bold">メニューを確認しています...</p>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-12">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center space-y-5">
              <div className="w-16 h-16 bg-blue-600/20 border border-blue-500/40 rounded-full flex items-center justify-center mx-auto">
                <Sparkles className="w-8 h-8 text-blue-300" />
              </div>
              <h2 className="text-xl font-black text-white leading-snug">
                先に施術メニューを
                <br />
                お選びください
              </h2>
              <p className="text-zinc-300 text-sm leading-relaxed">
                メニューによって施術時間が違うため、
                <br />
                メニューを選んでいただくと
                <br />
                正しい空き状況をご案内できます。
              </p>
              <Link
                href="/reserve/menu"
                className="flex items-center justify-center gap-2 w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-base font-black shadow-xl shadow-blue-950 transition-all"
              >
                メニューを選ぶ
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  // カレンダーグリッド生成
  if (!currentMonth) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center" style={{ backgroundColor: '#0f172a' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-300 text-sm font-bold">カレンダーを読み込み中...</p>
        </div>
      </div>
    );
  }

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

  const closeDetail = () => {
    setSelectedDate(null);
    setSelectedLevel(null);
    setDailySlots([]);
    setWaitlistState("idle");
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white" data-dark-page style={{ backgroundColor: '#0f172a', color: 'white' }}>

      {/* ─── ヘッダーバー ─── */}
      <div className="sticky top-0 z-20 bg-slate-900/95 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/reserve" className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 transition shrink-0">
            <ArrowLeft className="w-4 h-4 text-zinc-300" />
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-zinc-300 font-bold">{CLINIC_CONFIG.nameShort}</p>
            <h1 className="text-sm font-black text-white truncate">予約空き状況カレンダー</h1>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] text-zinc-300 font-bold">{horizonLabel(schedule.bookingHorizonDays)}先まで予約可</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-12">

        {/* ─── 選択中メニュー バナー ─── */}
        {selectedCourse && (
          <div className="mt-4 bg-gradient-to-r from-blue-600/20 to-blue-500/10 border border-blue-500/40 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-blue-500/30 rounded-xl flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-blue-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-blue-300/70 font-bold uppercase tracking-widest">選択中のメニュー</p>
                <h2 className="text-base font-black text-white leading-snug mt-0.5">{selectedCourse.name}</h2>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="flex items-center gap-1 text-[11px] text-blue-200 bg-blue-500/20 px-2 py-0.5 rounded-md font-bold">
                    <Clock className="w-3 h-3" />
                    {selectedCourse.duration_minutes}分
                  </span>
                  {selectedCourse.price != null && (
                    <span className="text-[11px] text-blue-200 bg-blue-500/20 px-2 py-0.5 rounded-md font-bold tabular-nums">
                      ¥{selectedCourse.price.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              <Link
                href="/reserve/menu"
                className="shrink-0 text-[11px] font-bold text-blue-300 hover:text-white bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg px-2.5 py-1.5 transition"
              >
                変更
              </Link>
            </div>
            <p className="text-[11px] text-blue-200/60 mt-2.5 ml-13">
              ※ {selectedCourse.duration_minutes}分の連続枠が確保できる時間のみ「◯ 空き」表示しています
            </p>
            {autoSelectedNote && (
              <p className="text-[11px] text-emerald-200/90 mt-1.5 ml-13">
                ✨ {autoSelectedNote}
              </p>
            )}
          </div>
        )}

        {/* ─── 選択コースの空き案内（さみ整体など「休」が多い日でも空きがあると分かるように） ─── */}
        {selectedCourse && courseNextDate !== undefined && (
          courseNextDate ? (
            <div className="mt-4 bg-emerald-500/15 border border-emerald-500/40 rounded-2xl p-3.5 text-sm text-emerald-50">
              <p className="font-black text-emerald-200">✅ {selectedCourse.name} は予約できます！</p>
              <p className="mt-0.5 leading-relaxed">
                最短 <span className="font-bold text-white">{formatShortDate(courseNextDate)}</span> に空きあり。
                下のカレンダーで <span className="text-emerald-300 font-bold">緑の◯</span> の日を選んでください。
                {staffScheduleName ? `（${staffScheduleName}さんの出勤日のみ受付）` : ""}
              </p>
            </div>
          ) : (
            <div className="mt-4 bg-amber-500/15 border border-amber-500/40 rounded-2xl p-3.5 text-sm text-amber-100">
              {selectedCourse.name} の直近{schedule.bookingHorizonDays}日の空きはお問い合わせください
              {staffScheduleName ? `（${staffScheduleName}さんの出勤日のみ受付）` : ""}。
            </div>
          )
        )}

        {/* ─── 月ナビゲーション ─── */}
        <div className="flex items-center justify-between py-5">
          <button
            onClick={prevMonth}
            className="w-12 h-12 flex items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 active:scale-95 transition"
            aria-label="前月"
          >
            <ChevronLeft className="w-5 h-5 text-zinc-300" />
          </button>
          <div className="text-center">
            <h2 className="text-3xl font-black tabular-nums tracking-tight">
              {format(currentMonth, "M月", { locale: ja })}
            </h2>
            <p className="text-xs text-zinc-300 font-bold mt-0.5">{format(currentMonth, "yyyy年", { locale: ja })}</p>
          </div>
          <button
            onClick={nextMonth}
            className="w-12 h-12 flex items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 active:scale-95 transition"
            aria-label="翌月"
          >
            <ChevronRight className="w-5 h-5 text-zinc-300" />
          </button>
        </div>

        {/* ─── 凡例 ─── */}
        <div className="flex items-center justify-between bg-zinc-900 rounded-2xl px-4 py-3 mb-4 border border-zinc-800">
          {(["available", "few", "full", "closed"] as const).map(lv => (
            <div key={lv} className="flex flex-col items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded-full ${levelConfig[lv].dot}`} />
              <span className="text-[10px] text-zinc-400 font-bold">{levelConfig[lv].label || "休診"}</span>
            </div>
          ))}
        </div>

        {/* ─── カレンダーグリッド ─── */}
        <div className="bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden">
          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 border-b border-zinc-800">
            {WEEKDAYS.map((d, i) => (
              <div key={d} className={`text-center text-xs font-black py-3 ${i === 0 ? "text-rose-400" : i === 6 ? "text-blue-400" : "text-zinc-300"}`}>
                {d}
              </div>
            ))}
          </div>

          {loadingMonth ? (
            <div className="flex items-center justify-center h-56">
              <div className="flex flex-col items-center gap-3">
                <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-zinc-300 text-xs font-bold">読み込み中...</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {calDays.map((day, idx) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const bookedCount = monthlyData[dateStr] || 0;
                const level = getAvailabilityLevel(dateStr, bookedCount, day, clinicHolidays, slotMinutes, schedule, staffSchedule);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isClickable = level !== "closed" && level !== "past" && isCurrentMonth;
                const todayDay = isToday(day);
                const dow = idx % 7;

                // ステータス色（solid ベース）
                const cellStyle = !isCurrentMonth
                  ? "bg-slate-900 opacity-20"
                  : level === "available"
                  ? "bg-zinc-900 hover:bg-emerald-950 active:bg-emerald-900"
                  : level === "few"
                  ? "bg-zinc-900 hover:bg-amber-950 active:bg-amber-900"
                  : level === "full"
                  ? "bg-zinc-900 hover:bg-rose-950"
                  : "bg-slate-900";

                // × は廃止。full（空き0）も △ で表示し、色（赤）で「要問合せ」を区別。
                const statusSymbol = level === "available" ? "◯" : (level === "few" || level === "full") ? "△" : "";
                const symbolColor = level === "available"
                  ? "text-emerald-400"
                  : level === "few"
                  ? "text-amber-400"
                  : level === "full"
                  ? "text-rose-300"
                  : "";

                return (
                  <div
                    key={dateStr}
                    onClick={() => isClickable && handleDayClick(day, level)}
                    className={`
                      relative flex flex-col items-center justify-center border-b border-r border-zinc-800 transition-colors
                      ${dow === 6 ? "border-r-0" : ""}
                      ${cellStyle}
                      ${isClickable ? "cursor-pointer" : "cursor-default"}
                      ${isSelected ? "bg-blue-950 ring-inset ring-2 ring-blue-500" : ""}
                    `}
                    style={{ minHeight: "72px" }}
                  >
                    {/* 日付数字 */}
                    <div className={`text-xs font-black mb-1 ${
                      !isCurrentMonth ? "text-zinc-500" :
                      dow === 0 ? "text-rose-400" :
                      dow === 6 ? "text-blue-400" :
                      "text-zinc-300"
                    } ${todayDay ? "bg-blue-600 text-white w-5 h-5 flex items-center justify-center rounded-full text-[11px]" : ""}`}>
                      {format(day, "d")}
                    </div>

                    {/* ステータス記号 */}
                    {isCurrentMonth && statusSymbol && (
                      <span className={`text-base font-black leading-none ${symbolColor}`}>
                        {statusSymbol}
                      </span>
                    )}
                    {isCurrentMonth && level === "closed" && (
                      <span className="text-[10px] font-bold text-zinc-300">休</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── 選択日の時間帯パネル ─── */}
        {selectedDate && (
          <div ref={timePanelRef} className="mt-4 scroll-mt-20 bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden">

            {/* パネルヘッダー */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-[11px] text-zinc-300 font-bold">選択中の日付</p>
                  <h3 className="text-base font-black text-white">
                    {format(selectedDate, "M月d日（E）", { locale: ja })}
                  </h3>
                </div>
              </div>
              <button
                onClick={closeDetail}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 transition text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* スタッフ(レーン)タブ：押すとそのスタッフのメニューに切替＝空き時間も切り替わる */}
            {(() => {
              const dayLanes = lanes.filter(
                (l) => !l.schedule || isStaffAvailableOn(selectedDate, l.schedule),
              );
              if (dayLanes.length < 2) return null;
              return (
                <div className="px-4 pt-3 border-b border-zinc-800 pb-3">
                  <p className="text-[11px] text-zinc-400 font-bold mb-2">担当・メニューを選ぶ</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {dayLanes.map((lane) => {
                      const active = selectedCourse?.required_staff_id === lane.staffId;
                      return (
                        <div key={lane.staffId} className="shrink-0">
                          <button
                            onClick={() =>
                              lane.courses.length === 1
                                ? selectLaneCourse(lane.courses[0])
                                : setOpenLaneId(openLaneId === lane.staffId ? null : lane.staffId)
                            }
                            className={`px-3.5 py-2 rounded-xl text-sm font-black whitespace-nowrap border transition ${
                              active
                                ? "bg-blue-600 border-blue-500 text-white"
                                : "bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700"
                            }`}
                          >
                            {lane.staffName}
                            {lane.courses.length > 1 && (
                              <span className="ml-1 text-[10px] opacity-70">▼</span>
                            )}
                          </button>
                          {openLaneId === lane.staffId && lane.courses.length > 1 && (
                            <div className="mt-1.5 flex flex-col gap-1 bg-zinc-800 rounded-xl p-1.5 border border-zinc-700 min-w-[160px]">
                              {lane.courses.map((c) => (
                                <button
                                  key={c.id}
                                  onClick={() => selectLaneCourse(c)}
                                  className={`text-left px-2.5 py-2 rounded-lg text-xs font-bold leading-snug ${
                                    selectedCourse?.id === c.id
                                      ? "bg-blue-600 text-white"
                                      : "text-zinc-200 hover:bg-zinc-700"
                                  }`}
                                >
                                  {c.name}
                                  {c.duration_minutes ? `・${c.duration_minutes}分` : ""}
                                  {c.price != null ? `・¥${c.price.toLocaleString()}` : ""}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* 時間スロット */}
            <div className="p-4">
              {loadingDay ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-zinc-300 text-sm font-bold">時間を読み込み中...</p>
                </div>
              ) : (() => {
                const allSlots = getTimeSlots(selectedDate, { slotMinutes, schedule });
                const slotDuration = selectedCourse?.duration_minutes ?? 30;
                const requiredSteps = Math.max(1, Math.ceil(slotDuration / slotMinutes));

                // 連続枠が確保できるか判定
                const canFitDuration = (slot: string): boolean => {
                  const idx = allSlots.indexOf(slot);
                  if (idx < 0) return false;
                  for (let i = 0; i < requiredSteps; i++) {
                    const next = allSlots[idx + i];
                    if (!next) return false;
                    if (dailySlots.includes(next)) return false;
                  }
                  return true;
                };

                return (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
                    {allSlots.map((slot) => {
                      const isBooked = dailySlots.includes(slot);
                      const isBlocked = blockedSlots.includes(slot);
                      const isTooClose = isTimeSlotWithinTwoHours(selectedDate, slot);
                      const fits = canFitDuration(slot);

                      if (isBlocked) {
                        return (
                          <div
                            key={slot}
                            className="flex flex-col items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-800/60 py-3.5 px-2 select-none"
                          >
                            <span className="text-sm font-black text-zinc-300 tabular-nums">{slot}</span>
                            <span className="text-[10px] font-bold text-zinc-400 mt-0.5">× 不可</span>
                          </div>
                        );
                      }

                      if (isBooked) {
                        return (
                          <div
                            key={slot}
                            className="flex flex-col items-center justify-center rounded-2xl border border-rose-900/40 bg-rose-950/40 py-3.5 px-2 select-none"
                          >
                            <span className="text-sm font-black text-rose-100/80 tabular-nums line-through">{slot}</span>
                            <span className="text-[10px] font-bold text-rose-300 mt-0.5">予約済</span>
                          </div>
                        );
                      }

                      if (isTooClose) {
                        return (
                          <div
                            key={slot}
                            className="flex flex-col items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-800/60 py-3.5 px-2 select-none"
                          >
                            <span className="text-sm font-black text-zinc-200 tabular-nums">{slot}</span>
                            <span className="text-[10px] font-bold text-amber-300 mt-0.5">要電話</span>
                          </div>
                        );
                      }

                      // 連続枠が確保できない（後続が予約済または営業時間外）
                      if (!fits) {
                        return (
                          <div
                            key={slot}
                            className="flex flex-col items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-800/40 py-3.5 px-2 select-none"
                          >
                            <span className="text-sm font-black text-zinc-300 tabular-nums">{slot}</span>
                            <span className="text-[10px] font-bold text-amber-300 mt-0.5">枠不足</span>
                          </div>
                        );
                      }

                      const courseQuery = selectedCourse ? `&courseId=${selectedCourse.id}` : "";
                      return (
                        <Link
                          key={slot}
                          href={`/reserve?date=${format(selectedDate, "yyyy-MM-dd")}&time=${slot}${courseQuery}`}
                          className="flex flex-col items-center justify-center rounded-2xl border border-emerald-700 bg-emerald-950 py-3.5 px-2 hover:bg-emerald-900 active:scale-95 transition-all shadow-lg shadow-emerald-950/50 cursor-pointer"
                        >
                          <span className="text-sm font-black text-white tabular-nums">{slot}</span>
                          <span className="text-[10px] font-black text-emerald-400 mt-0.5">◯ 空き</span>
                        </Link>
                      );
                    })}
                  </div>
                );
              })()}

              {/* CTA or 要問合せ案内
                  判定方法: 「実際にタップできる空き枠」が 0 個になった時だけ要問合せに切り替える。
                  以前は dailySlots.length < getTimeSlots.length だったが、dailySlots 側に
                  営業時間外の予約まで 30分刻みで積算されて satisfy せず、空きがあっても
                  満員扱いになるバグがあった。

                  キャンセル待ち登録は「空きの有無に関わらず常時出す」方針（ぼーるくん指示）。
                  既に埋まっている時間帯にどうしても来たい患者の動線確保のため。
              */}
              {!loadingDay && (() => {
                const allSlotsForCheck = getTimeSlots(selectedDate, { slotMinutes, schedule });
                const availableSlotsCount = allSlotsForCheck.filter(s =>
                  !dailySlots.includes(s) &&
                  !blockedSlots.includes(s) &&
                  !isTimeSlotWithinTwoHours(selectedDate, s)
                ).length;
                const hasAvailable = availableSlotsCount > 0;
                return (
                  <div className="space-y-3">
                    {hasAvailable ? (
                      <Link
                        href={`/reserve?date=${format(selectedDate, "yyyy-MM-dd")}${selectedCourse ? `&courseId=${selectedCourse.id}` : ""}`}
                        className="flex items-center justify-center gap-2 w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-base font-black shadow-xl shadow-blue-950 transition-all"
                      >
                        <CalendarDays className="w-5 h-5" />
                        {format(selectedDate, "M月d日", { locale: ja })} に予約する
                      </Link>
                    ) : (
                      <>
                        <div className="flex items-start gap-3 bg-rose-950 border border-rose-900 rounded-2xl p-4 text-sm text-rose-300 font-bold">
                          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
                          <span>
                            この日は予約が大変混み合っております。
                            お電話・LINEにて直接お問合せいただくか、下のキャンセル待ち登録をご利用ください。
                          </span>
                        </div>

                        {/* お電話で問合せ */}
                        <a
                          href={`tel:${CLINIC_CONFIG.phone.replace(/[-\s]/g, "")}`}
                          className="flex items-center justify-center gap-2 w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-sm font-black shadow-xl shadow-blue-950 transition-all"
                        >
                          <Phone className="w-5 h-5" />
                          お電話で問合せ（{CLINIC_CONFIG.phone}）
                        </a>

                        {/* LINE で問合せ */}
                        {process.env.NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL && (
                          <a
                            href={process.env.NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full h-14 rounded-2xl bg-green-600 hover:bg-green-500 active:scale-95 text-white text-sm font-black shadow-xl shadow-green-950 transition-all"
                          >
                            <MessageCircle className="w-5 h-5" />
                            LINEで問合せ
                          </a>
                        )}
                      </>
                    )}

                    {/* キャンセル待ち登録（常時表示） */}
                    {waitlistState === "idle" && (
                      <button
                        onClick={() => setWaitlistState("form")}
                        className={`flex items-center justify-center gap-2 w-full h-12 rounded-2xl active:scale-95 text-sm font-black shadow-xl transition-all ${
                          hasAvailable
                            ? "bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-700/50 shadow-zinc-950"
                            : "bg-amber-500 hover:bg-amber-400 text-white shadow-amber-950"
                        }`}
                      >
                        <Clock className="w-4 h-4" />
                        {hasAvailable
                          ? "埋まっている時間に来院したい方は キャンセル待ち登録"
                          : "キャンセルが出たら来院したい時間帯を登録"}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* ─── キャンセル待ちフォーム ─── */}
            {(waitlistState === "form" || waitlistState === "submitting") && (
              <div className="border-t border-zinc-800 bg-slate-900 px-5 py-6">
                <h4 className="font-black text-amber-400 mb-1 flex items-center gap-2 text-base">
                  <Clock className="w-5 h-5" />
                  キャンセル待ち登録
                </h4>
                <p className="text-xs text-zinc-300 mb-5 leading-relaxed">
                  この時間帯にキャンセルが出たら施術を希望、という形で登録します。<br />
                  キャンセルが発生した時点で順に当院からご連絡します。
                </p>
                <form onSubmit={handleWaitlistSubmit} className="space-y-4">
                  {/* 希望時間帯 */}
                  <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4">
                    <Label className="text-[11px] font-bold text-zinc-300 uppercase tracking-widest mb-1 block">
                      キャンセルが出たら来院したい時間帯 <span className="text-rose-400">*</span>
                    </Label>
                    <p className="text-[11px] text-zinc-400 mb-3">
                      例: 「17:00 〜 20:00」のように、この範囲内でキャンセル空きが出た時にご連絡します。
                    </p>
                    <div className="flex items-center gap-2">
                      <select
                        value={waitlistStart}
                        onChange={e => setWaitlistStart(e.target.value)}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-3 text-white text-sm font-bold focus:outline-none focus:border-amber-500"
                      >
                        {getTimeSlots(selectedDate, { slotMinutes, schedule }).map(t => {
                          const isTooClose = isTimeSlotWithinTwoHours(selectedDate, t);
                          return <option key={t} value={t} disabled={isTooClose}>{t}{isTooClose ? " (電話のみ)" : ""}</option>;
                        })}
                      </select>
                      <span className="text-zinc-300 font-bold shrink-0">〜</span>
                      <select
                        value={waitlistEnd}
                        onChange={e => setWaitlistEnd(e.target.value)}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-3 text-white text-sm font-bold focus:outline-none focus:border-amber-500"
                      >
                        {getTimeSlots(selectedDate, { slotMinutes, schedule }).filter(t => t > waitlistStart).concat([selectedDate.getDay() === 6 ? "18:00" : "23:00"]).map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <p className="text-[11px] text-amber-300 mt-2 font-bold">※ この時間帯にキャンセル空きが出た時、当院よりご連絡いたします</p>
                  </div>

                  {/* お名前 */}
                  <div>
                    <Label className="text-[11px] font-bold text-zinc-300 uppercase tracking-widest mb-2 block">
                      お名前 <span className="text-rose-400">*</span>
                    </Label>
                    <input
                      value={waitlistName}
                      onChange={e => setWaitlistName(e.target.value)}
                      placeholder="例: 山田 太郎"
                      className="w-full h-12 bg-zinc-800 border border-zinc-700 rounded-xl px-4 text-white text-sm font-bold placeholder:text-zinc-400 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* 電話番号 */}
                  <div>
                    <Label className="text-[11px] font-bold text-zinc-300 uppercase tracking-widest mb-2 block">
                      お電話番号 <span className="text-rose-400">*</span>
                    </Label>
                    <input
                      type="tel"
                      value={waitlistPhone}
                      onChange={e => setWaitlistPhone(e.target.value)}
                      placeholder="例: 090-1234-5678"
                      className="w-full h-12 bg-zinc-800 border border-zinc-700 rounded-xl px-4 text-white text-sm font-bold placeholder:text-zinc-400 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* 症状（任意） */}
                  <div>
                    <Label className="text-[11px] font-bold text-zinc-300 uppercase tracking-widest mb-2 block">
                      お悩みの症状（任意）
                    </Label>
                    <textarea
                      value={waitlistSymptoms}
                      onChange={e => setWaitlistSymptoms(e.target.value)}
                      placeholder="例: 腰痛、肩こりなど"
                      rows={2}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm font-bold placeholder:text-zinc-400 focus:outline-none focus:border-amber-500 resize-none"
                    />
                  </div>

                  {waitlistError && (
                    <div className="flex items-start gap-2 bg-rose-950 border border-rose-900 rounded-xl p-3 text-sm text-rose-400 font-bold">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{waitlistError}</span>
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setWaitlistState("idle")}
                      disabled={waitlistState === "submitting"}
                      className="flex-1 h-12 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 font-bold text-sm hover:bg-zinc-700 disabled:opacity-40 transition"
                    >
                      キャンセル
                    </button>
                    <button
                      type="submit"
                      disabled={waitlistState === "submitting"}
                      className="flex-1 h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-black text-sm active:scale-95 disabled:opacity-50 transition shadow-lg shadow-amber-950"
                    >
                      {waitlistState === "submitting" ? "登録中..." : "登録する"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ─── キャンセル待ち完了 ─── */}
            {waitlistState === "success" && (
              <div className="border-t border-zinc-800 bg-slate-900 px-5 py-10 text-center">
                <div className="w-16 h-16 bg-emerald-950 border border-emerald-800 rounded-full flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 className="w-9 h-9 text-emerald-400" />
                </div>
                <h4 className="font-black text-white text-xl mb-2">受け付けました</h4>
                <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                  {format(selectedDate, "M月d日", { locale: ja })} の{" "}
                  <span className="text-amber-400 font-bold">{waitlistStart}〜{waitlistEnd}</span>{" "}
                  でキャンセルが出た際にご連絡します。
                </p>
                <div className="inline-block bg-zinc-900 border border-zinc-800 rounded-2xl px-8 py-4 mb-5">
                  <p className="text-[10px] text-zinc-300 font-bold uppercase tracking-widest mb-1">受付番号</p>
                  <p className="text-4xl font-mono font-black text-amber-400 tracking-widest">{waitlistNumber}</p>
                </div>
                <p className="text-xs text-zinc-300 font-bold">
                  LINEでの連絡をご希望の方は{" "}
                  <a href="/reserve" className="text-blue-400 underline underline-offset-2">予約フォーム</a>{" "}
                  よりご連絡ください。
                </p>
              </div>
            )}

            {/* ─── 初めての方 → アンケート誘導（未登録は bypass させない） ─── */}
            {waitlistState === "needsQuestionnaire" && (
              <div className="border-t border-zinc-800 bg-slate-900 px-5 py-10 text-center">
                <div className="w-16 h-16 bg-blue-950 border border-blue-800 rounded-full flex items-center justify-center mx-auto mb-5">
                  <span className="text-3xl">📋</span>
                </div>
                <h4 className="font-black text-white text-xl mb-2">はじめての方へ</h4>
                <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                  オンラインのご利用が初めての方は、<br />
                  先にアンケート（1分程度）へのご回答をお願いします。<br />
                  ご回答後、キャンセル待ちのご登録ができます。
                </p>
                <Link
                  href="/questionnaire"
                  className="inline-flex w-full max-w-xs mx-auto items-center justify-center bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-4 rounded-2xl transition-all gap-2 text-sm"
                >
                  📋 アンケートに回答する
                </Link>
                <button
                  onClick={() => setWaitlistState("form")}
                  className="block mx-auto mt-4 text-xs text-zinc-400 underline underline-offset-2"
                >
                  入力内容に戻る
                </button>
              </div>
            )}
          </div>
        )}

        {/* フッター注記（休診曜日は clinic_settings の closed_weekdays から動的に表示） */}
        <div className="mt-6 space-y-1 text-center">
          {schedule.closedDays.length > 0 && (
            <p className="text-[11px] text-zinc-300 font-bold">
              ※ {[...schedule.closedDays]
                .sort((a, b) => a - b)
                .map((d) => ["日", "月", "火", "水", "木", "金", "土"][d] + "曜")
                .join("・")}
              は休診日です
            </p>
          )}
          <p className="text-[11px] text-zinc-300 font-bold">※ 空き状況はリアルタイムで変わります</p>
        </div>
      </div>
    </div>
  );
}
