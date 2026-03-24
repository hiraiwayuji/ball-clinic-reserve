"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parse, isValid } from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarIcon, ArrowLeft, CheckCircle2, LayoutGrid, ChevronRight, Phone, Info, MapPin, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { createReservation, getDailyAvailability } from "@/app/actions/reserve";
import { getClinicHolidays, type ClinicHoliday } from "@/app/actions/holidays";
import { useSearchParams } from "next/navigation";

import { getTimeSlots, isDateWithinAllowedRange, isTimeSlotWithinTwoHours } from "@/lib/time-slots";

function ReserveContent() {
  const searchParams = useSearchParams();
  const initialDateStr = searchParams.get("date");
  const initialTime = searchParams.get("time");
  
  const initialDate = initialDateStr ? (() => {
    const parsed = parse(initialDateStr, "yyyy-MM-dd", new Date());
    return isValid(parsed) ? parsed : undefined;
  })() : undefined;

  const [mounted, setMounted] = useState(false);
  const [date, setDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    setMounted(true);
    if (initialDate) {
      setDate(initialDate);
    }
  }, []);
  const [time, setTime] = useState<string>(initialTime || "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [visitType, setVisitType] = useState<string>("");
  const [bookedTimes, setBookedTimes] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isWaitingResult, setIsWaitingResult] = useState(false);
  const [reservationNumber, setReservationNumber] = useState<string>("");
  const [clinicHolidays, setClinicHolidays] = useState<ClinicHoliday[]>([]);

  useEffect(() => {
    getClinicHolidays().then(setClinicHolidays);

    const savedName = localStorage.getItem("ballClinic_savedName");
    const savedPhone = localStorage.getItem("ballClinic_savedPhone");
    if (savedName) setName(savedName);
    if (savedPhone) setPhone(savedPhone);
    if (savedName && savedPhone) setVisitType("return");
  }, []);

  useEffect(() => {
    if (date) {
      const fetchAvailability = async () => {
        const dateStr = format(date, "yyyy-MM-dd");
        const times = await getDailyAvailability(dateStr);
        setBookedTimes(times);
      };
      fetchAvailability();
    } else {
      setBookedTimes([]);
    }
  }, [date]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("reserve-form-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => {
          if (date) {
            const dateStr = format(date, "yyyy-MM-dd");
            getDailyAvailability(dateStr).then(setBookedTimes);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [date]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!date || !time) return;

    if (visitType === "new" && !phone) {
      alert("初診の場合は電話番号の入力が必須です。");
      return;
    }

    const availableSlots = getTimeSlots(date);
    if (!availableSlots.includes(time)) {
      alert("選択された時間は予約できません。");
      return;
    }

    setIsSubmitting(true);
    
    try {
      const formData = new FormData(e.currentTarget);
      formData.append("date", format(date, "yyyy-MM-dd"));
      formData.append("time", time);
      formData.append("visitType", visitType);
      formData.append("isWaitlistIntent", bookedTimes.includes(time).toString());
      formData.append("phone", phone || localStorage.getItem("ballClinic_savedPhone") || "");

      const result = await createReservation(formData);
      
      if (result.success) {
        localStorage.setItem("ballClinic_savedName", name);
        if (phone) localStorage.setItem("ballClinic_savedPhone", phone);

        setIsWaitingResult(result.isWaiting || false);
        setReservationNumber(result.reservationNumber || "");
        setIsSuccess(true);
      } else {
        alert(result.error || "エラーが発生しました");
      }
    } catch (error) {
      alert("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 flex flex-col items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white/10 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-2xl border border-white/20 text-center relative z-10 overflow-hidden">
          <div className="mb-8 relative inline-block">
            <div className="relative w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/40">
              <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-4 tracking-tight">
            {isWaitingResult ? "キャンセル待ち受付" : "予約完了"}
          </h1>
          <div className="h-1 w-20 bg-emerald-500 mx-auto mb-6 rounded-full" />
          <div className="bg-white/5 border border-white/10 p-6 rounded-3xl mb-8 text-left shadow-inner">
            <h3 className="font-bold text-white text-center mb-6 flex items-center justify-center gap-2">
              【重要】LINEで受付を完了
            </h3>
            <div className="text-center group">
              <div className="flex items-stretch justify-center gap-2">
                <div className="flex-1 bg-black/40 border border-white/10 px-6 py-4 rounded-2xl font-mono text-3xl font-black tracking-[0.2em] text-white shadow-xl">
                  {reservationNumber || "---"}
                </div>
                {reservationNumber && (
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(reservationNumber);
                      toast.success("コピーしました！");
                    }}
                    className="px-4 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl transition-all text-white"
                  >
                    <Copy className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
            <a 
              href="https://line.me/ti/p/%40shc8761q"
              target="_blank" 
              rel="noreferrer"
              className="mt-8 inline-flex w-full items-center justify-center bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-5 px-4 rounded-2xl transition-all shadow-xl shadow-[#06C755]/20"
            >
              LINEで受付を完了する
            </a>
          </div>
          <Link href="/" className="text-blue-300 hover:text-white transition-colors text-sm font-medium inline-flex items-center gap-1 group">
             <ArrowLeft className="w-4 h-4" />
             トップページへ戻る
          </Link>
        </div>
      </div>
    );
  }

  if (!date || !time) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/5 backdrop-blur-2xl p-10 rounded-[3rem] shadow-2xl border border-white/10 text-center relative z-10">
          <h1 className="text-3xl font-extrabold text-white mb-4 tracking-tight">予約日時を選択</h1>
          <Button className="w-full bg-blue-600 hover:bg-blue-500 h-16 text-lg font-bold rounded-2xl" asChild>
            <Link href="/reserve/calendar">カレンダーで空きを確認</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-200">
      <div className="relative max-w-4xl mx-auto py-12 px-4 md:px-8">
        <div className="flex flex-col items-center mb-12">
          <div className="relative w-48 h-20 mb-6 group">
            <Image 
              src="/images/logo-white.png" 
              alt="ボール接骨院 ロゴ" 
              fill 
              className="object-contain p-2"
            />
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white/5 backdrop-blur-xl rounded-[2.5rem] border border-white/10 p-8 md:p-10 shadow-2xl">
               <form onSubmit={handleSubmit} className="space-y-10">
                <section className="space-y-6">
                  <h2 className="text-xl font-bold text-white tracking-tight">ご希望の日時</h2>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-blue-100/60 font-bold text-xs uppercase">予約日</Label>
                      <Popover>
                        <PopoverTrigger className="w-full h-14 bg-white/5 border-white/10 rounded-2xl px-4 text-left text-white flex items-center gap-3">
                          <CalendarIcon className="w-5 h-5 text-blue-400" />
                          {date ? format(date, "yyyy年MM月dd日 (E)", { locale: ja }) : "日付を選択"}
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-slate-900 border-white/10 rounded-2xl overflow-hidden" align="start">
                          <Calendar
                            mode="single"
                            selected={date}
                            onSelect={setDate}
                            locale={ja}
                            className="bg-slate-900 text-white"
                            disabled={(date) => {
                              const dateStr = format(date, "yyyy-MM-dd");
                              const isHoliday = clinicHolidays.some(h => h.date === dateStr);
                              const day = date.getDay();
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              return isHoliday || date < today || day === 0 || day === 3 || !isDateWithinAllowedRange(date);
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-blue-100/60 font-bold text-xs uppercase">希望時間</Label>
                      <Select value={time} onValueChange={(val) => setTime(val || "")}>
                        <SelectTrigger className="w-full h-14 bg-white/5 border-white/10 rounded-2xl px-4 text-white">
                          <SelectValue placeholder="時間を選択" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-white/10 text-white">
                          {(date ? getTimeSlots(date) : []).map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </section>

                <section className="space-y-6">
                  <h2 className="text-xl font-bold text-white tracking-tight">お客様情報</h2>
                  <div className="space-y-2">
                    <Label className="text-blue-100/60 font-bold text-xs uppercase" htmlFor="name">お名前</Label>
                    <Input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} required className="h-14 bg-white/5 border-white/10 rounded-2xl text-white" />
                  </div>
                </section>

                <Button type="submit" className="w-full h-20 text-xl font-black rounded-3xl bg-blue-600 hover:bg-blue-500 text-white">
                  {isSubmitting ? "送信中..." : "予約を確定する"}
                </Button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
             <div className="bg-white/5 backdrop-blur-xl rounded-[2.5rem] border border-white/10 p-8 shadow-2xl space-y-8">
                <div>
                  <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    アクセス / 休診日
                  </h3>
                  <div className="space-y-3 text-sm text-blue-100/60">
                    <p className="flex justify-between border-b border-white/5 pb-2"><span>日曜日 / 祝日</span><span className="text-rose-400 font-bold">休診</span></p>
                    <p className="flex justify-between border-b border-white/5 pb-2"><span>水曜日</span><span className="text-rose-400 font-bold">休診</span></p>
                    <p className="flex justify-between"><span>ボール接骨院</span><span className="text-white">藍住町</span></p>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/5">
                  <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                    <Phone className="w-4 h-4 text-blue-400" />
                    お電話での予約
                  </h3>
                  <p className="text-2xl font-black text-white tracking-widest mb-1">088-635-5344</p>
                  <p className="text-[10px] text-blue-100/40 uppercase tracking-widest">お急ぎの方はお電話ください</p>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReservePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">読み込み中...</div>}>
      <ReserveContent />
    </Suspense>
  );
}