"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { CalendarDays, ClipboardList, Users, Coffee, Flower2, X } from "lucide-react";
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
  const [familyResolved, setFamilyResolved] = useState(false);
  const [showFirstTimePopup, setShowFirstTimePopup] = useState(false);
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
      setFamilyResolved(true);
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

  // 初めての方向けポップアップ：LINE紐付け患者がいない（＝新規の可能性が高い）来訪者に、
  // 「アンケート未記入だと仮予約にならない」ことを最初に必ず気づいてもらう。
  // 既存患者（家族紐付けあり）には出さない。1セッション内では一度閉じたら再表示しない。
  const FIRST_TIME_POPUP_KEY = "ballClinic_firstTimePopupDismissed";
  useEffect(() => {
    if (!familyResolved || family.length > 0) return;
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(FIRST_TIME_POPUP_KEY) === "1"; } catch {}
    if (!dismissed) setShowFirstTimePopup(true);
  }, [familyResolved, family.length]);

  function dismissFirstTimePopup() {
    setShowFirstTimePopup(false);
    try { sessionStorage.setItem(FIRST_TIME_POPUP_KEY, "1"); } catch {}
  }

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
      {/* 初めての方向け 注意ポップアップ（新規来訪者のみ・1セッション1回） */}
      {showFirstTimePopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="first-time-popup-title"
          onClick={dismissFirstTimePopup}
        >
          <div
            className="relative w-full max-w-sm bg-white text-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-[fadeIn_.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={dismissFirstTimePopup}
              aria-label="閉じる"
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="bg-blue-600 px-6 pt-6 pb-5 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-white/90 flex items-center justify-center mb-3">
                <ClipboardList className="w-7 h-7 text-blue-600" />
              </div>
              <h2 id="first-time-popup-title" className="text-lg font-black text-white leading-snug">
                初めての方へ
                <br />
                ご予約の流れ
              </h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* 4ステップで「いつ仮予約になり、いつ完了か」を最初に伝える */}
              <ol className="space-y-2.5">
                {[
                  { n: "1", t: "「はじめての予約はこちら」から日時を選ぶ" },
                  { n: "2", t: "お名前などを入れて申し込む" },
                  { n: "3", t: "初めての方は1回だけアンケート（選んだ日時はそのまま引き継ぎ）" },
                  { n: "4", t: "院からLINEで「予約確定」の連絡 → 完了！" },
                ].map((s) => (
                  <li key={s.n} className="flex items-start gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-black flex items-center justify-center mt-0.5">
                      {s.n}
                    </span>
                    <span className="text-sm leading-relaxed text-slate-700">{s.t}</span>
                  </li>
                ))}
              </ol>
              <p className="text-xs leading-relaxed text-slate-500 bg-slate-50 rounded-xl p-3">
                アンケートは初めての1回だけの登録です。
                <br />
                誕生月クーポンなど、お得なご案内にも使わせていただきます。
              </p>
              <Link
                href="/reserve/calendar"
                onClick={dismissFirstTimePopup}
                className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 px-4 rounded-2xl transition shadow-lg shadow-blue-500/30"
              >
                予約をはじめる
              </Link>
              <Link
                href="/questionnaire"
                onClick={dismissFirstTimePopup}
                className="block w-full text-center text-xs text-slate-400 hover:text-slate-600 py-1"
              >
                先にアンケートだけ済ませておく
              </Link>
            </div>
          </div>
        </div>
      )}

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

      {/* 初めての方向け 流れ案内（常時表示・まず日時選びへ誘導） */}
      {family.length === 0 && (
        <div className="max-w-3xl mx-auto px-5 pt-6">
          <div className="flex items-start gap-3 bg-blue-500/15 border border-blue-400/40 rounded-2xl p-4">
            <CalendarDays className="w-5 h-5 text-blue-300 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="text-blue-50 font-bold text-sm leading-snug">
                初めての方も、上の「はじめての予約はこちら」からお進みください
              </p>
              <p className="text-blue-100/70 text-xs leading-relaxed">
                お申し込みの途中で、初めての方だけ1回かんたんなアンケート登録があります。
                選んだ日時はそのまま引き継がれるので、選び直しはいりません。
                ご予約は院からの確定LINEが届いて完了です。
              </p>
            </div>
          </div>
        </div>
      )}

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
            アンケート登録は、予約のお申し込み中に1回だけでOKです
          </p>
          <p className="text-white/50 text-xs leading-relaxed">
            上から日時を選んでお申し込みいただくと、初めての方は途中でアンケート（1〜2分）にご案内します。
            選んだ日時はそのまま引き継がれるので、選び直しはいりません。
            先に済ませておきたい方は、下のボタンからどうぞ。誕生月クーポンなどの特典もご利用いただけます。
          </p>
          <Link
            href="/questionnaire"
            className="inline-flex w-full items-center justify-center bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold py-3 px-4 rounded-2xl transition gap-2 text-sm"
          >
            先にアンケートだけ登録しておく
          </Link>
        </div>
      </div>
    </div>
  );
}
