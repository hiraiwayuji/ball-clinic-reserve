"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Sparkles, CalendarDays, ClipboardList, Users, Coffee, Flower2 } from "lucide-react";
import LPHero from "@/components/reserve/LPHero";
import LPFeatures from "@/components/reserve/LPFeatures";
import { getPublicClinicSettings, type PublicClinicSettings } from "@/app/actions/publicSettings";
import { CLINIC_CONFIG } from "@/lib/clinic-config";
import { getThemeClasses } from "@/lib/lp-theme";
import { consumeLineReserveToken, getFamilyForLineSession } from "@/app/actions/family-line";
import type { LinkedCustomer } from "@/lib/line-links";

const SELECTED_CUSTOMER_KEY = "ballClinic_selectedCustomerId";
const FAMILY_LIST_KEY = "ballClinic_familyList";

export default function ReserveLandingPage() {
  const [settings, setSettings] = useState<PublicClinicSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [family, setFamily] = useState<LinkedCustomer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const searchParams = useSearchParams();
  const router = useRouter();

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

  // LINE 経由 (?lt=...) または既存セッションから家族リストを取得
  useEffect(() => {
    const lt = searchParams.get("lt");
    let cancelled = false;
    (async () => {
      let list: LinkedCustomer[] = [];
      if (lt) {
        const result = await consumeLineReserveToken(lt);
        if (result.ok) list = result.family;
        // URL から ?lt を消す（ブラウザバックや共有時の安全対策）
        router.replace("/reserve");
      } else {
        list = await getFamilyForLineSession();
      }
      if (cancelled) return;
      setFamily(list);
      if (list.length > 0) {
        try {
          localStorage.setItem(FAMILY_LIST_KEY, JSON.stringify(list));
        } catch {}
      }
      const stored = (() => {
        try { return localStorage.getItem(SELECTED_CUSTOMER_KEY) ?? ""; } catch { return ""; }
      })();
      if (list.length === 1) {
        setSelectedCustomerId(list[0].customer_id);
        try { localStorage.setItem(SELECTED_CUSTOMER_KEY, list[0].customer_id); } catch {}
      } else if (stored && list.some((c) => c.customer_id === stored)) {
        setSelectedCustomerId(stored);
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams, router]);

  function selectFamilyMember(customerId: string) {
    setSelectedCustomerId(customerId);
    try { localStorage.setItem(SELECTED_CUSTOMER_KEY, customerId); } catch {}
  }

  const themeColor = settings?.theme_color ?? "blue";
  const theme = getThemeClasses(themeColor);

  // 部門（サロン/カフェ）が2件以上ある院は、入口で部門選択を出す。
  // dept=salon のとき従来のサロン導線を表示。dept 未指定なら部門チューザー。
  const departments = settings?.departments ?? [];
  const hasMultiDepartments = departments.length >= 2 && departments.includes("カフェ");
  const dept = searchParams.get("dept");

  if (!loaded) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const selectedMember = family.find((c) => c.customer_id === selectedCustomerId) ?? null;

  // ── 部門チューザー（サロン / カフェ の切替） ──
  if (hasMultiDepartments && dept !== "salon") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-900 via-stone-950 to-black text-white flex flex-col" data-dark-page>
        <div className="flex-1 max-w-2xl mx-auto w-full px-5 py-10 flex flex-col justify-center">
          <div className="text-center mb-10">
            <p className="text-amber-200/60 text-[11px] tracking-[0.3em] uppercase mb-3">Reservation</p>
            <h1 className="text-2xl font-black text-white mb-2">
              ご予約の種類を
              <br />
              お選びください
            </h1>
            <p className="text-white/40 text-sm">サロンとカフェで予約ページが分かれています。</p>
          </div>

          <div className="grid gap-4">
            {/* サロン */}
            <button
              type="button"
              onClick={() => router.push("/reserve?dept=salon")}
              className="group text-left p-6 rounded-3xl bg-gradient-to-br from-amber-500/15 to-amber-900/10 border border-amber-400/30 hover:border-amber-300/60 transition active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-400/20 flex items-center justify-center shrink-0">
                  <Flower2 className="w-7 h-7 text-amber-300" />
                </div>
                <div className="flex-1">
                  <div className="text-lg font-black text-white">サロンを予約</div>
                  <div className="text-amber-100/60 text-xs mt-0.5">PRIVATE SALON AILUS</div>
                  <div className="text-white/40 text-xs mt-1">リンパ・エステ・腸活・講座</div>
                </div>
                <span className="text-amber-300/70 text-2xl font-black group-hover:translate-x-1 transition">→</span>
              </div>
            </button>

            {/* カフェ */}
            <button
              type="button"
              onClick={() => router.push("/reserve/cafe")}
              className="group text-left p-6 rounded-3xl bg-gradient-to-br from-orange-500/15 to-orange-900/10 border border-orange-400/30 hover:border-orange-300/60 transition active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-orange-400/20 flex items-center justify-center shrink-0">
                  <Coffee className="w-7 h-7 text-orange-300" />
                </div>
                <div className="flex-1">
                  <div className="text-lg font-black text-white">カフェを予約</div>
                  <div className="text-orange-100/60 text-xs mt-0.5">KUKUNA CAFE</div>
                  <div className="text-white/40 text-xs mt-1">グルテンフリーのお食事・席のご予約</div>
                </div>
                <span className="text-orange-300/70 text-2xl font-black group-hover:translate-x-1 transition">→</span>
              </div>
            </button>
          </div>
        </div>
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

      {/* LINE 経由：家族選択（複数患者紐付き時のみ） */}
      {family.length > 1 && (
        <div className="max-w-3xl mx-auto px-5 pt-8">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-300">
              <Users className="w-4 h-4" />
              <p className="text-xs font-bold uppercase tracking-widest">予約する患者さんを選んでください</p>
            </div>
            <div className="grid gap-2">
              {family.map((c) => {
                const isSelected = c.customer_id === selectedCustomerId;
                const label = c.display_label ?? c.display_name ?? c.name;
                return (
                  <button
                    key={c.customer_id}
                    type="button"
                    onClick={() => selectFamilyMember(c.customer_id)}
                    className={`w-full text-left p-4 rounded-xl border transition ${
                      isSelected
                        ? "bg-emerald-500 border-emerald-400 text-white"
                        : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">
                        {label}
                        {c.is_primary && <span className="ml-2 text-[10px] opacity-70">主</span>}
                      </span>
                      {isSelected && <span className="text-xs">選択中</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-emerald-200/70 text-xs">
              ※ 切替えると以降の予約はこの患者さんでお取りします。
            </p>
          </div>
        </div>
      )}

      {/* LINE 経由：1人だけ紐付き時のウェルカム表示 */}
      {family.length === 1 && selectedMember && (
        <div className="max-w-3xl mx-auto px-5 pt-8">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 text-center">
            <p className="text-emerald-200 text-sm">
              <span className="font-bold">{selectedMember.display_name ?? selectedMember.name}</span> さんでご予約に進みます
            </p>
          </div>
        </div>
      )}

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
