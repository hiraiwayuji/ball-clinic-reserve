"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Sparkles, Clock, Tag, Star, Users, UserPlus, RefreshCw } from "lucide-react";
import type { ReservationCourse } from "@/app/actions/courses";
import { CLINIC_CONFIG } from "@/lib/clinic-config";

const isExternalLogo = CLINIC_CONFIG.logoSmallUrl.startsWith("http");

type Tab = "coupon" | "menu" | "all";
type AudienceFilter = "all" | "first" | "repeat";

interface Props {
  initialCourses: ReservationCourse[];
}

function audienceOf(course: ReservationCourse): "first" | "repeat" | "all" {
  if (course.is_first_visit_only) return "first";
  if (course.is_repeat_only) return "repeat";
  return "all";
}

function formatPercent(price: number, regular: number): string {
  if (regular <= 0 || price >= regular) return "";
  const off = Math.round(((regular - price) / regular) * 100);
  return `${off}%OFF`;
}

export default function MenuLPClient({ initialCourses }: Props) {
  const [tab, setTab] = useState<Tab>("coupon");
  const [audience, setAudience] = useState<AudienceFilter>("all");

  const filteredCourses = useMemo(() => {
    return initialCourses.filter(c => {
      if (tab === "coupon" && !c.is_coupon) return false;
      if (tab === "menu" && c.is_coupon) return false;

      const aud = audienceOf(c);
      if (audience === "first" && aud !== "first" && aud !== "all") return false;
      if (audience === "repeat" && aud !== "repeat" && aud !== "all") return false;
      return true;
    });
  }, [initialCourses, tab, audience]);

  const counts = useMemo(() => ({
    coupon: initialCourses.filter(c => c.is_coupon).length,
    menu: initialCourses.filter(c => !c.is_coupon).length,
    all: initialCourses.length,
  }), [initialCourses]);

  return (
    <div className="min-h-screen bg-slate-900 text-white" data-dark-page>
      {/* ─── ヘッダー ─── */}
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/reserve"
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 transition shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-zinc-300" />
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-zinc-500 font-bold">{CLINIC_CONFIG.nameShort}</p>
            <h1 className="text-sm font-black text-white truncate flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              メニュー・クーポン
            </h1>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] text-zinc-600 font-bold">全{counts.all}件</p>
          </div>
        </div>

        {/* タブ切替（クーポン / メニュー / すべて） */}
        <div className="max-w-2xl mx-auto px-4 pb-3">
          <div className="grid grid-cols-3 gap-1.5 bg-zinc-900 rounded-xl p-1 border border-zinc-800">
            {([
              { key: "coupon" as const, label: "クーポン", count: counts.coupon },
              { key: "menu" as const, label: "通常メニュー", count: counts.menu },
              { key: "all" as const, label: "すべて", count: counts.all },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative h-9 rounded-lg text-xs font-black transition ${
                  tab === t.key
                    ? "bg-blue-600 text-white shadow"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {t.label}
                <span className={`ml-1 text-[10px] tabular-nums ${tab === t.key ? "text-blue-100" : "text-zinc-600"}`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {/* 対象区分フィルタ */}
          <div className="flex gap-1.5 mt-2">
            {([
              { key: "all" as const, label: "全員", icon: Users },
              { key: "first" as const, label: "新規来院", icon: UserPlus },
              { key: "repeat" as const, label: "2回目以降", icon: RefreshCw },
            ]).map(f => {
              const Icon = f.icon;
              const active = audience === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setAudience(f.key)}
                  className={`flex items-center gap-1 h-7 px-3 rounded-full text-[11px] font-bold border transition ${
                    active
                      ? "bg-white text-slate-900 border-white"
                      : "bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-600"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── カード一覧 ─── */}
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-3">
        {filteredCourses.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          filteredCourses.map(course => (
            <CouponCard key={course.id} course={course} />
          ))
        )}
      </div>

      {/* ─── フッター注記 ─── */}
      <div className="max-w-2xl mx-auto px-4 pb-12 pt-4 border-t border-zinc-800 text-center space-y-1">
        <p className="text-[11px] text-zinc-600 font-bold">※ 料金は税込表示です</p>
        <p className="text-[11px] text-zinc-600 font-bold">※ 新規限定クーポンは初めてご来院の方が対象です</p>
      </div>
    </div>
  );
}

// ─── カードコンポーネント ─────────────────────────────
function CouponCard({ course }: { course: ReservationCourse }) {
  const aud = audienceOf(course);
  const hasDiscount =
    course.regular_price != null &&
    course.price != null &&
    course.regular_price > course.price;

  return (
    <Link
      href={`/reserve/calendar?courseId=${course.id}`}
      className="block bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-blue-700 active:scale-[0.99] transition-all shadow-lg shadow-black/20"
    >
      <div className="flex gap-3 p-3">
        {/* サムネイル（ホットペッパーは縦長 73x97px。ここでは 96x120 程度） */}
        <div className="relative shrink-0 w-24 h-32 rounded-xl overflow-hidden bg-slate-800">
          {course.image_url ? (
            course.image_url.startsWith("http") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={course.image_url}
                alt={course.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <Image src={course.image_url} alt={course.name} fill className="object-cover" />
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-900 to-slate-900">
              <Sparkles className="w-8 h-8 text-blue-400/40" />
            </div>
          )}

          {/* バッジ重ね（左上） */}
          <div className="absolute top-1 left-1 flex flex-col gap-1">
            {aud === "first" && (
              <span className="bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow">
                新規
              </span>
            )}
            {aud === "repeat" && (
              <span className="bg-purple-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow">
                再来
              </span>
            )}
            {aud === "all" && (
              <span className="bg-emerald-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow">
                全員
              </span>
            )}
          </div>

          {/* %OFFリボン（右上） */}
          {hasDiscount && course.price != null && course.regular_price != null && (
            <div className="absolute top-1 right-1 bg-amber-400 text-slate-900 text-[10px] font-black px-1.5 py-0.5 rounded shadow">
              {formatPercent(course.price, course.regular_price)}
            </div>
          )}
        </div>

        {/* テキスト部分 */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* タイトル＋カスタムバッジ */}
          <div className="flex items-start gap-2 mb-1">
            <h3 className="text-sm font-black text-white leading-snug line-clamp-2 flex-1">
              {course.name}
            </h3>
            {course.badge_label && (
              <span className="shrink-0 flex items-center gap-0.5 bg-blue-500/20 text-blue-300 text-[9px] font-bold px-1.5 py-0.5 rounded border border-blue-500/30">
                <Star className="w-2.5 h-2.5" />
                {course.badge_label}
              </span>
            )}
          </div>

          {/* 説明文 */}
          {course.description && (
            <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2 mb-2">
              {course.description}
            </p>
          )}

          {/* 価格 + 時間 */}
          <div className="mt-auto flex items-end justify-between gap-2 pt-1">
            <div className="flex flex-col">
              {hasDiscount && course.regular_price != null && (
                <span className="text-[10px] text-zinc-500 line-through tabular-nums">
                  通常 ¥{course.regular_price.toLocaleString()}
                </span>
              )}
              {course.price != null ? (
                <div className="flex items-baseline gap-1">
                  <span className={`font-black tabular-nums ${hasDiscount ? "text-amber-400 text-xl" : "text-white text-lg"}`}>
                    ¥{course.price.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-zinc-500">税込</span>
                </div>
              ) : (
                <span className="text-xs text-zinc-500 font-bold">料金 — 要相談</span>
              )}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-zinc-400 bg-zinc-800 px-2 py-1 rounded-md font-bold">
              <Clock className="w-3 h-3" />
              {course.duration_minutes}分
            </div>
          </div>
        </div>
      </div>

      {/* CTA帯 */}
      <div className="border-t border-zinc-800 bg-blue-600/10 hover:bg-blue-600/20 px-4 py-2.5 flex items-center justify-between">
        <span className="text-xs font-black text-blue-300 flex items-center gap-1">
          <Tag className="w-3.5 h-3.5" />
          このメニューで予約する
        </span>
        <span className="text-blue-400 font-black text-sm">→</span>
      </div>
    </Link>
  );
}

// ─── 空状態 ─────────────────────────────
function EmptyState({ tab }: { tab: Tab }) {
  const message =
    tab === "coupon"
      ? "現在公開中のクーポンはありません"
      : tab === "menu"
      ? "メニュー準備中です"
      : "メニューが登録されていません";
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mb-4">
        <Sparkles className="w-7 h-7 text-zinc-600" />
      </div>
      <p className="text-zinc-400 font-bold text-sm mb-1">{message}</p>
      <p className="text-zinc-600 text-xs">条件を変えてもう一度お探しください</p>
    </div>
  );
}
