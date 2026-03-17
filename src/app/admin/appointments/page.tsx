"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { format, addDays, startOfWeek, subWeeks, addWeeks, parseISO, isSameDay } from "date-fns";
import { ja } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar, Settings, Loader2 } from "lucide-react";
import Link from "next/link";
import { EditAppointmentDialog } from "@/components/admin/EditAppointmentDialog";
import { AddAppointmentDialog } from "@/components/admin/AddAppointmentDialog";
import { ADMIN_TIME_SLOTS as TIME_SLOTS } from "@/lib/time-slots";

export default function AdminWeeklyGridPage() {
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedAddDate, setSelectedAddDate] = useState<Date | undefined>();
  const [selectedAddTime, setSelectedAddTime] = useState("");

  // 指定された週の開始日（月曜日）を計算
  const weekStart = useMemo(() => {
    if (!currentDate) return startOfWeek(new Date(), { weekStartsOn: 1 });
    return startOfWeek(currentDate, { weekStartsOn: 1 });
  }, [currentDate]);

  // 今週の7日間の日付配列を生成
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  }, [weekStart]);

  useEffect(() => {
    setCurrentDate(new Date());
  }, []);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const weekEnd = addDays(weekStart, 7);

      try {
        const supabase = createClient();
        // 1. 予約データの取得
        const { data: aptData, error: aptErr } = await supabase
          .from("appointments")
          .select(`id, start_time, end_time, memo, is_first_visit, status, customers(name, phone)`)
          .gte("start_time", weekStart.toISOString())
          .lt("start_time", weekEnd.toISOString())
          .neq("status", "cancelled");

        if (aptData) setAppointments(aptData);

        // 2. 臨時休診日の取得
        const { data: holidayData, error: holidayErr } = await supabase
          .from("clinic_holidays")
          .select("*");

        if (holidayData && !holidayErr) {
          setHolidays(holidayData);
        }

      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [weekStart, refreshKey]);

  // 3. リアルタイム同期の設定 (Supabase Real-time)
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => {
          console.log("[REALTIME] Appointment change detected, refreshing...");
          setRefreshKey(k => k + 1);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clinic_holidays" },
        () => {
          console.log("[REALTIME] Holiday change detected, refreshing...");
          setRefreshKey(k => k + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ステータスに応じたバッジ色
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
      case "waiting": return "キャンセル待ち";
      case "confirmed": return "確定";
      default: return status;
    }
  };

  // 曜日ごとの営業時間判定（定休日：水・日、土曜：10:00〜17:30、他：12:00〜22:30）
  const isBusinessHour = (date: Date, timeSlot: string) => {
    const day = date.getDay();
    // 臨時休診日チェック
    if (holidays.some(h => isSameDay(parseISO(h.date), date))) {
      return false;
    }

    if (day === 0 || day === 3) return false; // 日・水は定休日

    const [hour, min] = timeSlot.split(":").map(Number);
    const timeValue = hour + min / 60;

    if (day === 6) {
      // 土曜日 (10:00〜17:30受付)
      return timeValue >= 10 && timeValue <= 17.5;
    } else {
      // 平日 (12:00〜22:30受付)
      return timeValue >= 12 && timeValue <= 22.5;
    }
  };

  if (!currentDate) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 flex flex-col h-screen max-h-[calc(100vh-6rem)] overflow-hidden">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">予約カレンダー (週間グリッド)</h1>
          <p className="text-slate-500 mt-1">AirRESERVE風の全スタッフ・時間帯一覧表示です。</p>
        </div>

        <div className="flex items-center gap-3">
          <AddAppointmentDialog 
            open={isAddDialogOpen}
            onOpenChange={setIsAddDialogOpen}
            defaultDate={selectedAddDate}
            defaultTime={selectedAddTime}
            onSuccess={() => setRefreshKey(k => k + 1)} 
          />
          <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 px-3 py-1">
            Googleカレンダー 連携設定
          </Badge>
          <Link href="/admin/holidays">
            <Button variant="outline" size="sm">
              <Settings className="w-4 h-4 mr-2" /> 休診日設定
            </Button>
          </Link>
        </div>
      </div>

      {/* カレンダー操作ナビゲーション */}
      <Card className="shrink-0 rounded-b-none border-b-0">
        <div className="flex items-center justify-between p-3 px-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentDate(subWeeks(currentDate, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => setCurrentDate(new Date())}>
              今週
            </Button>
            <Button variant="outline" size="icon" onClick={() => setCurrentDate(addWeeks(currentDate, 1))}>
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
            <div className="flex items-center"><div className="w-3 h-3 bg-blue-100 border border-blue-200 rounded-sm mr-1"></div> 確定</div>
            <div className="flex items-center"><div className="w-3 h-3 bg-orange-100 border border-orange-200 rounded-sm mr-1"></div> C待ち</div>
          </div>
        </div>
      </Card>

      {/* グリッド UI */}
      <Card className="flex-1 overflow-auto rounded-t-none border-t bg-slate-50">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="min-w-[800px] h-full relative">
            {/* ヘッダー行 (曜日) */}
            <div className="flex sticky top-0 z-20 bg-white border-b shadow-sm">
              <div className="w-20 shrink-0 border-r bg-slate-50"></div>
              {weekDays.map((date, i) => {
                const isToday = isSameDay(date, new Date());
                const isHoliday = holidays.some(h => isSameDay(parseISO(h.date), date));
                const dayStr = format(date, "E", { locale: ja });
                const isWeekend = dayStr === "土" || dayStr === "日";

                return (
                  <div key={i} className={`flex-1 min-w-[120px] text-center py-2 border-r ${isToday ? 'bg-blue-50' : ''}`}>
                    <div className={`text-sm font-bold 
                      ${dayStr === '土' ? 'text-blue-600' : ''} 
                      ${dayStr === '日' || isHoliday ? 'text-rose-600' : 'text-slate-700'}
                    `}>
                      {format(date, "M/d (E)", { locale: ja })}
                    </div>
                    {isHoliday && <div className="text-[10px] text-rose-500 font-bold mt-0.5">休診日</div>}
                  </div>
                );
              })}
            </div>

            {/* タイムスロット行 */}
            <div className="bg-white">
              {TIME_SLOTS.map((slot, rowIndex) => (
                <div key={slot} className="flex border-b">
                  <div className="w-20 shrink-0 border-r bg-slate-50 flex items-center justify-center text-xs font-medium text-slate-500 py-4">
                    {slot}
                  </div>

                  {weekDays.map((date, colIndex) => {
                    const isBusiness = isBusinessHour(date, slot);

                    // JSTでの時間を厳密に比較するためのフォーマッター
                    const jstTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
                      timeZone: 'Asia/Tokyo',
                      hour: '2-digit', minute: '2-digit',
                      hour12: false
                    });

                    // この日・この枠の予約を探す
                    const slotAppts = appointments.filter(apt => {
                      const aptDate = new Date(apt.start_time);
                      // jstTimeFormatterでフォーマットしたHH:mmがスロット時間と一致するか判定
                      return isSameDay(aptDate, date) && jstTimeFormatter.format(aptDate) === slot;
                    });

                    return (
                      <div
                        key={`${rowIndex}-${colIndex}`}
                        className={`flex-1 min-w-[120px] border-r relative p-1 transition-colors
                          ${isBusiness ? 'bg-white hover:bg-blue-50/50 cursor-pointer' : 'bg-slate-100/80 cursor-not-allowed'}
                        `}
                        onClick={() => {
                          if (isBusiness) {
                            setSelectedAddDate(date);
                            setSelectedAddTime(slot);
                            setIsAddDialogOpen(true);
                          }
                        }}
                        style={{ height: "50px" }} // 固定高さを明示して絶対配置の基準にする
                      >
                        {!isBusiness && slotAppts.length === 0 && (
                          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIj48L3JlY3Q+CjxnIGZpbGw9IiNlN2U1ZTQiPgo8cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMiIgaGVpZ2h0PSIyIj48L3JlY3Q+CjxyZWN0IHg9IjIiIHk9IjIiIHdpZHRoPSIyIiBoZWlnaHQ9IjIiPjwvcmVjdD4KPC9nPgo8L3N2Zz4=')] opacity-50 pointer-events-none"></div>
                        )}

                        {/* 予約ブロックの描画 */}
                        {slotAppts.map((apt, index) => {
                          const cust = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
                          const name = cust?.name || "名前なし";
                          const isFirst = apt.is_first_visit;
                          
                          // 時間枠（ブロックの高さ）の計算
                          const startTime = new Date(apt.start_time);
                          const endTime = apt.end_time ? new Date(apt.end_time) : new Date(startTime.getTime() + 30 * 60000);
                          const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60000;
                          
                          // 30分 = 1スロット分 (height: 50px から上下のpadding分を考慮した高さ)
                          // ブロックが重なるのを防ぐために幅を調整し、複数ある場合はずらす
                          const slotCount = Math.max(1, Math.ceil(durationMinutes / 30));
                          // px計算: スロット数 * 50px - (上下の余白とボーダーを考慮して少し引く)
                          const heightPx = slotCount * 50 - 4; 
                          
                          // 同一スロットに複数予約が重なった場合の表示位置計算
                          const widthPercent = 100 / (slotAppts.length || 1);
                          const leftOffset = index * widthPercent;

                          return (
                            <div
                              key={apt.id}
                              onClick={(e) => {
                                e.stopPropagation(); // セルのクリックイベントを止める
                                setSelectedAppointment({
                                  ...apt,
                                  customers: Array.isArray(apt.customers) ? apt.customers[0] : apt.customers
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
                                marginTop: "2px"
                              }}
                            >
                              <div className="font-bold flex items-center justify-between">
                                <span className="truncate">{name}</span>
                                {isFirst && <span className="bg-amber-500 text-white text-[9px] px-1 rounded">初</span>}
                              </div>
                              <div className="text-[10px] opacity-80 mt-0.5 flex justify-between">
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
            {/* 時間軸の最後 */}
          </div>
        )}
      </Card>

      {/* Google Calendar Sync Card */}
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
            <Button variant="outline" size="sm" className="bg-white border-blue-200 hover:bg-blue-100 text-blue-700" onClick={() => {
              window.open('/api/calendar/sync', '_blank');
            }}>
              .icsをダウンロード
            </Button>
          </div>
        </div>
      </Card>

      {/* 編集ダイアログ */}
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
