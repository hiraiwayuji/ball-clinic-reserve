"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, CalendarDays, ClipboardList } from "lucide-react";
import LPHero from "@/components/reserve/LPHero";
import LPFeatures from "@/components/reserve/LPFeatures";
import { getPublicClinicSettings, type PublicClinicSettings } from "@/app/actions/publicSettings";
import { CLINIC_CONFIG } from "@/lib/clinic-config";
import { getThemeClasses } from "@/lib/lp-theme";

export default function ReserveLandingPage() {
  const [settings, setSettings] = useState<PublicClinicSettings | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    getPublicClinicSettings().then((s) => {
      if (!mounted) return;
      setSettings(s);
      setLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const themeColor = settings?.theme_color ?? "blue";
  const theme = getThemeClasses(themeColor);

  if (!loaded) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white" data-dark-page>
      <LPHero settings={settings} fallbackName={CLINIC_CONFIG.name} />

      <LPFeatures
        features={settings?.lp_features ?? null}
        problems={settings?.lp_target_problems ?? null}
        themeColor={themeColor}
      />

      {/* メイン導線セクション */}
      <div className="max-w-3xl mx-auto px-5 py-8 space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/40 mb-3">
          ご予約方法をお選びください
        </h2>

        <Link
          href="/reserve/menu"
          className={`flex items-center gap-3 w-full p-5 rounded-2xl ${theme.ctaBg} ${theme.ctaHoverBg} active:scale-[0.99] text-white shadow-xl ${theme.ctaShadow} transition`}
        >
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-base font-black">クーポン・メニューから選ぶ</div>
            <div className="text-xs text-white/80 mt-0.5">写真付きで内容と価格を確認できます</div>
          </div>
          <span className="text-white/80 text-xl font-black">→</span>
        </Link>

        <Link
          href="/reserve/calendar"
          className="flex items-center gap-3 w-full p-5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white transition"
        >
          <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
            <CalendarDays className={`w-6 h-6 ${theme.accentText}`} />
          </div>
          <div className="flex-1 text-left">
            <div className="text-base font-black">日付から空き状況を確認</div>
            <div className="text-xs text-white/60 mt-0.5">先に空き日時を見て予約したい方向け</div>
          </div>
          <span className="text-white/40 text-xl font-black">→</span>
        </Link>
      </div>

      {/* 初めての方向け */}
      <div className="max-w-3xl mx-auto px-5 pb-12">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardList className={`w-4 h-4 ${theme.accentText}`} />
            <p className="text-white/60 text-xs font-bold uppercase tracking-widest">
              初めてオンライン予約をご希望の方
            </p>
          </div>
          <p className="text-white font-bold text-sm">
            アンケートにご協力ください
          </p>
          <p className="text-white/50 text-xs leading-relaxed">
            お名前・電話番号・誕生月などをご登録いただくと、LINE登録後にオンライン予約が可能になります。誕生月クーポンなどの特典もご利用いただけます。
          </p>
          <Link
            href="/questionnaire"
            className="inline-flex w-full items-center justify-center bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold py-3 px-4 rounded-2xl transition gap-2 text-sm"
          >
            アンケートに回答して登録する
          </Link>
        </div>
      </div>
    </div>
  );
}
