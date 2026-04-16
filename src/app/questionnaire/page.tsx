"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, MessageCircle, ArrowLeft, ChevronRight } from "lucide-react";
import { submitQuestionnaire } from "@/app/actions/questionnaire";
import { toast } from "sonner";
import { CLINIC_CONFIG } from "@/lib/clinic-config";
const _isExternalLogo = CLINIC_CONFIG.logoSmallUrl.startsWith("http");

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const AGE_GROUPS = ["19歳以下", "20代", "30代", "40代", "50代", "60代以上"];

export default function QuestionnairePage() {
  const [step, setStep] = useState<"form" | "done">("form");
  const [submitting, setSubmitting] = useState(false);
  const [normalizedPhone, setNormalizedPhone] = useState("");

  const [name, setName] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthMonth, setBirthMonth] = useState<number | null>(null);
  const [gender, setGender] = useState<"male" | "female" | "other" | null>(null);
  const [ageGroup, setAgeGroup] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast.error("お名前と電話番号を入力してください");
      return;
    }

    const normalizedPhone = phone.trim().replace(/-/g, "");
    if (!/^\d{10,11}$/.test(normalizedPhone)) {
      toast.error("電話番号は10〜11桁の数字で入力してください（ハイフン不要）");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitQuestionnaire({
        name: name.trim(),
        guardian_name: guardianName.trim() || null,
        phone: normalizedPhone,
        birth_month: birthMonth,
        gender,
        age_group: ageGroup,
      });

      if (result.success) {
        setNormalizedPhone(normalizedPhone);
        setStep("done");
      } else {
        toast.error(result.error || "送信に失敗しました");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "done") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full space-y-4">

          {/* ヘッダー */}
          <div className="text-center space-y-3">
            <div className="relative w-40 h-14 mx-auto">
              {_isExternalLogo ? (
                <img src={CLINIC_CONFIG.logoSmallUrl} alt={CLINIC_CONFIG.nameShort} className="max-h-full w-auto object-contain mx-auto" />
              ) : (
                <Image src={CLINIC_CONFIG.logoSmallUrl} alt={CLINIC_CONFIG.nameShort} fill className="object-contain" />
              )}
            </div>
            <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/40">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white">ご登録ありがとうございます！</h1>
              <p className="text-blue-200/70 text-sm mt-1">あと2ステップで完了です</p>
            </div>
          </div>

          {/* STEP 1: LINE紐づけ（最優先） */}
          <div className="bg-[#06C755]/20 border-2 border-[#06C755]/60 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="bg-[#06C755] text-white text-xs font-black px-2.5 py-1 rounded-full">STEP 1</span>
              <p className="text-white font-bold text-sm">LINEを友だち追加する</p>
            </div>
            <a
              href="https://line.me/ti/p/%40shc8761q"
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-4 px-4 rounded-xl transition-all gap-2 text-base shadow-lg"
            >
              <MessageCircle className="w-5 h-5" />
              友だち追加する（タップ）
            </a>
          </div>

          {/* STEP 2: 4桁送信 */}
          <div className="bg-white/10 border border-white/20 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="bg-blue-500 text-white text-xs font-black px-2.5 py-1 rounded-full">STEP 2</span>
              <p className="text-white font-bold text-sm">LINEでこの番号を送信する</p>
            </div>
            <div className="bg-white/10 rounded-xl p-4 text-center space-y-1">
              <p className="text-blue-200/70 text-xs">友だち追加後、LINEのトーク画面でこの数字を送ってください</p>
              <p className="text-white font-black text-5xl tracking-[0.3em] mt-2">{normalizedPhone.slice(-4)}</p>
              <p className="text-blue-200/50 text-xs mt-1">（電話番号の下4桁）</p>
            </div>
            <p className="text-blue-200/60 text-xs text-center">
              送信すると自動で紐づけ完了のメッセージが届きます
            </p>
          </div>

          {/* STEP 3: 予約へ */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="bg-slate-500 text-white text-xs font-black px-2.5 py-1 rounded-full">STEP 3</span>
              <p className="text-white font-bold text-sm">オンライン予約に進む</p>
            </div>
            <Link
              href="/reserve/calendar"
              className="flex w-full items-center justify-center bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-4 rounded-xl transition-all gap-2 text-base shadow-lg shadow-blue-600/30"
            >
              📅 予約カレンダーを開く
            </Link>
            <p className="text-blue-200/40 text-[10px] text-center">
              ※LINEの紐づけが先でも後でも予約は可能です
            </p>
          </div>

          <Link href="/" className="text-blue-300/60 hover:text-white text-xs inline-flex items-center justify-center gap-1 w-full transition-colors py-2">
            <ArrowLeft className="w-3 h-3" />
            トップページへ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200" data-dark-page>
      <div className="max-w-lg mx-auto py-12 px-4">
        {/* ロゴ */}
        <div className="flex flex-col items-center mb-10">
          <div className="relative w-48 h-16 mb-3">
            {_isExternalLogo ? (
                <img src={CLINIC_CONFIG.logoSmallUrl} alt={CLINIC_CONFIG.nameShort} className="max-h-full w-auto object-contain mx-auto" />
              ) : (
                <Image src={CLINIC_CONFIG.logoSmallUrl} alt={CLINIC_CONFIG.nameShort} fill className="object-contain" />
              )}
          </div>
          <p className="text-blue-200/50 text-xs tracking-widest uppercase">Body ALL care.</p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl rounded-[2.5rem] border border-white/10 p-8 shadow-2xl">
          {/* ヘッダー */}
          <div className="mb-8 text-center space-y-2">
            <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-bold px-4 py-1.5 rounded-full mb-2">
              初めてオンライン予約をご希望の方
            </div>
            <h1 className="text-2xl font-extrabold text-white">アンケートにご協力ください</h1>
            <p className="text-blue-100/50 text-sm">
              いただいた情報は、誕生月クーポンや特別なご案内にのみ使用します。
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* お名前 */}
            <div className="space-y-2">
              <label className="text-blue-100/60 font-bold text-xs uppercase tracking-wide">
                治療を受けられる患者様のお名前 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="山田 太郎"
                className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-4 text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
              />
            </div>

            {/* 保護者名 */}
            <div className="space-y-2">
              <label className="text-blue-100/60 font-bold text-xs uppercase tracking-wide">
                保護者のお名前 <span className="text-blue-400/50 font-normal normal-case text-[11px]">（任意・未成年の方のみ）</span>
              </label>
              <input
                type="text"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                placeholder="山田 花子"
                className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-4 text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
              />
            </div>

            {/* 電話番号 */}
            <div className="space-y-2">
              <label className="text-blue-100/60 font-bold text-xs uppercase tracking-wide">
                電話番号 <span className="text-red-400">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="09012345678"
                inputMode="numeric"
                className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-4 text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
              />
            </div>

            {/* 誕生月 */}
            <div className="space-y-2">
              <label className="text-blue-100/60 font-bold text-xs uppercase tracking-wide">
                誕生月 <span className="text-blue-400/50 font-normal text-[10px]">（誕生月クーポンに使用します）</span>
              </label>
              <div className="grid grid-cols-6 gap-2">
                {MONTHS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setBirthMonth(birthMonth === m ? null : m)}
                    className={`h-10 rounded-xl font-bold text-sm transition-all ${
                      birthMonth === m
                        ? "bg-blue-600 text-white border border-blue-500"
                        : "bg-white/5 border border-white/10 text-blue-100/60 hover:bg-white/10"
                    }`}
                  >
                    {m}月
                  </button>
                ))}
              </div>
            </div>

            {/* 性別 */}
            <div className="space-y-2">
              <label className="text-blue-100/60 font-bold text-xs uppercase tracking-wide">性別</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: "male", label: "男性" },
                  { key: "female", label: "女性" },
                  { key: "other", label: "その他" },
                ].map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setGender(gender === g.key as any ? null : g.key as any)}
                    className={`h-12 rounded-2xl font-bold text-sm transition-all border ${
                      gender === g.key
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-white/5 border-white/10 text-blue-100/60 hover:bg-white/10"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 年代 */}
            <div className="space-y-2">
              <label className="text-blue-100/60 font-bold text-xs uppercase tracking-wide">年代</label>
              <div className="grid grid-cols-3 gap-2">
                {AGE_GROUPS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAgeGroup(ageGroup === a ? null : a)}
                    className={`h-12 rounded-2xl font-bold text-sm transition-all border ${
                      ageGroup === a
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-white/5 border-white/10 text-blue-100/60 hover:bg-white/10"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting || !name.trim() || !phone.trim()}
                className="w-full h-16 text-lg font-black rounded-3xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition-all flex items-center justify-center gap-2"
              >
                {submitting ? "送信中..." : (
                  <>
                    アンケートを送信する
                    <ChevronRight className="w-5 h-5" />
                  </>
                )}
              </button>
              <p className="text-center text-blue-100/30 text-xs mt-3">
                ※ 個人情報は院内のみで使用し、第三者に提供しません
              </p>
            </div>
          </form>
        </div>

        <div className="mt-6 text-center">
          <Link href="/reserve" className="text-blue-300 hover:text-white text-sm inline-flex items-center gap-1 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            予約ページへ戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
