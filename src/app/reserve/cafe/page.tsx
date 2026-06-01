"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarIcon, ArrowLeft, CheckCircle2, MessageCircle, Users, Coffee, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getClinicHolidays, type ClinicHoliday } from "@/app/actions/holidays";
import { isDateWithinAllowedRange } from "@/lib/time-slots";
import { isCafeOpenOn } from "@/lib/cafe-slots";
import {
  getCafeConfig,
  getCafeAvailability,
  createCafeReservation,
  type CafeConfig,
  type CafeSeatType,
  type CafeSlotAvailability,
} from "@/app/actions/cafe";

const LINE_URL = process.env.NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL ?? "https://line.me/R/ti/p/%40aip5428p";
const MAX_PARTY_BUTTONS = 9;

type Step = "party" | "seat" | "datetime" | "info" | "confirm";

/** 席種が指定人数・子連れ条件を満たすか（サーバーと同じ規則のクライアント版） */
function seatAllowed(seat: CafeSeatType, party: number, hasChildren: boolean): boolean {
  if (seat.max_party_size != null && party > seat.max_party_size) return false;
  if (seat.min_party_size != null && party < seat.min_party_size) {
    if (!(seat.allow_children_exception && hasChildren)) return false;
  }
  return true;
}

function CafeReserveContent() {
  const [config, setConfig] = useState<CafeConfig | null>(null);
  const [holidays, setHolidays] = useState<ClinicHoliday[]>([]);
  const [step, setStep] = useState<Step>("party");

  const [party, setParty] = useState<number>(0);
  const [hasChildren, setHasChildren] = useState(false);
  const [seatId, setSeatId] = useState<string>("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState<string>("");
  const [availability, setAvailability] = useState<CafeSlotAvailability[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [visitType, setVisitType] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [symptoms, setSymptoms] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [requiresQuestionnaire, setRequiresQuestionnaire] = useState(false);

  useEffect(() => {
    getCafeConfig().then(setConfig);
    getClinicHolidays().then(setHolidays);
    try {
      const savedName = localStorage.getItem("ballClinic_savedName");
      const savedPhone = localStorage.getItem("ballClinic_savedPhone");
      if (savedName) setName(savedName);
      if (savedPhone) setPhone(savedPhone);
      if (savedName && savedPhone) setVisitType("return");
    } catch {}
  }, []);

  // 日付選択時に空き状況を取得
  useEffect(() => {
    if (!date) {
      setAvailability(null);
      return;
    }
    setLoadingSlots(true);
    setTime("");
    const dateStr = format(date, "yyyy-MM-dd");
    getCafeAvailability(dateStr)
      .then(setAvailability)
      .finally(() => setLoadingSlots(false));
  }, [date]);

  const seatTypes = config?.seatTypes ?? [];
  const seat = seatTypes.find((s) => s.id === seatId) ?? null;
  const hours = config?.hours ?? null;

  // 選択中の席種・人数で予約可能なスロットだけに絞る
  const openSlots = (availability ?? []).filter((slot) => {
    if (!seat) return false;
    const remain = slot.seatRemaining[seat.id] ?? 0;
    if (remain <= 0) return false;
    if (slot.totalRemaining != null && slot.totalRemaining < party) return false;
    return true;
  });
  const lunchSlots = openSlots.filter((s) => s.band === "lunch");
  const dinnerSlots = openSlots.filter((s) => s.band === "dinner");

  async function handleSubmit() {
    if (!date || !time || !seat || !party) return;
    if (!name.trim()) {
      toast.error("お名前を入力してください");
      return;
    }
    if (visitType === "new" && !phone.trim()) {
      toast.error("初めての方は電話番号の入力が必要です");
      return;
    }
    setRequiresQuestionnaire(false);
    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("date", format(date, "yyyy-MM-dd"));
      fd.append("time", time);
      fd.append("seatTypeId", seat.id);
      fd.append("partySize", String(party));
      fd.append("hasChildren", String(hasChildren));
      fd.append("visitType", visitType || "return");
      fd.append("name", name);
      fd.append("phone", phone);
      fd.append("symptoms", symptoms);
      const result = await createCafeReservation(fd);
      if (result.success) {
        try {
          localStorage.setItem("ballClinic_savedName", name);
          if (phone) localStorage.setItem("ballClinic_savedPhone", phone);
        } catch {}
        setSuccess(result.reservationNumber ?? "");
        return;
      }
      if ((result as { requiresQuestionnaire?: boolean }).requiresQuestionnaire) {
        setRequiresQuestionnaire(true);
      } else {
        toast.error(result.error || "エラーが発生しました");
      }
    } catch {
      toast.error("送信エラーが発生しました。しばらく経ってから再度お試しください");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── ローディング ──
  if (!config) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
      </div>
    );
  }

  // ── カフェ予約が無効な院（保険） ──
  if (!hours || seatTypes.length === 0) {
    return (
      <div className="min-h-screen bg-orange-50 flex flex-col items-center justify-center p-6 text-center">
        <Coffee className="w-12 h-12 text-orange-300 mb-4" />
        <p className="text-stone-700 font-bold mb-2">現在カフェのオンライン予約を受け付けておりません</p>
        <Link href="/reserve" className="text-orange-600 underline text-sm mt-2">予約トップへ戻る</Link>
      </div>
    );
  }

  // ── 完了画面 ──
  if (success !== null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-100 via-amber-50 to-rose-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-orange-100 text-center">
          <div className="w-20 h-20 bg-orange-500 rounded-full flex items-center justify-center shadow-lg shadow-orange-300/50 mx-auto mb-6">
            <CheckCircle2 className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-stone-800 mb-2">ご予約を受け付けました</h1>
          <p className="text-stone-500 text-sm mb-6">
            KUKUNA CAFE よりLINEにて
            <br />
            内容確認のご連絡をいたします。
          </p>
          <div className="bg-orange-50 rounded-2xl p-5 text-left text-sm text-stone-700 space-y-1.5 mb-6">
            <p className="flex justify-between"><span className="text-stone-400">日時</span><span className="font-bold">{date && format(date, "M月d日(E)", { locale: ja })} {time}</span></p>
            <p className="flex justify-between"><span className="text-stone-400">席種</span><span className="font-bold">{seat?.name}</span></p>
            <p className="flex justify-between"><span className="text-stone-400">人数</span><span className="font-bold">{party}名</span></p>
          </div>
          <a
            href={LINE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-4 px-4 rounded-2xl transition gap-2 mb-3"
          >
            <MessageCircle className="w-5 h-5" />
            LINEで予約を確定する
          </a>
          <Link href="/reserve" className="text-stone-400 hover:text-stone-600 text-sm inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            予約トップへ戻る
          </Link>
        </div>
      </div>
    );
  }

  const stepIndex = ["party", "seat", "datetime", "info", "confirm"].indexOf(step);

  function goBack() {
    if (step === "seat") setStep("party");
    else if (step === "datetime") setStep("seat");
    else if (step === "info") setStep("datetime");
    else if (step === "confirm") setStep("info");
  }

  return (
    <div className="min-h-screen bg-orange-50 text-stone-800">
      <div className="max-w-xl mx-auto px-4 py-8">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href={step === "party" ? "/reserve" : "#"}
            onClick={(e) => { if (step !== "party") { e.preventDefault(); goBack(); } }}
            className="inline-flex items-center gap-1 text-stone-400 hover:text-stone-600 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            戻る
          </Link>
          <div className="flex items-center gap-2 text-orange-600">
            <Coffee className="w-5 h-5" />
            <span className="font-black tracking-wide">KUKUNA CAFE</span>
          </div>
        </div>

        {/* ステップインジケーター */}
        <div className="flex items-center gap-1.5 mb-8">
          {["人数", "席種", "日時", "お客様", "確認"].map((label, i) => (
            <div key={label} className="flex-1 flex flex-col items-center gap-1">
              <div className={`h-1.5 w-full rounded-full ${i <= stepIndex ? "bg-orange-500" : "bg-orange-200"}`} />
              <span className={`text-[10px] ${i <= stepIndex ? "text-orange-600 font-bold" : "text-stone-400"}`}>{label}</span>
            </div>
          ))}
        </div>

        {/* ── STEP: 人数 ── */}
        {step === "party" && (
          <section className="space-y-6">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2 mb-1"><Users className="w-5 h-5 text-orange-500" />ご利用人数</h2>
              <p className="text-stone-500 text-sm">ご来店される人数をお選びください。</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: MAX_PARTY_BUTTONS }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setParty(n)}
                  className={`h-16 rounded-2xl font-bold text-lg border-2 transition ${
                    party === n ? "bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-200" : "bg-white border-orange-100 text-stone-700 hover:border-orange-300"
                  }`}
                >
                  {n}名
                </button>
              ))}
            </div>
            <label className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-orange-100 cursor-pointer">
              <input type="checkbox" checked={hasChildren} onChange={(e) => setHasChildren(e.target.checked)} className="w-5 h-5 accent-orange-500" />
              <span className="text-sm text-stone-700">お子様連れでのご利用（個室をご希望の場合）</span>
            </label>
            <p className="text-stone-400 text-xs">10名以上でのご利用はLINEまたはお電話にてお問い合わせください。</p>
            <Button
              onClick={() => setStep("seat")}
              disabled={!party}
              className="w-full h-14 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-base disabled:opacity-40"
            >
              席種を選ぶ →
            </Button>
          </section>
        )}

        {/* ── STEP: 席種 ── */}
        {step === "seat" && (
          <section className="space-y-5">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2 mb-1"><Coffee className="w-5 h-5 text-orange-500" />席種をお選びください</h2>
              <p className="text-stone-500 text-sm">{party}名様{hasChildren ? "・お子様連れ" : ""}でご利用いただける席です。</p>
            </div>
            <div className="space-y-3">
              {seatTypes.map((s) => {
                const allowed = seatAllowed(s, party, hasChildren);
                const isSel = seatId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!allowed}
                    onClick={() => { setSeatId(s.id); }}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition ${
                      isSel ? "bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-200"
                      : allowed ? "bg-white border-orange-100 text-stone-700 hover:border-orange-300"
                      : "bg-stone-100 border-stone-200 text-stone-400 cursor-not-allowed"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold">{s.name}</span>
                      {s.max_party_size != null && (
                        <span className={`text-xs ${isSel ? "text-white/80" : "text-stone-400"}`}>〜{s.max_party_size}名</span>
                      )}
                    </div>
                    {s.description && <p className={`text-xs mt-1 ${isSel ? "text-white/80" : "text-stone-400"}`}>{s.description}</p>}
                    {!allowed && s.min_party_size != null && (
                      <p className="text-xs mt-1 text-stone-400">{s.min_party_size}名様以上{s.allow_children_exception ? "／お子様連れ" : ""}でご利用いただけます</p>
                    )}
                  </button>
                );
              })}
            </div>
            <Button
              onClick={() => setStep("datetime")}
              disabled={!seatId}
              className="w-full h-14 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-base disabled:opacity-40"
            >
              日時を選ぶ →
            </Button>
          </section>
        )}

        {/* ── STEP: 日時 ── */}
        {step === "datetime" && (
          <section className="space-y-5">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2 mb-1"><Clock className="w-5 h-5 text-orange-500" />ご希望の日時</h2>
              <p className="text-stone-500 text-sm">空いているお時間をお選びください。</p>
            </div>

            <div>
              <Label className="text-stone-500 text-xs font-bold uppercase">ご来店日</Label>
              <Popover>
                <PopoverTrigger className="mt-2 w-full h-14 bg-white border border-orange-100 rounded-2xl px-4 text-left flex items-center gap-3">
                  <CalendarIcon className="w-5 h-5 text-orange-400" />
                  {date ? format(date, "yyyy年M月d日 (E)", { locale: ja }) : "日付を選択"}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-2xl overflow-hidden" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    locale={ja}
                    disabled={(d) => {
                      const dateStr = format(d, "yyyy-MM-dd");
                      const isHoliday = holidays.some((h) => h.date === dateStr);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      return isHoliday || d < today || !isDateWithinAllowedRange(d) || !isCafeOpenOn(d, hours);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {date && (
              <div className="space-y-4">
                {loadingSlots ? (
                  <div className="flex items-center justify-center py-8 text-stone-400">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : openSlots.length === 0 ? (
                  <p className="text-center py-8 text-stone-400 text-sm">この日は空きがございません。<br />別の日をお選びください。</p>
                ) : (
                  <>
                    {lunchSlots.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-orange-600 mb-2">🍽 ランチ</p>
                        <div className="grid grid-cols-4 gap-2">
                          {lunchSlots.map((s) => (
                            <button key={s.time} type="button" onClick={() => setTime(s.time)}
                              className={`h-12 rounded-xl font-bold text-sm border-2 transition ${time === s.time ? "bg-orange-500 border-orange-500 text-white" : "bg-white border-orange-100 text-stone-700 hover:border-orange-300"}`}>
                              {s.time}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {dinnerSlots.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-indigo-600 mb-2">🌙 ディナー</p>
                        <div className="grid grid-cols-4 gap-2">
                          {dinnerSlots.map((s) => (
                            <button key={s.time} type="button" onClick={() => setTime(s.time)}
                              className={`h-12 rounded-xl font-bold text-sm border-2 transition ${time === s.time ? "bg-orange-500 border-orange-500 text-white" : "bg-white border-orange-100 text-stone-700 hover:border-orange-300"}`}>
                              {s.time}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <Button
              onClick={() => setStep("info")}
              disabled={!date || !time}
              className="w-full h-14 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-base disabled:opacity-40"
            >
              お客様情報へ →
            </Button>
          </section>
        )}

        {/* ── STEP: お客様情報 ── */}
        {step === "info" && (
          <section className="space-y-5">
            <div>
              <h2 className="text-xl font-bold mb-1">お客様情報</h2>
              <p className="text-stone-500 text-sm">ご予約者さまの情報をご入力ください。</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setVisitType("new")}
                className={`h-14 rounded-2xl font-bold text-sm border-2 transition ${visitType === "new" ? "bg-orange-500 border-orange-500 text-white" : "bg-white border-orange-100 text-stone-700"}`}>
                🆕 初めて
              </button>
              <button type="button" onClick={() => setVisitType("return")}
                className={`h-14 rounded-2xl font-bold text-sm border-2 transition ${visitType === "return" ? "bg-orange-500 border-orange-500 text-white" : "bg-white border-orange-100 text-stone-700"}`}>
                🔄 2回目以降
              </button>
            </div>

            <div className="space-y-2">
              <Label className="text-stone-500 text-xs font-bold uppercase" htmlFor="cafe-name">お名前</Label>
              <Input id="cafe-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="山田 太郎" className="h-14 bg-white border-orange-100 rounded-2xl" />
            </div>

            <div className="space-y-2">
              <Label className="text-stone-500 text-xs font-bold uppercase" htmlFor="cafe-phone">
                電話番号 {visitType === "new" ? "" : <span className="font-normal normal-case text-stone-400">（任意）</span>}
              </Label>
              <Input id="cafe-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="090-0000-0000" className="h-14 bg-white border-orange-100 rounded-2xl" />
            </div>

            <div className="space-y-2">
              <Label className="text-stone-500 text-xs font-bold uppercase" htmlFor="cafe-note">ご要望（任意）</Label>
              <Input id="cafe-note" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="アレルギー・記念日など" className="h-14 bg-white border-orange-100 rounded-2xl" />
            </div>

            {requiresQuestionnaire && (
              <div className="p-4 bg-orange-100 border border-orange-200 rounded-2xl space-y-2">
                <p className="text-orange-800 font-bold text-sm">初めてオンライン予約をご希望の方は、先にアンケートへのご回答をお願いします</p>
                <Link href="/questionnaire" className="inline-flex w-full items-center justify-center bg-orange-500 text-white font-bold py-3 rounded-xl text-sm">
                  📋 アンケートに回答して予約に進む
                </Link>
              </div>
            )}

            <Button
              onClick={() => setStep("confirm")}
              disabled={!visitType || !name.trim() || (visitType === "new" && !phone.trim())}
              className="w-full h-14 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-base disabled:opacity-40"
            >
              ご予約内容の確認へ →
            </Button>
          </section>
        )}

        {/* ── STEP: 最終確認 ── */}
        {step === "confirm" && (
          <section className="space-y-5">
            <div>
              <h2 className="text-xl font-bold mb-1">ご予約内容の確認</h2>
              <p className="text-stone-500 text-sm">下記の内容でよろしければ確定してください。</p>
            </div>

            <div className="bg-white rounded-2xl border border-orange-100 divide-y divide-orange-50">
              {[
                { label: "ご利用部門", value: "KUKUNA CAFE" },
                { label: "日時", value: `${date && format(date, "yyyy年M月d日(E)", { locale: ja })} ${time}` },
                { label: "席種", value: seat?.name ?? "" },
                { label: "人数", value: `${party}名${hasChildren ? "（お子様連れ）" : ""}` },
                { label: "お名前", value: name },
                { label: "電話番号", value: phone || "（未入力）" },
                ...(symptoms ? [{ label: "ご要望", value: symptoms }] : []),
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-start gap-4 px-5 py-3.5">
                  <span className="text-stone-400 text-xs font-bold shrink-0 pt-0.5">{row.label}</span>
                  <span className="text-stone-800 font-bold text-sm text-right">{row.value}</span>
                </div>
              ))}
            </div>

            <div className="bg-orange-100/60 border border-orange-200 rounded-2xl p-4 text-xs text-stone-600">
              こちらは仮予約です。KUKUNA CAFE がLINEにて確認後、ご予約確定のご連絡をいたします。
            </div>

            {requiresQuestionnaire && (
              <div className="p-4 bg-orange-100 border border-orange-200 rounded-2xl space-y-2">
                <p className="text-orange-800 font-bold text-sm">初めてオンライン予約をご希望の方は、先にアンケートへのご回答をお願いします</p>
                <Link href="/questionnaire" className="inline-flex w-full items-center justify-center bg-orange-500 text-white font-bold py-3 rounded-xl text-sm">
                  📋 アンケートに回答して予約に進む
                </Link>
              </div>
            )}

            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full h-16 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white font-black text-lg disabled:opacity-40"
            >
              {isSubmitting ? "送信中..." : "この内容で予約する"}
            </Button>
          </section>
        )}
      </div>
    </div>
  );
}

export default function CafeReservePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-orange-50 flex items-center justify-center"><Loader2 className="w-8 h-8 text-orange-400 animate-spin" /></div>}>
      <CafeReserveContent />
    </Suspense>
  );
}
