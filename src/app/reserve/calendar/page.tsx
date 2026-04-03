"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { format, isSameMonth, isSameDay, isToday, isPast, startOfDay, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek } from "date-fns";
import { ja } from "date-fns/locale";
import { ChevronLeft, ChevronRight, ArrowLeft, Clock, CalendarDays, X, CheckCircle2, AlertCircle } from "lucide-react";
import { createWaitlistReservation } from "@/app/actions/reserve";
import { getClinicHolidays, type ClinicHoliday } from "@/app/actions/holidays";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

import { getTimeSlots, getMaxSlots, isDateWithinAllowedRange, isTimeSlotWithinTwoHours } from "@/lib/time-slots";

// 静的なTIME_SLOTS, MAX_SLOTSを削除

type AvailabilityLevel = "available" | "few" | "full" | "closed" | "past";

function getAvailabilityLevel(dateStr: string, bookedCount: number, date: Date, clinicHolidays: ClinicHoliday[]): AvailabilityLevel {
  const isHoliday = clinicHolidays.some(h => h.date === dateStr);
  if (isHoliday) return "closed";

  const day = date.getDay();
  if (day === 0 || day === 3) return "closed";
  if (isPast(startOfDay(date)) && !isToday(date)) return "past";
  
  // 1ヶ月制限のチェック
  if (!isDateWithinAllowedRange(date)) return "closed";
  
  // 実際に予約可能なスロット（2時間前制限にかかっていないもの）をカウントする
  const allSlots = getTimeSlots(date);
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
  full: {
    bg: "bg-rose-500/10 hover:bg-rose-500/20",
    border: "border-rose-500/30",
    dot: "bg-rose-400",
    label: "× 予約済",
    symbol: "×",
    labelClass: "text-rose-400",
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

type WaitlistState = "idle" | "form" | "submitting" | "success";

export default function ReserveCalendarPage() {
  const [currentMonth, setCurrentMonth] = useState<Date | null>(null);
  const [monthlyData, setMonthlyData] = useState<Record<string, number>>({});
  const [clinicHolidays, setClinicHolidays] = useState<ClinicHoliday[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<AvailabilityLevel | null>(null);
  const [dailySlots, setDailySlots] = useState<string[]>([]);
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

    // 直接Supabaseからデータを取得 (キャッシュ完全破棄のためダミー条件付与)
    const [ { data: aptData }, { data: holidayData } ] = await Promise.all([
      supabase.from("appointments").select("start_time, end_time, customers(name)")
        .gte("start_time", startOfMonthUTC)
        .lte("start_time", endOfMonthUTC)
        .neq("status", "cancelled"),
      supabase.from("clinic_holidays").select("*")
    ]);

    const counts: Record<string, number> = {};
    if (aptData) {
      aptData.forEach((app: any) => {
        // ユーザー指示のJSTログ出力
        console.log(`[予約データ取得] ${app.customers?.name || 'Unknown'}: start_time=${new Date(app.start_time).toLocaleString("ja-JP", {timeZone: "Asia/Tokyo"})}`);
        
        const dStart = new Date(app.start_time);
        const dEnd = app.end_time ? new Date(app.end_time) : new Date(dStart.getTime() + 30 * 60000);
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
          const businessSlots = getTimeSlots(slotDateObj);
          
          if (businessSlots.includes(slotTime)) {
            counts[dateKey] = (counts[dateKey] || 0) + 1;
          }
          current += 30 * 60000;
        }
      });
    }

    setMonthlyData(counts);
    setClinicHolidays(holidayData || []);
    setLoadingMonth(false);
  }, []);

  useEffect(() => {
    setCurrentMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  }, []);

  useEffect(() => {
    if (currentMonth) {
      fetchMonthData(currentMonth);
    }
    setSelectedDate(null);
    setDailySlots([]);
    setWaitlistState("idle");
  }, [currentMonth, fetchMonthData]);

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
            const startOfDayUTC = new Date(`${dateStr}T00:00:00+09:00`).toISOString();
            const endOfDayUTC = new Date(`${dateStr}T23:59:59+09:00`).toISOString();
            supabase.from("appointments").select("start_time, end_time")
              .gte("start_time", startOfDayUTC)
              .lte("start_time", endOfDayUTC)
              .neq("status", "cancelled")
              .then(({data}) => {
              const slotCounts: Record<string, number> = {};
              if (data) {
                data.forEach((app: any) => {
                  const start = new Date(app.start_time);
                  const end = app.end_time ? new Date(app.end_time) : new Date(start.getTime() + 30 * 60000);
                  let current = start.getTime();
                  while (current < end.getTime()) {
                    // 絶対時間に9時間(JST)を加え、フォーマットブレのない手動0埋めでHH:mmを生成
                    const jstDate = new Date(current + 9 * 3600000);
                    const hh = String(jstDate.getUTCHours()).padStart(2, '0');
                    const mm = String(jstDate.getUTCMinutes()).padStart(2, '0');
                    const timeKey = `${hh}:${mm}`;
                    
                    slotCounts[timeKey] = (slotCounts[timeKey] || 0) + 1;
                    current += 30 * 60000;
                  }
                });
              }
              const bookedTimes = Object.keys(slotCounts).filter(time => slotCounts[time] >= 1);
              setDailySlots(bookedTimes);
            });
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
  }, [currentMonth, selectedDate, fetchMonthData]);

  const handleDayClick = async (date: Date, level: AvailabilityLevel) => {
    if (level === "closed" || level === "past") return;
    setSelectedDate(date);
    setSelectedLevel(level);
    setWaitlistState("idle");
    setLoadingDay(true);
    
    const dateStr = format(date, "yyyy-MM-dd");
    const supabase = createClient();
    
    // JSTからUTC文字列に厳密に変換する (DBのUTCデータと100%一致させるため)
    const startOfDayUTC = new Date(`${dateStr}T00:00:00+09:00`).toISOString();
    const endOfDayUTC = new Date(`${dateStr}T23:59:59+09:00`).toISOString();
    
    // 直接Supabaseからデータを取得（キャッシュ回避のためダミー条件を付与）
    const { data: aptData, error: aptError } = await supabase
      .from("appointments")
      .select("start_time, end_time, customers(name)")
      .gte("start_time", startOfDayUTC)
      .lte("start_time", endOfDayUTC)
      .neq("status", "cancelled");

    if (aptError) console.error("データ取得エラー:", aptError);

    const slotCounts: Record<string, number> = {};
    if (aptData) {
      aptData.forEach((app: any) => {
        // ユーザー指示のJSTログ出力
        console.log(`[予約データ取得] ${app.customers?.name || 'Unknown'}: start_time=${new Date(app.start_time).toLocaleString("ja-JP", {timeZone: "Asia/Tokyo"})}`);
        
        const start = new Date(app.start_time);
        const end = app.end_time ? new Date(app.end_time) : new Date(start.getTime() + 30 * 60000);
        let current = start.getTime();
        while (current < end.getTime()) {
          // 絶対時間に9時間(JST)を加え、フォーマットブレのない手動0埋めでHH:mmを生成
          const jstDate = new Date(current + 9 * 3600000);
          const hh = String(jstDate.getUTCHours()).padStart(2, '0');
          const mm = String(jstDate.getUTCMinutes()).padStart(2, '0');
          const timeKey = `${hh}:${mm}`;
          
          slotCounts[timeKey] = (slotCounts[timeKey] || 0) + 1;
          
          current += 30 * 60000;
        }
      });
    }

    const bookedTimes = Object.keys(slotCounts).filter(time => slotCounts[time] >= 1);
    
    setDailySlots(bookedTimes);
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
    } else {
      setWaitlistError(result.error || "エラーが発生しました。");
      setWaitlistState("form");
    }
  };

  // カレンダーグリッド生成
  if (!currentMonth) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-500 text-sm font-bold">カレンダーを読み込み中...</p>
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
    <div className="min-h-screen bg-[#0F172A] text-white">

      {/* ─── ヘッダーバー ─── */}
      <div className="sticky top-0 z-20 bg-[#0F172A]/95 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/reserve" className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 transition shrink-0">
            <ArrowLeft className="w-4 h-4 text-zinc-300" />
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-zinc-500 font-bold">ボール接骨院</p>
            <h1 className="text-sm font-black text-white truncate">予約空き状況カレンダー</h1>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] text-zinc-600 font-bold">1ヶ月先まで予約可</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-12">

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
            <p className="text-xs text-zinc-500 font-bold mt-0.5">{format(currentMonth, "yyyy年", { locale: ja })}</p>
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
              <div key={d} className={`text-center text-xs font-black py-3 ${i === 0 ? "text-rose-400" : i === 6 ? "text-blue-400" : "text-zinc-500"}`}>
                {d}
              </div>
            ))}
          </div>

          {loadingMonth ? (
            <div className="flex items-center justify-center h-56">
              <div className="flex flex-col items-center gap-3">
                <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-zinc-600 text-xs font-bold">読み込み中...</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {calDays.map((day, idx) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const bookedCount = monthlyData[dateStr] || 0;
                const level = getAvailabilityLevel(dateStr, bookedCount, day, clinicHolidays);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isClickable = level !== "closed" && level !== "past" && isCurrentMonth;
                const todayDay = isToday(day);
                const dow = idx % 7;

                // ステータス色（solid ベース）
                const cellStyle = !isCurrentMonth
                  ? "bg-[#0F172A] opacity-20"
                  : level === "available"
                  ? "bg-zinc-900 hover:bg-emerald-950 active:bg-emerald-900"
                  : level === "few"
                  ? "bg-zinc-900 hover:bg-amber-950 active:bg-amber-900"
                  : level === "full"
                  ? "bg-zinc-900 hover:bg-rose-950"
                  : "bg-[#0F172A]";

                const statusSymbol = level === "available" ? "◯" : level === "few" ? "△" : level === "full" ? "×" : "";
                const symbolColor = level === "available"
                  ? "text-emerald-400"
                  : level === "few"
                  ? "text-amber-400"
                  : level === "full"
                  ? "text-rose-500"
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
                      !isCurrentMonth ? "text-zinc-700" :
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
                      <span className="text-[9px] font-bold text-zinc-700">休</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── 選択日の時間帯パネル ─── */}
        {selectedDate && (
          <div className="mt-4 bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden">

            {/* パネルヘッダー */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-[11px] text-zinc-500 font-bold">選択中の日付</p>
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

            {/* 時間スロット */}
            <div className="p-4">
              {loadingDay ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-zinc-600 text-sm font-bold">時間を読み込み中...</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
                  {getTimeSlots(selectedDate).map((slot) => {
                    const isBooked = dailySlots.includes(slot);
                    const isTooClose = isTimeSlotWithinTwoHours(selectedDate, slot);

                    if (isBooked) {
                      return (
                        <div
                          key={slot}
                          className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-[#0F172A] py-3.5 px-2 select-none opacity-50"
                        >
                          <span className="text-sm font-black text-zinc-500 tabular-nums">{slot}</span>
                          <span className="text-[10px] font-bold text-rose-600 mt-0.5">予約済</span>
                        </div>
                      );
                    }

                    if (isTooClose) {
                      return (
                        <div
                          key={slot}
                          className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-[#0F172A] py-3.5 px-2 select-none"
                        >
                          <span className="text-sm font-black text-zinc-500 tabular-nums">{slot}</span>
                          <span className="text-[10px] font-bold text-zinc-600 mt-0.5">要電話</span>
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={slot}
                        href={`/reserve?date=${format(selectedDate, "yyyy-MM-dd")}&time=${slot}`}
                        className="flex flex-col items-center justify-center rounded-2xl border border-emerald-700 bg-emerald-950 py-3.5 px-2 hover:bg-emerald-900 active:scale-95 transition-all shadow-lg shadow-emerald-950/50 cursor-pointer"
                      >
                        <span className="text-sm font-black text-white tabular-nums">{slot}</span>
                        <span className="text-[10px] font-black text-emerald-400 mt-0.5">◯ 空き</span>
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* CTA or 満員案内 */}
              {!loadingDay && (
                dailySlots.length < getTimeSlots(selectedDate).length ? (
                  <Link
                    href={`/reserve?date=${format(selectedDate, "yyyy-MM-dd")}`}
                    className="flex items-center justify-center gap-2 w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-base font-black shadow-xl shadow-blue-950 transition-all"
                  >
                    <CalendarDays className="w-5 h-5" />
                    {format(selectedDate, "M月d日", { locale: ja })} に予約する
                  </Link>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 bg-rose-950 border border-rose-900 rounded-2xl p-4 text-sm text-rose-300 font-bold">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
                      <span>この日の予約枠はすべて埋まっています。キャンセル待ちに登録できます。</span>
                    </div>
                    {waitlistState === "idle" && (
                      <button
                        onClick={() => setWaitlistState("form")}
                        className="flex items-center justify-center gap-2 w-full h-14 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-white text-sm font-black shadow-xl shadow-amber-950 transition-all"
                      >
                        <Clock className="w-5 h-5" />
                        希望時間帯を指定してキャンセル待ち登録
                      </button>
                    )}
                  </div>
                )
              )}
            </div>

            {/* ─── キャンセル待ちフォーム ─── */}
            {(waitlistState === "form" || waitlistState === "submitting") && (
              <div className="border-t border-zinc-800 bg-[#0F172A] px-5 py-6">
                <h4 className="font-black text-amber-400 mb-5 flex items-center gap-2 text-base">
                  <Clock className="w-5 h-5" />
                  キャンセル待ちに登録
                </h4>
                <form onSubmit={handleWaitlistSubmit} className="space-y-4">
                  {/* 希望時間帯 */}
                  <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4">
                    <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-3 block">
                      ご希望の時間帯 <span className="text-rose-400">*</span>
                    </Label>
                    <div className="flex items-center gap-2">
                      <select
                        value={waitlistStart}
                        onChange={e => setWaitlistStart(e.target.value)}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-3 text-white text-sm font-bold focus:outline-none focus:border-amber-500"
                      >
                        {getTimeSlots(selectedDate).map(t => {
                          const isTooClose = isTimeSlotWithinTwoHours(selectedDate, t);
                          return <option key={t} value={t} disabled={isTooClose}>{t}{isTooClose ? " (電話のみ)" : ""}</option>;
                        })}
                      </select>
                      <span className="text-zinc-500 font-bold shrink-0">〜</span>
                      <select
                        value={waitlistEnd}
                        onChange={e => setWaitlistEnd(e.target.value)}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-3 text-white text-sm font-bold focus:outline-none focus:border-amber-500"
                      >
                        {getTimeSlots(selectedDate).filter(t => t > waitlistStart).concat([selectedDate.getDay() === 6 ? "18:00" : "23:00"]).map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <p className="text-[11px] text-amber-600 mt-2 font-bold">※ 範囲内で空きが出た際にご連絡いたします</p>
                  </div>

                  {/* お名前 */}
                  <div>
                    <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2 block">
                      お名前 <span className="text-rose-400">*</span>
                    </Label>
                    <input
                      value={waitlistName}
                      onChange={e => setWaitlistName(e.target.value)}
                      placeholder="例: 山田 太郎"
                      className="w-full h-12 bg-zinc-800 border border-zinc-700 rounded-xl px-4 text-white text-sm font-bold placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* 電話番号 */}
                  <div>
                    <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2 block">
                      お電話番号 <span className="text-rose-400">*</span>
                    </Label>
                    <input
                      type="tel"
                      value={waitlistPhone}
                      onChange={e => setWaitlistPhone(e.target.value)}
                      placeholder="例: 090-1234-5678"
                      className="w-full h-12 bg-zinc-800 border border-zinc-700 rounded-xl px-4 text-white text-sm font-bold placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* 症状（任意） */}
                  <div>
                    <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2 block">
                      お悩みの症状（任意）
                    </Label>
                    <textarea
                      value={waitlistSymptoms}
                      onChange={e => setWaitlistSymptoms(e.target.value)}
                      placeholder="例: 腰痛、肩こりなど"
                      rows={2}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm font-bold placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 resize-none"
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
              <div className="border-t border-zinc-800 bg-[#0F172A] px-5 py-10 text-center">
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
                  <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mb-1">受付番号</p>
                  <p className="text-4xl font-mono font-black text-amber-400 tracking-widest">{waitlistNumber}</p>
                </div>
                <p className="text-xs text-zinc-600 font-bold">
                  LINEでの連絡をご希望の方は{" "}
                  <a href="/reserve" className="text-blue-400 underline underline-offset-2">予約フォーム</a>{" "}
                  よりご連絡ください。
                </p>
              </div>
            )}
          </div>
        )}

        {/* フッター注記 */}
        <div className="mt-6 space-y-1 text-center">
          <p className="text-[11px] text-zinc-700 font-bold">※ 水曜・日曜は休診日です</p>
          <p className="text-[11px] text-zinc-700 font-bold">※ 空き状況はリアルタイムで変わります</p>
        </div>
      </div>
    </div>
  );
}
