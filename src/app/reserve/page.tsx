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
import { CalendarIcon, ArrowLeft, CheckCircle2, Phone, MapPin, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { createReservation, getDailyAvailability } from "@/app/actions/reserve";
import { getClinicHolidays, type ClinicHoliday } from "@/app/actions/holidays";
import { useSearchParams } from "next/navigation";
import { getTimeSlots, isDateWithinAllowedRange } from "@/lib/time-slots";

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
    if (initialDate) setDate(initialDate);
  }, []);

  const [time, setTime] = useState<string>(initialTime || "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [visitType, setVisitType] = useState<string>("");
  const [lineRegistered, setLineRegistered] = useState(false);
  const [bookedTimes, setBookedTimes] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isWaitingResult, setIsWaitingResult] = useState(false);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        if (date) {
          const dateStr = format(date, "yyyy-MM-dd");
          getDailyAvailability(dateStr).then(setBookedTimes);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [date]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!date || !time) return;

    if (visitType === "new" && !phone) {
      alert("初診の場合は電話番号の入力が必要です。");
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
        setIsSuccess(true);
      } else {
        alert(result.error || "エラーが発生しました");
      }
    } catch (error) {
      alert("送信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 flex flex-col items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white/10 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-2xl border border-white/20 text-center">
          <div className="mb-6 flex flex-col items-center gap-4">
            <div className="relative w-40 h-16">
              <Image src="/images/logo-white.png" alt="ボール接骨院" fill className="object-contain" />
            </div>
            <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/40">
              <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-extrabold text-white mb-2">
            {isWaitingResult ? "キャンセル待ち受付完了" : "仮予約を受け付けました"}
          </h1>
          <p className="text-blue-200 text-sm mb-6">院長がLINEにて内容を確認後、予約確定のご連絡をいたします。</p>
          <div className="h-1 w-20 bg-emerald-500 mx-auto mb-6 rounded-full" />
          <div className="bg-white/5 border border-white/10 p-6 rounded-3xl mb-6 text-left space-y-3">
            <p className="text-white font-bold text-center mb-4 flex items-center justify-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-400" />
              LINEで予約を完了する
            </p>
            <p className="text-blue-100/70 text-sm text-center">以下のボタンからボール接骨院のLINEを友だち追加して、予約内容をお伝えください。</p>
            
              href="https://line.me/ti/p/%40shc8761q"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex w-full items-center justify-center bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-5 px-4 rounded-2xl transition-all shadow-xl shadow-[#06C755]/20 gap-2"
            >
              <MessageCircle className="w-5 h-5" />
              LINEで予約を確定する
            </a>
          </div>
          <Link href="/" className="text-blue-300 hover:text-white transition-colors text-sm font-medium inline-flex items-center gap-1">
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
        <div className="max-w-md w-full bg-white/5 backdrop-blur-2xl p-10 rounded-[3rem] shadow-2xl border border-white/10 text-center">
          <div className="relative w-48 h-20 mx-auto mb-8">
            <Image src="/images/logo-white.png" alt="ボール接骨院" fill className="object-contain" />
          </div>
          <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">予約日時を選ぶ</h1>
          <p className="text-blue-200/60 text-sm mb-6">カレンダーから空きをご確認ください</p>
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
          <div className="relative w-56 h-24 mb-4">
            <Image src="/images/logo-white.png" alt="ボール接骨院 ロゴ" fill className="object-contain" />
          </div>
          <p className="text-blue-200/50 text-xs tracking-widest uppercase">Body ALL care.</p>
        </div>

        <div className="grid lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white/5 backdrop-blur-xl rounded-[2.5rem] border border-white/10 p-8 md:p-10 shadow-2xl">
              <form onSubmit={handleSubmit} className="space-y-10">

                {/* 予約日時 */}
                <section className="space-y-6">
                  <h2 className="text-xl font-bold text-white tracking-tight">ご希望の日時</h2>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-blue-100/60 font-bold text-xs uppercase">予約日</Label>
                      <Popover>
                        <PopoverTrigger className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-4 text-left text-white flex items-center gap-3">
                          <CalendarIcon className="w-5 h-5 text-blue-400" />
                          {date ? format(date, "yyyy年MM月d日 (E)", { locale: ja }) : "日付を選択"}
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
                      <Label className="text-blue-100/60 font-bold text-xs uppercase">来院時間</Label>
                      <Select value={time} onValueChange={(val) => setTime(val || "")}>
                        <SelectTrigger className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-4 text-white">
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

                {/* お客様情報 */}
                <section className="space-y-6">
                  <h2 className="text-xl font-bold text-white tracking-tight">お客様情報</h2>

                  {/* 初診・再診 */}
                  <div className="space-y-2">
                    <Label className="text-blue-100/60 font-bold text-xs uppercase">来院区分</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setVisitType("new")}
                        className={`h-14 rounded-2xl font-bold text-sm transition-all border ${visitType === "new" ? "bg-blue-600 border-blue-500 text-white" : "bg-white/5 border-white/10 text-blue-100/60 hover:bg-white/10"}`}
                      >
                        🆕 初診（初めて）
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisitType("return")}
                        className={`h-14 rounded-2xl font-bold text-sm transition-all border ${visitType === "return" ? "bg-blue-600 border-blue-500 text-white" : "bg-white/5 border-white/10 text-blue-100/60 hover:bg-white/10"}`}
                      >
                        🔄 再診（2回目以降）
                      </button>
                    </div>
                  </div>

                  {/* お名前 */}
                  <div className="space-y-2">
                    <Label className="text-blue-100/60 font-bold text-xs uppercase" htmlFor="name">お名前</Label>
                    <Input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="山田 太郎" className="h-14 bg-white/5 border-white/10 rounded-2xl text-white placeholder:text-white/20" />
                  </div>

                  {/* 初診のみ：電話番号・LINE */}
                  {visitType === "new" && (
                    <div className="space-y-4 p-6 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                      <p className="text-blue-300 text-sm font-bold">📋 初診の方は以下もご入力ください</p>
                      <div className="space-y-2">
                        <Label className="text-blue-100/60 font-bold text-xs uppercase" htmlFor="phone">電話番号</Label>
                        <Input
                          id="phone"
                          name="phone"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          required
                          placeholder="090-0000-0000"
                          className="h-14 bg-white/5 border-white/10 rounded-2xl text-white placeholder:text-white/20"
                        />
                      </div>
                      <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                        <input
                          type="checkbox"
                          id="lineRegistered"
                          checked={lineRegistered}
                          onChange={(e) => setLineRegistered(e.target.checked)}
                          className="w-5 h-5 accent-green-500"
                        />
                        <label htmlFor="lineRegistered" className="text-sm text-green-200 cursor-pointer">
                          ボール接骨院のLINE公式アカウントを友だち追加済み
                        </label>
                      </div>
                      {!lineRegistered && (
                        
                          href="https://line.me/ti/p/%40shc8761q"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex w-full items-center justify-center bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-3 px-4 rounded-xl transition-all gap-2 text-sm"
                        >
                          <MessageCircle className="w-4 h-4" />
                          LINEを友だち追加する
                        </a>
                      )}
                    </div>
                  )}
                </section>

                <div className="bg-white/5 border border-white/10 p-5 rounded-2xl text-sm text-blue-100/60 space-y-1">
                  <p className="font-bold text-white text-sm">⚠️ 仮予約について</p>
                  <p>こちらは仮予約です。院長がLINEにて確認後、予約確定のご連絡をいたします。</p>
                </div>

                <Button type="submit" disabled={!visitType || isSubmitting} className="w-full h-20 text-xl font-black rounded-3xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40">
                  {isSubmitting ? "送信中..." : "仮予約を申し込む"}
                </Button>
              </form>
            </div>
          </div>

          {/* サイドバー */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white/5 backdrop-blur-xl rounded-[2.5rem] border border-white/10 p-8 shadow-2xl space-y-8">
              <div className="relative w-full h-16">
                <Image src="/images/logo-white.png" alt="ボール接骨院" fill className="object-contain" />
              </div>
              <div>
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-400" />
                  アクセス / 営業日
                </h3>
                <div className="space-y-3 text-sm text-blue-100/60">
                  <p className="flex justify-between border-b border-white/5 pb-2"><span>日曜日 / 水曜日</span><span className="text-rose-400 font-bold">休診</span></p>
                  <p className="flex justify-between border-b border-white/5 pb-2"><span>祝日</span><span className="text-rose-400 font-bold">休診</span></p>
                  <p className="flex justify-between"><span>ボール接骨院</span><span className="text-white">板野郡藍住町</span></p>
                </div>
              </div>
              <div className="pt-6 border-t border-white/5">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-blue-400" />
                  お電話でのご予約
                </h3>
                <p className="text-2xl font-black text-white tracking-widest mb-1">088-635-5344</p>
                <p className="text-[10px] text-blue-100/40 uppercase tracking-widest">お気軽にお電話ください</p>
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
