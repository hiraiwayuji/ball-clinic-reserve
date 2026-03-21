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

// 静的なTIME_SLOTSを削除

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

  // Load saved info from local storage
  useEffect(() => {
    getClinicHolidays().then(setClinicHolidays);

    const savedName = localStorage.getItem("ballClinic_savedName");
    const savedPhone = localStorage.getItem("ballClinic_savedPhone");
    if (savedName) setName(savedName);
    if (savedPhone) setPhone(savedPhone);
    if (savedName && savedPhone) setVisitType("return");
  }, []);

  // 日付が選択されたらその日の予約状況を取得
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

  // リアルタイム同期の設定 (Supabase Real-time)
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("reserve-form-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => {
          console.log("[REALTIME] Appointment change, updating dropdown...");
          if (date) {
            const dateStr = format(date, "yyyy-MM-dd");
            getDailyAvailability(dateStr).then(setBookedTimes);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clinic_holidays" },
        () => {
          console.log("[REALTIME] Holiday change, updating calendar...");
          getClinicHolidays().then(setClinicHolidays);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [date]);

  // 予約送信処理
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!date || !time) return;

    if (visitType === "new" && !phone) {
      alert("初診の場合は電話番号の入力が必須です。");
      return;
    }

    // 選択された日付の動的な時間枠を取得
    const availableSlots = getTimeSlots(date);
    if (!availableSlots.includes(time)) {
      alert("選択された時間は予約できません。");
      return;
    }

    setIsSubmitting(true);
    
    try {
      const formData = new FormData(e.currentTarget);
      // 日付は yyyy-MM-dd 形式で追加
      formData.append("date", format(date, "yyyy-MM-dd"));
      formData.append("time", time);
      formData.append("visitType", visitType);
      formData.append("isWaitlistIntent", bookedTimes.includes(time).toString());
      
      // If phone is missing but visitType is return, use local storage fallback or just empty
      formData.append("phone", phone || localStorage.getItem("ballClinic_savedPhone") || "");

      const result = await createReservation(formData);
      
      if (result.success) {
        // Save to local storage for future visits
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
        {/* 装飾用のアニメーション背景要素 */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px] animate-pulse-slow" />
        </div>

        <div className="max-w-lg w-full bg-white/10 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-2xl border border-white/20 text-center relative z-10 overflow-hidden">
          {/* 成功バッジ */}
          <div className="mb-8 relative inline-block">
            <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-ping" />
            <div className="relative w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/40">
              <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-4 tracking-tight">
            {isWaitingResult ? "キャンセル待ち受付" : "予約完了"}
          </h1>
          
          <div className="h-1 w-20 bg-emerald-500 mx-auto mb-6 rounded-full" />

          <p className="text-blue-100/80 mb-8 leading-relaxed text-lg">
            {isWaitingResult ? (
              <>キャンセル待ちとして登録しました。<br /><span className="text-white font-medium">空きが出次第、当院よりご連絡いたします。</span></>
            ) : (
              <>当日のご来院を心よりお待ちしております。<br /><span className="text-white font-medium">最後に、LINE連携のお願いです。</span></>
            )}
          </p>
          
          {/* LINE連携カード */}
          <div className="bg-white/5 border border-white/10 p-6 rounded-3xl mb-8 text-left shadow-inner">
            <h3 className="font-bold text-white text-center mb-6 flex items-center justify-center gap-2">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              【重要】LINEで受付を完了
            </h3>
            
            <div className="space-y-4 mb-8">
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 font-bold text-blue-300 border border-white/20">1</div>
                <p className="text-sm text-blue-100/90 pt-1">
                  下の番号を<strong className="text-emerald-400">「コピー」</strong>してください。
                </p>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 font-bold text-blue-300 border border-white/20">2</div>
                <p className="text-sm text-blue-100/90 pt-1">
                  <strong className="text-emerald-400">「LINEを開く」</strong>を押し、番号を貼り付けて送信！
                </p>
              </div>
            </div>

            <div className="text-center group">
              <p className="text-[10px] text-blue-300/60 font-semibold tracking-widest uppercase mb-2">Your Reservation Code</p>
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
                    className="px-4 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl transition-all text-white active:scale-95"
                    title="コピー"
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
              className="mt-8 inline-flex w-full items-center justify-center bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-5 px-4 rounded-2xl transition-all shadow-xl shadow-[#06C755]/20 hover:-translate-y-1 active:scale-[0.98]"
            >
              <svg className="w-6 h-6 mr-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 4.269 8.846 10.036 9.608.391.084.922.258 1.057.592.121.298.079.756.038 1.08l-.164 1.02c-.052.306-.244 1.206 1.089.645 1.334-.562 7.185-4.228 9.431-7.141 1.636-2.125 2.513-4.101 2.513-5.804z"></path>
              </svg>
              LINEで受付を完了する
            </a>
          </div>

          <Link href="/" className="text-blue-300 hover:text-white transition-colors text-sm font-medium inline-flex items-center gap-1 group">
             <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
             トップページへ戻る
          </Link>
        </div>
      </div>
    );
  }

  // カレンダー経由でない（日時が未指定）の場合は入力を制限する
  if (!date || !time) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-4 overflow-hidden relative">
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-20" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-[128px]" />
        
        <div className="max-w-md w-full bg-white/5 backdrop-blur-2xl p-10 rounded-[3rem] shadow-2xl border border-white/10 text-center relative z-10">
          <div className="w-24 h-24 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-8 border border-blue-500/20">
            <CalendarIcon className="w-12 h-12 text-blue-400 opacity-60" />
          </div>
          <h1 className="text-3xl font-extrabold text-white mb-4 tracking-tight">予約日時を選択</h1>
          <p className="text-blue-100/60 mb-10 leading-relaxed">
            最新の空き状況を確認するため、<br />カレンダーから希望の日時をお選びください。
          </p>
          
          <Button className="w-full bg-blue-600 hover:bg-blue-500 h-16 text-lg font-bold shadow-xl shadow-blue-600/20 group rounded-2xl transition-all" asChild>
            <Link href="/reserve/calendar">
              <LayoutGrid className="w-5 h-5 mr-3 group-hover:rotate-90 transition-transform duration-500" />
              カレンダーで空きを確認
            </Link>
          </Button>

          <Link href="/" className="inline-block mt-8 text-slate-500 hover:text-white transition-colors text-sm font-medium">
            トップページに戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-200 selection:bg-blue-500/30">
      {/* 背景装飾 */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[50%] h-[50%] bg-blue-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[50%] h-[50%] bg-emerald-600/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative max-w-4xl mx-auto py-12 px-4 md:px-8">
        {/* ヘッダー / ロゴエリア */}
        <div className="flex flex-col items-center mb-12">
          <div className="relative w-48 h-20 mb-6 group">
            {/* ロゴプレースホルダー：ユーザーに配置を促す */}
            <div className="absolute inset-0 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 group-hover:border-blue-500/50 transition-colors">
              <Image 
                src="/images/logo-white.png" 
                alt="ボール接骨院 ロゴ" 
                fill 
                className="object-contain p-2"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-xs font-bold uppercase tracking-widest">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Official Reservation System
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* メインフォーム */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white/5 backdrop-blur-xl rounded-[2.5rem] border border-white/10 p-8 md:p-10 shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full blur-3xl -mr-16 -mt-16" />
               
               <header className="mb-10 relative">
                  <h1 className="text-3xl font-black text-white mb-2 tracking-tight">Web予約フォーム</h1>
                  <p className="text-blue-100/50 text-sm">必要事項を入力し、最下部のボタンで確定してください。</p>
               </header>

               <form onSubmit={handleSubmit} className="space-y-10">
                {/* 1. 日時セクション */}
                <section className="space-y-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
                      <span className="text-white font-black text-sm">1</span>
                    </div>
                    <h2 className="text-xl font-bold text-white tracking-tight">ご希望の日時</h2>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-blue-100/60 font-bold text-xs uppercase tracking-tighter">予約日</Label>
                      <Popover>
                        <PopoverTrigger className="w-full h-14 bg-white/5 border-white/10 hover:bg-white/10 hover:border-blue-500/50 transition-all rounded-2xl px-4 text-left font-medium text-white flex items-center gap-3">
                          <CalendarIcon className="w-5 h-5 text-blue-400" />
                          {date ? format(date, "yyyy年MM月dd日 (E)", { locale: ja }) : "日付を選択"}
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-slate-900 border-white/10 shadow-2xl rounded-2xl overflow-hidden" align="start">
                          <Calendar
                            mode="single"
                            selected={date}
                            onSelect={setDate}
                            initialFocus
                            locale={ja}
                            className="bg-slate-900 text-white rounded-2xl"
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
                      <Label className="text-blue-100/60 font-bold text-xs uppercase tracking-tighter">希望時間</Label>
                      <Select value={time} onValueChange={(val) => setTime(val || "")}>
                        <SelectTrigger className="w-full h-14 bg-white/5 border-white/10 hover:bg-white/10 hover:border-blue-500/50 transition-all rounded-2xl px-4 text-white">
                          <SelectValue placeholder="時間を選択" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-white/10 text-white rounded-xl shadow-2xl">
                          {(date ? getTimeSlots(date) : []).map((t) => {
                            const isFull = bookedTimes.includes(t);
                            const isTooClose = isTimeSlotWithinTwoHours(date!, t);
                            
                            if (isTooClose) {
                              return <SelectItem key={t} value={t} disabled className="text-slate-600">{t} (要電話)</SelectItem>;
                            }

                            return (
                              <SelectItem key={t} value={t} className={isFull ? "text-amber-400 font-bold bg-amber-400/10" : "text-emerald-400 font-medium"}>
                                <span className="flex items-center gap-2">
                                  {t} <span className="text-[10px] opacity-60">{isFull ? "【キャンセル待ち】" : "【空きあり】"}</span>
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <input type="hidden" name="time" value={time} />
                    </div>
                  </div>
                </section>

                {/* 2. お客様情報セクション */}
                <section className="space-y-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/20">
                      <span className="text-white font-black text-sm">2</span>
                    </div>
                    <h2 className="text-xl font-bold text-white tracking-tight">お客様情報</h2>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-blue-100/60 font-bold text-xs uppercase tracking-tighter">受診について</Label>
                      <Select value={visitType} onValueChange={(val) => setVisitType(val || "")}>
                        <SelectTrigger className="w-full h-14 bg-white/5 border-white/10 hover:bg-white/10 rounded-2xl px-4 text-white">
                          <SelectValue placeholder="選択してください" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-white/10 text-white rounded-xl">
                          <SelectItem value="new">初めての受診（初診）</SelectItem>
                          <SelectItem value="return">2回目以降（再診）</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-blue-100/60 font-bold text-xs uppercase tracking-tighter" htmlFor="name">お名前</Label>
                      <Input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="山田 太郎" 
                             className="h-14 bg-white/5 border-white/10 rounded-2xl focus:border-blue-500/50 text-white placeholder:text-white/20" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-blue-100/60 font-bold text-xs uppercase tracking-tighter" htmlFor="phone">お電話番号</Label>
                    <Input id="phone" name="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required={visitType !== "return"} 
                           placeholder="090-1234-5678" disabled={visitType === "return" && !!localStorage.getItem("ballClinic_savedPhone")}
                           className="h-14 bg-white/5 border-white/10 rounded-2xl focus:border-blue-500/50 text-white placeholder:text-white/20" />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-blue-100/60 font-bold text-xs uppercase tracking-tighter" htmlFor="symptoms">お悩みの症状・目的</Label>
                    <textarea id="symptoms" name="symptoms" placeholder="腰の痛み、怪我の相談、パフォーマンス向上など..."
                              className="w-full min-h-[120px] bg-white/5 border border-white/10 rounded-2xl p-4 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-white placeholder:text-white/20 transition-all resize-none shadow-inner" />
                  </div>
                </section>

                <div className="pt-4">
                  {time && bookedTimes.includes(time) && (
                    <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 p-5 rounded-2xl text-sm mb-6 flex gap-3 items-start animate-in fade-in slide-in-from-bottom-2 duration-500">
                      <Info className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">キャンセル待ち登録となります</p>
                        <p className="opacity-80">ご希望の時間は埋まっているため、キャンセルが出た場合のみ当院よりLINEにてご連絡いたします。</p>
                      </div>
                    </div>
                  )}

                  <Button 
                    type="submit" 
                    disabled={!date || !time || isSubmitting}
                    className={cn(
                      "w-full h-20 text-xl font-black rounded-3xl shadow-2xl transition-all duration-300 hover:-translate-y-1 active:scale-[0.98] uppercase tracking-tighter",
                      time && bookedTimes.includes(time) 
                        ? "bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20" 
                        : "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/30"
                    )}
                  >
                    {isSubmitting ? <span className="flex items-center gap-2"><Loader2 className="animate-spin" /> 送信中...</span> : 
                     (date && time) ? (bookedTimes.includes(time) ? "キャンセル待ちで登録" : "予約を確定する") : "希望日時を選択してください"}
                  </Button>
                </div>
              </form>
            </div>
          </div>

          {/* サイド情報 */}
          <div className="lg:col-span-4 space-y-6">
             <div className="bg-white/5 backdrop-blur-xl rounded-[2.5rem] border border-white/10 p-8 shadow-2xl space-y-8">
                <div>
                  <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    アクセス / 休診日
                  </h3>
                  <div className="space-y-3 text-sm text-blue-100/60">
                    <p className="flex justify-between border-b border-white/5 pb-2">
                       <span>日曜日 / 祝日</span>
                       <span className="text-rose-400 font-bold">休診</span>
                    </p>
                    <p className="flex justify-between border-b border-white/5 pb-2">
                       <span>水曜日</span>
                       <span className="text-rose-400 font-bold">休診</span>
                    </p>
                    <p className="flex justify-between border-b border-white/5 pb-2">
                       <span>月・火・木・金</span>
                       <span className="text-white font-medium">9:00 - 20:00</span>
                    </p>
                    <p className="flex justify-between">
                       <span>土曜日</span>
                       <span className="text-white font-medium">9:00 - 18:00</span>
                    </p>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/5">
                  <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                    <Phone className="w-4 h-4 text-blue-400" />
                    お電話での予約
                  </h3>
                  <p className="text-2xl font-black text-white tracking-widest mb-1">059-331-1554</p>
                  <p className="text-[10px] text-blue-100/40 uppercase tracking-widest">お急ぎの方、当日予約の方はお電話ください</p>
                </div>
             </div>

             <Link href="/reserve/calendar" className="group">
                <div className="bg-violet-600 hover:bg-violet-500 transition-all p-8 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden">
                   <LayoutGrid className="absolute right-[-10%] bottom-[-10%] w-32 h-32 opacity-10 group-hover:scale-125 transition-transform duration-700" />
                   <h3 className="text-xl font-black mb-2 flex items-center gap-3">
                     <LayoutGrid className="w-5 h-5" />
                     カレンダー表示
                   </h3>
                   <p className="text-violet-100 opacity-80 text-sm leading-relaxed">
                     月全体の空き状況を一目で確認したい方はこちら。
                   </p>
                   <div className="mt-6 flex items-center gap-1 font-bold text-sm">
                      VIEW CALENDAR
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                   </div>
                </div>
             </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReservePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center"><p className="text-slate-400">読み込み中...</p></div>}>
      <ReserveContent />
    </Suspense>
  );
}
