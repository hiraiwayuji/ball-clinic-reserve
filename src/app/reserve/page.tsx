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
import { CalendarIcon, ArrowLeft, CheckCircle2, LayoutGrid, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
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
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm text-center mb-6 border-t-8 border-t-green-500">
          <CheckCircle2 className={`w-16 h-16 mx-auto mb-6 ${isWaitingResult ? 'text-amber-500' : 'text-green-500'}`} />
          <h1 className="text-2xl font-bold mb-4">
            {isWaitingResult ? "キャンセル待ちを受け付けました" : "ご予約が完了しました！"}
          </h1>
          <p className="text-slate-600 mb-6">
            {isWaitingResult ? (
              <>ご希望の時間はすでに埋まっているため、キャンセル待ちとして登録いたしました。<br />空きが出次第、当院よりご連絡いたします。</>
            ) : (
              <>当日のご来院を心よりお待ちしております。<br />最後に、<strong>予約内容の確認と問診</strong>のため以下の手順へお進みください。</>
            )}
          </p>
          
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-8 max-w-sm mx-auto shadow-inner text-left">
            <h3 className="font-bold text-slate-800 text-center mb-4">【重要】LINEでの連携をお願いします</h3>
            <ol className="text-sm space-y-3 text-slate-700">
              <li className="flex gap-2">
                <span className="font-bold text-blue-600">1.</span>
                <span>下のボタンを押して、<strong>予約番号をコピー</strong>してください。</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-blue-600">2.</span>
                <span>「LINEを開く」ボタンを押して、コピーした予約番号を<strong>LINEのメッセージ画面に貼り付けて送信</strong>してください！</span>
              </li>
            </ol>
            <div className="mt-5 text-center">
              <span className="text-xs text-slate-500 block mb-1">あなたの予約番号</span>
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-2xl font-mono font-bold tracking-widest text-slate-800 bg-white border border-slate-300 px-4 py-2 rounded-lg inline-block shadow-sm">
                  {reservationNumber || "受付処理中..."}
                </span>
                {reservationNumber && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      navigator.clipboard.writeText(reservationNumber);
                      alert("予約番号をコピーしました！LINEに貼り付けて送信してください。");
                    }}
                    className="h-12 border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                  >
                    コピー
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-6 text-center">
              <a 
                href="https://line.me/ti/p/%40shc8761q"
                target="_blank" 
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-3 px-4 rounded-xl transition shadow-md"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 4.269 8.846 10.036 9.608.391.084.922.258 1.057.592.121.298.079.756.038 1.08l-.164 1.02c-.052.306-.244 1.206 1.089.645 1.334-.562 7.185-4.228 9.431-7.141 1.636-2.125 2.513-4.101 2.513-5.804z"></path>
                </svg>
                LINEを開く
              </a>
            </div>
          </div>

          <Button variant="outline" className="w-full text-slate-500" asChild>
            <Link href="/">サイトトップに戻る</Link>
          </Button>
        </div>
      </div>
    );
  }

  // カレンダー経由でない（日時が未指定）の場合は入力を制限する
  if (!date || !time) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm text-center mb-6 border-t-8 border-t-blue-500">
          <CalendarIcon className="w-16 h-16 mx-auto mb-6 text-blue-500 opacity-20" />
          <h1 className="text-2xl font-bold mb-4">予約の日時を選んでください</h1>
          <p className="text-slate-600 mb-8 leading-relaxed">
            正確な予約状況を確認するため、まずはカレンダーから空き状況を確認してください。
          </p>
          
          <Button className="w-full bg-blue-600 hover:bg-blue-700 h-14 text-lg font-bold shadow-lg shadow-blue-200 group" asChild>
            <Link href="/reserve/calendar">
              <LayoutGrid className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
              空き状況カレンダーを見る
            </Link>
          </Button>

          <Button variant="ghost" className="w-full mt-4 text-slate-400" asChild>
            <Link href="/">トップページに戻る</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="inline-flex items-center text-sm text-slate-500 hover:text-blue-600 mb-8 transition">
          <ArrowLeft className="w-4 h-4 mr-1" />
          トップページに戻る
        </Link>
        
        <div className="bg-white rounded-2xl shadow-sm p-6 md:p-8">
        {/* カレンダーで空き状況を確認するバナー */}
          <Link
            href="/reserve/calendar"
            className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200 hover:bg-blue-100 transition mb-8 group"
          >
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-700 transition">
              <LayoutGrid className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-blue-900 text-sm">空き状況カレンダーで確認する</p>
              <p className="text-blue-600 text-xs mt-0.5">月単位で空き状況を一覧表示。希望の日を選んでそのまま予約できます。</p>
            </div>
            <ChevronRight className="w-4 h-4 text-blue-400 group-hover:text-blue-600 transition flex-shrink-0" />
          </Link>

          <h1 className="text-2xl font-bold mb-2">Web予約フォーム</h1>
            <p className="text-slate-500 text-sm mb-8">
              以下のフォームに必要事項をご入力のうえ、「予約を確定する」ボタンを押してください。<br/>
              <span className="text-red-500 font-medium">※水・日・祝日は休診日となります。</span><br/>
              <span className="text-blue-600 font-medium font-bold">※予約は1ヶ月後まで可能です。</span>
            </p>

          <form onSubmit={handleSubmit} className="space-y-8">
            
            {/* 日時選択セクション */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold border-b pb-2">1. ご希望の日時</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>予約日 <span className="text-red-500">*</span></Label>
                  <Popover>
                    <PopoverTrigger className="w-full justify-start text-left font-normal inline-flex items-center justify-center rounded-md border border-slate-200 bg-white h-10 px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50">
                      <span className="flex items-center w-full">
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                        {date ? format(date, "yyyy年MM月dd日 (E)", { locale: ja }) : <span className="text-slate-500">日付を選択</span>}
                      </span>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        initialFocus
                        locale={ja}
                        disabled={(date) => {
                          // 過去の日付と休診日（カスタム・水・日）、および1ヶ月以上先を選択不可にする
                          const dateStr = format(date, "yyyy-MM-dd");
                          const isHoliday = clinicHolidays.some(h => h.date === dateStr);
                          const day = date.getDay();
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          
                          return isHoliday || 
                                 date < today || 
                                 day === 0 || 
                                 day === 3 || 
                                 !isDateWithinAllowedRange(date);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div className="space-y-2">
                  <Label>希望時間 <span className="text-red-500">*</span></Label>
                  <Select value={time} onValueChange={(val) => setTime(val || "")}>
                    <SelectTrigger className="w-full h-10 border-slate-200">
                      <SelectValue placeholder="時間を選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {(date ? getTimeSlots(date) : []).map((t) => {
                        const isFull = bookedTimes.includes(t);
                        const isTooClose = isTimeSlotWithinTwoHours(date!, t);
                        
                        if (isTooClose) {
                          return (
                            <SelectItem key={t} value={t} disabled className="text-slate-400">
                              {t} (電話問い合わせ)
                            </SelectItem>
                          );
                        }

                        return (
                          <SelectItem key={t} value={t} className={isFull ? "text-rose-600 font-medium bg-rose-50" : "text-emerald-700"}>
                            {t} {isFull ? "予約済" : "空き"}
                          </SelectItem>
                        );
                      })}
                      {!date && <SelectItem value="none" disabled>日付を選択してください</SelectItem>}
                    </SelectContent>
                  </Select>
                  <input type="hidden" name="time" value={time} />
                </div>
              </div>
            </div>

            {/* 患者情報セクション */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold border-b pb-2">2. お客様情報</h2>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>受診について <span className="text-red-500">*</span></Label>
                  <Select value={visitType} onValueChange={(val) => setVisitType(val || "")}>
                    <SelectTrigger className="w-full h-10 border-slate-200">
                      <SelectValue placeholder="選択してください" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">初めての受診（初診）</SelectItem>
                      <SelectItem value="return">2回目以降（再診）</SelectItem>
                    </SelectContent>
                  </Select>
                  <input type="hidden" name="visitType" value={visitType} />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="name">お名前 <span className="text-red-500">*</span></Label>
                  <Input 
                    id="name" 
                    name="name" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required 
                    placeholder="例: 山田 太郎" 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">お電話番号 {visitType !== "return" && <span className="text-red-500">*</span>}</Label>
                  <Input 
                    id="phone" 
                    name="phone" 
                    type="tel" 
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required={visitType !== "return"} 
                    placeholder={visitType === "return" ? "2回目以降は省略可能です" : "例: 090-1234-5678"} 
                    disabled={visitType === "return" && !!localStorage.getItem("ballClinic_savedPhone")}
                  />
                  {visitType === "return" && !!localStorage.getItem("ballClinic_savedPhone") && (
                    <p className="text-xs text-slate-500">※過去にご登録済みの番号を使用します</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="symptoms">お悩みの症状・目的</Label>
                  <textarea
                    id="symptoms"
                    name="symptoms"
                    placeholder="例: 腰が痛い、スポーツのパフォーマンスを上げたい等、気になることをご記入ください。"
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            {time && bookedTimes.includes(time) && (
              <div className="bg-amber-50 text-amber-800 p-4 rounded-md text-sm mb-4 border border-amber-200">
                ※選択された日時はすでに予約が埋まっています。このまま送信すると<strong>キャンセル待ち</strong>として登録され、空きが出た場合のみご連絡いたします。
              </div>
            )}

            <Button 
              type="submit" 
              className={`w-full text-lg py-6 shadow-md transition-all active:scale-[0.99] font-bold tracking-wide ${
                time && bookedTimes.includes(time) 
                  ? "bg-amber-500 hover:bg-amber-600 text-white" 
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
              disabled={!date || !time || isSubmitting}
            >
              {isSubmitting 
                ? "送信中..." 
                : (date && time) 
                  ? bookedTimes.includes(time)
                    ? `${format(date, "M月d日")} ${time} にキャンセル待ちで登録`
                    : `${format(date, "M月d日")} ${time} の予約を希望する`
                  : "希望日時を選択してください"}
            </Button>
          </form>
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
