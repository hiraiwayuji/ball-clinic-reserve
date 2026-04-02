"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  format, addDays, startOfWeek, subWeeks, addWeeks, parseISO, isSameDay,
} from "date-fns";
import { ja } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft, ChevronRight, Calendar, Settings, Loader2, Plus, User, CalendarDays,
} from "lucide-react";
import Link from "next/link";
import { EditAppointmentDialog } from "@/components/admin/EditAppointmentDialog";
import { AddAppointmentDialog } from "@/components/admin/AddAppointmentDialog";
import { ADMIN_TIME_SLOTS as TIME_SLOTS } from "@/lib/time-slots";

export default function AdminWeeklyGridPage() {
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedAddDate, setSelectedAddDate] = useState<Date | undefined>();
  const [selectedAddTime, setSelectedAddTime] = useState("");

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
  }, []);

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
      setLoading(true);
      const weekEnd = addDays(weekStart, 7);
      try {
        const supabase = createClient();
        const { data: aptData } = await supabase
          .from("appointments")
          .select(`id, start_time, end_time, memo, is_first_visit, status, customers(name, phone)`)
          .gte("start_time", weekStart.toISOString())
          .lt("start_time", weekEnd.toISOString())
          .neq("status", "cancelled");
        if (aptData) setAppointments(aptData);

        const { data: holidayData, error: holidayErr } = await supabase
          .from("clinic_holidays")
          .select("*");
        if (holidayData && !holidayErr) setHolidays(holidayData);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [weekStart, refreshKey]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        setRefreshKey(k => k + 1);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "clinic_holidays" }, () => {
        setRefreshKey(k => k + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-amber-100 text-amber-800 border-amber-200";
      case "waiting": return "bg-orange-100 text-orange-800 border-orange-200";
      case "confirmed": return "bg-blue-100 text-blue-800 border-blue-200";
      default: return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "pending": return "確認待ち";
      case "waiting": return "C待ち";
      case "confirmed": return "確定";
      default: return status;
    }
  };

  const isBusinessHour = (date: Date, timeSlot: string) => {
    const day = date.getDay();
    if (holidays.some(h => isSameDay(parseISO(h.date), date))) return false;
    if (day === 0 || day === 3) return false;
    const [hour, min] = timeSlot.split(":").map(Number);
    const timeValue = hour + min / 60;
    if (day === 6) return timeValue >= 10 && timeValue <= 17.5;
    return timeValue >= 12 && timeValue <= 22.5;
  };

  const isDayOff = (date: Date) => {
    const day = date.getDay();
    if (holidays.some(h => isSameDay(parseISO(h.date), date))) return true;
    return day === 0 || day === 3;
  };

  const selectedDayAppointments = useMemo(() => {
    if (!selectedDay) return [];
    return appointments
      .filter(apt => isSameDay(new Date(apt.start_time), selectedDay))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [appointments, selectedDay]);

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
          <AddAppointmentDialog
            open={isAddDialogOpen}
            onOpenChange={setIsAddDialogOpen}
            defaultDate={selectedAddDate}
            defaultTime={selectedAddTime}
            onSuccess={() => setRefreshKey(k => k + 1)}
          />
          <Link href="/admin/holidays" className="ml-auto sm:ml-0">
            <Button variant="outline" size="sm">
              <Settings className="w-4 h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">休診日設定</span>
              <span className="sm:hidden">休診日</span>
            </Button>
          </Link>
        </div>
      </div>

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
            className="text-sm font-semibold text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"
          >
            {format(weekDays[0], "M月d日", { locale: ja })}
            <span className="text-slate-400 mx-1.5">—</span>
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
            const dayApptCount = appointments.filter(a =>
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

        {/* Appointment list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : selectedDayAppointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
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
              const startTime = new Date(apt.start_time);
              const endTime = apt.end_time
                ? new Date(apt.end_time)
                : new Date(startTime.getTime() + 30 * 60000);
              const timeStr = format(startTime, "HH:mm");
              const endTimeStr = format(endTime, "HH:mm");
              const accentColor =
                apt.status === "confirmed" ? "bg-blue-500" :
                apt.status === "pending" ? "bg-amber-400" : "bg-orange-400";
              const cardBg =
                apt.status === "confirmed" ? "bg-white border-slate-200" :
                apt.status === "pending" ? "bg-amber-50 border-amber-200" : "bg-orange-50 border-orange-200";

              return (
                <button
                  key={apt.id}
                  className="w-full text-left"
                  onClick={() => {
                    setSelectedAppointment({
                      ...apt,
                      customers: Array.isArray(apt.customers) ? apt.customers[0] : apt.customers,
                    });
                    setIsEditDialogOpen(true);
                  }}
                >
                  <Card className={`border ${cardBg} transition-all hover:shadow-md active:scale-[0.99]`}>
                    <div className="flex items-stretch gap-0 overflow-hidden rounded-xl">
                      {/* Accent bar */}
                      <div className={`w-1 ${accentColor} shrink-0`} />
                      <div className="flex items-start gap-3 px-3 py-3 flex-1 min-w-0">
                        {/* Time */}
                        <div className="flex flex-col items-center min-w-[52px] pt-0.5">
                          <span className="text-base font-black text-slate-800 tabular-nums">{timeStr}</span>
                          <span className="text-[10px] text-slate-400 tabular-nums">〜{endTimeStr}</span>
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-900 text-[15px]">{name}</span>
                            {apt.is_first_visit && (
                              <span className="text-[9px] font-black bg-amber-500 text-white px-1.5 py-0.5 rounded-full leading-none">
                                初診
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
                              <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                                <User className="w-2.5 h-2.5" />
                                {phone}
                              </span>
                            )}
                          </div>
                          {apt.memo && apt.memo.trim() && (
                            <p className="text-[11px] text-slate-500 mt-1 truncate">{apt.memo}</p>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-1" />
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
          DESKTOP VIEW (≥ md) — original weekly grid
      ==================================================== */}
      <div
        className="hidden md:flex flex-col gap-4"
        style={{ height: "calc(100vh - 12rem)", overflow: "hidden" }}
      >
        {/* Navigation bar */}
        <Card className="shrink-0 rounded-b-none border-b-0">
          <div className="flex items-center justify-between p-3 px-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleWeekChange(subWeeks(currentDate, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => handleWeekChange(new Date())}>
                今週
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleWeekChange(addWeeks(currentDate, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="text-lg font-bold text-slate-800 flex items-center">
              <Calendar className="w-5 h-5 mr-2 text-slate-500" />
              {format(weekDays[0], "yyyy年 M月 d日", { locale: ja })}
              <span className="text-slate-400 mx-2">〜</span>
              {format(weekDays[6], "M月 d日", { locale: ja })}
            </div>

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
        </Card>

        {/* Weekly grid */}
        <Card className="flex-1 overflow-auto rounded-t-none border-t bg-slate-50">
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
                      const slotAppts = appointments.filter(apt => {
                        const aptDate = new Date(apt.start_time);
                        return isSameDay(aptDate, date) && jstTimeFormatter.format(aptDate) === slot;
                      });

                      return (
                        <div
                          key={`${rowIndex}-${colIndex}`}
                          className={`flex-1 min-w-[120px] border-r relative p-1 transition-colors
                            ${isBusiness
                              ? "bg-white hover:bg-blue-50/50 cursor-pointer"
                              : "bg-slate-100/80 cursor-not-allowed"
                            }
                          `}
                          onClick={() => {
                            if (isBusiness) {
                              setSelectedAddDate(date);
                              setSelectedAddTime(slot);
                              setIsAddDialogOpen(true);
                            }
                          }}
                          style={{ height: "50px" }}
                        >
                          {!isBusiness && slotAppts.length === 0 && (
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
                            const isFirst = apt.is_first_visit;
                            const startTime = new Date(apt.start_time);
                            const endTime = apt.end_time
                              ? new Date(apt.end_time)
                              : new Date(startTime.getTime() + 30 * 60000);
                            const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60000;
                            const slotCount = Math.max(1, Math.ceil(durationMinutes / 30));
                            const heightPx = slotCount * 50 - 4;
                            const widthPercent = 100 / (slotAppts.length || 1);
                            const leftOffset = index * widthPercent;

                            return (
                              <div
                                key={apt.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAppointment({
                                    ...apt,
                                    customers: Array.isArray(apt.customers) ? apt.customers[0] : apt.customers,
                                  });
                                  setIsEditDialogOpen(true);
                                }}
                                className={`absolute top-0 z-10 p-1.5 rounded border text-xs leading-tight shadow-sm cursor-pointer overflow-hidden hover:opacity-80
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
                                  <span className="truncate">{name}</span>
                                  {isFirst && (
                                    <span className="bg-amber-500 text-white text-[9px] px-1 rounded">初</span>
                                  )}
                                </div>
                                <div className="text-[10px] opacity-80 mt-0.5">
                                  <span>{getStatusText(apt.status)}</span>
                                </div>
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
        </Card>

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
    </div>
  );
}
