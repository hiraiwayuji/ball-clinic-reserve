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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-400 animate-pulse">カレンダーを読み込み中...</div>
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
    <div className="min-h-screen bg-[#0F172A] py-8 px-4 text-slate-200">
      <div className="max-w-3xl mx-auto">
        <Link href="/reserve" className="inline-flex items-center text-sm text-blue-200/60 hover:text-white mb-6 transition font-bold">
          <ArrowLeft className="w-4 h-4 mr-1" />
          予約フォームに戻る
        </Link>

        <div className="bg-white/5 backdrop-blur-xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/10">
          {/* ヘッダー */}
          <div className="bg-blue-600/20 border-b border-white/10 px-6 py-5 text-white">
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays className="w-5 h-5 text-blue-400" />
              <h1 className="text-xl font-black tracking-tight">予約空き状況カレンダー</h1>
            </div>
            <p className="text-blue-200/60 text-sm mt-2">日付をクリックすると、その日の時間帯別空き状況が確認できます。<br/>※1ヶ月先までの予約が可能です。</p>
          </div>

          {/* 月ナビゲーション */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
            <button onClick={prevMonth} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition text-slate-400" aria-label="前月">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h2 className="text-2xl font-black text-white tabular-nums tracking-widest">
              {currentMonth && format(currentMonth, "yyyy年M月", { locale: ja })}
            </h2>
            <button onClick={nextMonth} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition text-slate-400" aria-label="翌月">
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>

          {/* 凡例 */}
          <div className="flex flex-wrap gap-x-5 gap-y-3 px-6 py-4 bg-black/20 border-b border-white/10 text-xs">
            {(["available", "few", "full", "closed"] as const).map(level => (
              <div key={level} className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full shadow-sm ${levelConfig[level].dot}`} />
                <span className="text-slate-300 font-bold">{levelConfig[level].label || "休診日"}</span>
              </div>
            ))}
          </div>

          {/* カレンダーグリッド */}
          <div className="p-4 md:p-6">
            <div className="grid grid-cols-7 mb-3">
              {WEEKDAYS.map((d, i) => (
                <div key={d} className={`text-center text-sm font-black py-1 ${i === 0 ? "text-rose-400" : i === 6 ? "text-blue-400" : "text-blue-200/40"}`}>{d}</div>
              ))}
            </div>

            {loadingMonth ? (
              <div className="flex items-center justify-center h-48 text-blue-200/40 text-sm font-bold animate-pulse">読み込み中...</div>
            ) : (
              <div className="grid grid-cols-7 gap-1.5 md:gap-2">
                {calDays.map((day) => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const bookedCount = monthlyData[dateStr] || 0;
                  const level = getAvailabilityLevel(dateStr, bookedCount, day, clinicHolidays);
                  const cfg = levelConfig[level];
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const isClickable = level !== "closed" && level !== "past" && isCurrentMonth;

                  return (
                    <div
                      key={dateStr}
                      onClick={() => isClickable && handleDayClick(day, level)}
                      className={`
                        relative rounded-2xl p-1 border transition-all duration-200 select-none flex flex-col items-center justify-center
                        ${isCurrentMonth ? (isClickable ? cfg.bg : "bg-white/5") : "bg-transparent border-transparent opacity-20"}
                        ${isCurrentMonth ? cfg.border : ""}
                        ${isClickable ? "cursor-pointer hover:scale-[1.02]" : "cursor-default"}
                        ${isSelected ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-[#0F172A] z-10 bg-white/10" : ""}
                        ${isToday(day) ? "font-bold" : ""}
                      `}
                      style={{ minHeight: "85px" }}
                    >
                      <span className={`text-xs absolute top-1.5 left-2 ${isCurrentMonth ? cfg.text : "text-slate-500"} font-black`}>
                        {format(day, "d")}
                      </span>
                      {isCurrentMonth && level !== "past" && (
                        <div className={`text-2xl font-black mt-2 ${cfg.labelClass}`}>
                          {(cfg as any).symbol}
                        </div>
                      )}
                      {isToday(day) && (
                        <span className="absolute top-1.5 right-1.5 text-[9px] font-black text-white bg-blue-600 px-1.5 py-0.5 rounded shadow-sm">今日</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 選択日の詳細パネル */}
          {selectedDate && (
            <div className="border-t border-white/10 bg-black/20">
              {/* 時間帯一覧 */}
              <div className="px-6 py-6 md:p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-black text-white flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-400" />
                    {format(selectedDate, "M月d日 (E)", { locale: ja })} の予約状況
                  </h3>
                  <button onClick={closeDetail} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {loadingDay ? (
                  <div className="text-center text-blue-200/40 text-sm font-bold animate-pulse py-6">時間を読み込み中...</div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5 mb-6">
                      {getTimeSlots(selectedDate).map((slot) => {
                        const isBooked = dailySlots.includes(slot);
                        const isTooClose = isTimeSlotWithinTwoHours(selectedDate, slot);
                        
                        if (isBooked) {
                          return (
                            <div
                              key={slot}
                              className="px-2 py-3 rounded-xl text-center text-sm font-black border transition bg-rose-500/10 border-rose-500/20 text-rose-400 opacity-60"
                            >
                              <div className="text-[13px]">{slot}</div>
                              <div className="text-[10px] py-0.5 mt-0.5 font-bold">予約済</div>
                            </div>
                          );
                        }

                        if (isTooClose) {
                        return (
                          <div
                            key={slot}
                            className="px-2 py-3 rounded-xl text-center text-sm font-black border transition bg-white/5 border-white/10 text-slate-500"
                          >
                            <div className="text-[13px]">{slot}</div>
                            <div className="text-[10px] py-0.5 mt-0.5 font-bold">要電話</div>
                          </div>
                        );
                      }
                      return (
                        <Link
                          key={slot}
                          href={`/reserve?date=${format(selectedDate, "yyyy-MM-dd")}&time=${slot}`}
                          className="px-2 py-3 rounded-xl text-center text-sm font-black border transition bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-400 shadow-lg shadow-emerald-900/20 active:scale-95 flex flex-col items-center"
                        >
                          <div className="text-[13px]">{slot}</div>
                          <div className="text-[10px] py-0.5 mt-0.5 font-black text-white">〇 予約</div>
                        </Link>
                      );
                    })}
                  </div>
                )}

                {/* 予約枠が1つでもある場合は予約フォームへのリンクを表示 */}
                {dailySlots.length < getTimeSlots(selectedDate).length ? (
                  <Button asChild className="w-full h-16 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-lg font-black shadow-lg shadow-blue-900/20">
                    <Link href={`/reserve?date=${format(selectedDate, "yyyy-MM-dd")}`}>
                      <CalendarDays className="w-5 h-5 mr-2 -mt-0.5" />
                      {format(selectedDate, "M月d日", { locale: ja })} に予約する
                    </Link>
                  </Button>
                ) : (
                  /* 全て埋まっている場合のみキャンセル待ちボタンを表示 */
                  <div className="space-y-4">
                    <div className="flex items-start gap-2.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 text-sm text-rose-300 font-bold">
                      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
                      <span>この日の予約枠はすべて埋まっています。ご希望の時間帯を入力してキャンセル待ちに登録できます。</span>
                    </div>
                    {waitlistState === "idle" && (
                      <Button
                        onClick={() => setWaitlistState("form")}
                        className="w-full h-16 rounded-2xl bg-amber-500 hover:bg-amber-400 text-white text-base font-black shadow-lg shadow-amber-900/20"
                      >
                        <Clock className="w-5 h-5 mr-2 -mt-0.5" />
                        希望時間帯を指定してキャンセル待ちに登録
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* キャンセル待ちフォーム */}
              {(waitlistState === "form" || waitlistState === "submitting") && (
                <div className="border-t border-amber-500/20 bg-amber-500/5 px-6 py-6 md:p-8 text-white">
                  <h4 className="font-bold text-amber-400 mb-5 flex items-center gap-2 text-lg tracking-tight">
                    <Clock className="w-5 h-5" />
                    キャンセル待ちに登録
                  </h4>
                  <form onSubmit={handleWaitlistSubmit} className="space-y-5">
                    {/* 希望時間帯 */}
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                      <Label className="text-xs font-bold text-blue-100/60 uppercase tracking-widest mb-3 block">
                        ご希望の時間帯 <span className="text-rose-400">*</span>
                      </Label>
                      <div className="flex items-center gap-3">
                        <select
                          value={waitlistStart}
                          onChange={e => setWaitlistStart(e.target.value)}
                          className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 font-bold"
                        >
                          {getTimeSlots(selectedDate).map(t => {
                            const isTooClose = isTimeSlotWithinTwoHours(selectedDate, t);
                            return <option key={t} value={t} disabled={isTooClose}>{t} {isTooClose ? "(電話のみ)" : ""}</option>
                          })}
                        </select>
                        <span className="text-blue-100/60 font-bold">〜</span>
                        <select
                          value={waitlistEnd}
                          onChange={e => setWaitlistEnd(e.target.value)}
                          className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 font-bold"
                        >
                          {getTimeSlots(selectedDate).filter(t => t > waitlistStart).concat([selectedDate.getDay() === 6 ? "18:00" : "23:00"]).map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <p className="text-xs text-amber-200/60 mt-3 font-medium">※ 指定した範囲内で空きが出た際にご連絡いたします</p>
                    </div>

                    {/* お名前 */}
                    <div>
                      <Label htmlFor="waitlist-name" className="text-xs font-bold text-blue-100/60 uppercase tracking-widest mb-2 block">
                        お名前 <span className="text-rose-400">*</span>
                      </Label>
                      <Input
                        id="waitlist-name"
                        value={waitlistName}
                        onChange={e => setWaitlistName(e.target.value)}
                        placeholder="例: 山田 太郎"
                        className="h-14 bg-white/5 border-white/10 rounded-xl text-white placeholder:text-white/20 focus:border-amber-500/50 font-bold"
                      />
                    </div>

                    {/* 電話番号 */}
                    <div>
                      <Label htmlFor="waitlist-phone" className="text-xs font-bold text-blue-100/60 uppercase tracking-widest mb-2 block">
                        お電話番号 <span className="text-rose-400">*</span>
                      </Label>
                      <Input
                        id="waitlist-phone"
                        type="tel"
                        value={waitlistPhone}
                        onChange={e => setWaitlistPhone(e.target.value)}
                        placeholder="例: 090-1234-5678"
                        className="h-14 bg-white/5 border-white/10 rounded-xl text-white placeholder:text-white/20 focus:border-amber-500/50 font-bold"
                      />
                    </div>

                    {/* 症状（任意） */}
                    <div>
                      <Label htmlFor="waitlist-symptoms" className="text-xs font-bold text-blue-100/60 uppercase tracking-widest mb-2 block">
                        お悩みの症状（任意）
                      </Label>
                      <textarea
                        id="waitlist-symptoms"
                        value={waitlistSymptoms}
                        onChange={e => setWaitlistSymptoms(e.target.value)}
                        placeholder="例: 腰痛、肩こりなど"
                        rows={3}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 resize-none font-bold"
                      />
                    </div>

                    {waitlistError && (
                      <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 font-bold flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        {waitlistError}
                      </p>
                    )}

                    <div className="flex gap-4 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setWaitlistState("idle")}
                        className="flex-1 h-14 rounded-xl bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white"
                        disabled={waitlistState === "submitting"}
                      >
                        キャンセル
                      </Button>
                      <Button
                        type="submit"
                        className="flex-1 h-14 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-black shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
                        disabled={waitlistState === "submitting"}
                      >
                        {waitlistState === "submitting" ? "登録処理中..." : "登録する"}
                      </Button>
                    </div>
                  </form>
                </div>
              )}

              {/* キャンセル待ち登録完了 */}
              {waitlistState === "success" && (
                <div className="border-t border-white/10 px-6 py-8 text-center text-white">
                  <CheckCircle2 className="w-14 h-14 text-amber-400 mx-auto mb-4" />
                  <h4 className="font-black text-white text-xl mb-2 tracking-tight">キャンセル待ちを受け付けました</h4>
                  <p className="text-blue-200/80 text-sm mb-5 font-bold">
                    {format(selectedDate, "M月d日", { locale: ja })} の <strong className="text-amber-400">{waitlistStart}〜{waitlistEnd}</strong> の範囲でキャンセルが出た場合にご連絡いたします。
                  </p>
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 mb-5 inline-block">
                    <p className="text-xs text-amber-400/80 mb-1 font-bold uppercase tracking-widest">受付番号</p>
                    <p className="text-3xl font-mono font-black text-amber-400 tracking-widest drop-shadow-md">{waitlistNumber}</p>
                  </div>
                  <p className="text-xs text-blue-200/60 mt-2 font-bold">
                    ※ LINEでの連絡をご希望の方は <a href="/reserve" className="text-blue-400 hover:underline">予約フォーム</a> よりご連絡ください。
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 text-xs text-blue-200/40 text-center space-y-1 font-bold">
          <p>※ 水曜・日曜は休診日です</p>
          <p>※ 空き状況はリアルタイムで変わります。ご予約はお早めに。</p>
        </div>
      </div>
    </div>
  );
}
