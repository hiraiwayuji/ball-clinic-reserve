"use client";

import { useState, useTransition } from "react";
import { updateCustomerQuestionnaire } from "@/app/actions/adminCustomers";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ClipboardList, Loader2 } from "lucide-react";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const AGE_GROUPS = ["19歳以下", "20代", "30代", "40代", "50代", "60代以上"];
const GENDERS = [
  { key: "male", label: "男性" },
  { key: "female", label: "女性" },
  { key: "other", label: "その他" },
];

const REFERRAL_SOURCES = [
  "紹介",
  "Instagram",
  "YouTube",
  "Google",
  "チラシ",
  "看板",
  "ホームページ",
  "その他",
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId: string;
  customerName: string;
  initialData: {
    guardian_name: string | null;
    birth_month: number | null;
    gender: string | null;
    age_group: string | null;
    city_name: string | null;
    birth_date: string | null;
    referral_source: string | null;
    address: string | null;
    school_club: string | null;
  };
}

export function QuestionnaireDialog({ open, onOpenChange, customerId, customerName, initialData }: Props) {
  const [guardianName, setGuardianName] = useState(initialData.guardian_name ?? "");
  const [birthMonth, setBirthMonth] = useState<number | null>(initialData.birth_month);
  const [gender, setGender] = useState<string | null>(initialData.gender);
  const [ageGroup, setAgeGroup] = useState<string | null>(initialData.age_group);
  const [cityName, setCityName] = useState(initialData.city_name ?? "");
  const [birthDate, setBirthDate] = useState(initialData.birth_date ?? "");
  const [referralSource, setReferralSource] = useState(initialData.referral_source ?? "");
  const [address, setAddress] = useState(initialData.address ?? "");
  const [schoolClub, setSchoolClub] = useState(initialData.school_club ?? "");
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      try {
        await updateCustomerQuestionnaire(customerId, {
          guardian_name: guardianName.trim() || null,
          birth_month: birthMonth,
          gender,
          age_group: ageGroup,
          city_name: cityName.trim() || null,
          birth_date: birthDate || null,
          referral_source: referralSource || null,
          address: address.trim() || null,
          school_club: schoolClub.trim() || null,
        });
        toast.success("アンケート情報を保存しました");
        onOpenChange(false);
      } catch {
        toast.error("保存に失敗しました");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="w-4 h-4 text-blue-600" />
            {customerName}さんのアンケート情報
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* 保護者名 */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600">保護者名（未成年の方のみ）</label>
            <input
              type="text"
              value={guardianName}
              onChange={e => setGuardianName(e.target.value)}
              placeholder="山田 花子"
              className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* 誕生月 */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600">誕生月</label>
            <div className="grid grid-cols-6 gap-1.5">
              {MONTHS.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setBirthMonth(birthMonth === m ? null : m)}
                  className={`h-9 rounded-lg text-xs font-bold transition-all border ${
                    birthMonth === m
                      ? "bg-blue-600 text-white border-blue-500"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {m}月
                </button>
              ))}
            </div>
          </div>

          {/* 性別 */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600">性別</label>
            <div className="grid grid-cols-3 gap-2">
              {GENDERS.map(g => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setGender(gender === g.key ? null : g.key)}
                  className={`h-9 rounded-lg text-xs font-bold transition-all border ${
                    gender === g.key
                      ? "bg-blue-600 text-white border-blue-500"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* 年代 */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600">年代（目安）</label>
            <div className="grid grid-cols-3 gap-2">
              {AGE_GROUPS.map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAgeGroup(ageGroup === a ? null : a)}
                  className={`h-9 rounded-lg text-xs font-bold transition-all border ${
                    ageGroup === a
                      ? "bg-blue-600 text-white border-blue-500"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* 市町村 */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600">お住まいの地域（市町村）</label>
            <input
              type="text"
              value={cityName}
              onChange={e => setCityName(e.target.value)}
              placeholder="〇〇市、〇〇町"
              className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* 学校名・クラブ名 */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600">学校名・所属クラブ（任意）</label>
            <input
              type="text"
              value={schoolClub}
              onChange={e => setSchoolClub(e.target.value)}
              placeholder="例：藍住中学校／〇〇サッカークラブ"
              className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* 生年月日 */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600">生年月日（医療費助成の判定・年齢分析用）</label>
            <input
              type="date"
              value={birthDate}
              onChange={e => setBirthDate(e.target.value)}
              className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* 住所 */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600">住所（番地まで）</label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="〇〇市〇〇町1-2-3"
              className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* 来院経路 */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600">来院のきっかけ</label>
            <div className="grid grid-cols-2 gap-1.5">
              {REFERRAL_SOURCES.map(src => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setReferralSource(referralSource === src ? "" : src)}
                  className={`h-9 rounded-lg text-xs font-bold transition-all border ${
                    referralSource === src
                      ? "bg-amber-500 text-white border-amber-400 shadow-sm"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {src}
                </button>
              ))}
            </div>
            {referralSource === "その他" && (
                <input
                    type="text"
                    placeholder="具体的に記入（知人の紹介など）"
                    className="w-full h-9 border border-slate-200 rounded-lg px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 mt-1"
                />
            )}
          </div>

          <Button
            className="w-full bg-blue-600 hover:bg-blue-700"
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            保存する
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
