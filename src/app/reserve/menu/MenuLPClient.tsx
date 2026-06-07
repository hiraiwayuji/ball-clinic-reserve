"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Sparkles,
  Clock,
  Tag,
  Star,
  Users,
  UserPlus,
  RefreshCw,
  X,
  CalendarDays,
  Info,
} from "lucide-react";
import type { ReservationCourse } from "@/app/actions/courses";
import type { PublicClinicSettings, ThemeColor } from "@/app/actions/publicSettings";
import { CLINIC_CONFIG } from "@/lib/clinic-config";
import { getThemeClasses } from "@/lib/lp-theme";
import LPHero from "@/components/reserve/LPHero";

type Tab = "coupon" | "menu" | "all";
type AudienceFilter = "all" | "first" | "repeat";

interface Props {
  initialCourses: ReservationCourse[];
  settings: PublicClinicSettings | null;
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

export default function MenuLPClient({ initialCourses, settings }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [audience, setAudience] = useState<AudienceFilter>("all");
  const [selectedCourse, setSelectedCourse] = useState<ReservationCourse | null>(null);

  const themeColor = settings?.theme_color ?? "blue";
  const theme = getThemeClasses(themeColor);

  // モーダル開いている間は背景スクロールを止める
  useEffect(() => {
    if (selectedCourse) {
      const orig = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = orig;
      };
    }
  }, [selectedCourse]);

  // ESC キーでモーダルを閉じる
  useEffect(() => {
    if (!selectedCourse) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedCourse(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedCourse]);

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
      {/* ─── ヒーロー（最小表示）。サイトに来た時点でメニューは把握済みなので、
              お悩み・強み・口コミは出さず、すぐ下にクーポン/メニューを見せる ─── */}
      <LPHero settings={settings} fallbackName={CLINIC_CONFIG.name} minimal />

      {/* ─── メニュー・クーポン セクション見出し ─── */}
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className={`w-4 h-4 ${theme.accentText}`} />
          <h2 className="text-sm font-black text-white tracking-tight">
            メニュー・クーポン
          </h2>
        </div>
        <Link
          href="/reserve"
          className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-white transition"
        >
          <ArrowLeft className="w-3 h-3" />
          戻る
        </Link>
      </div>

      {/* ─── タブ切替＋対象区分フィルタ ─── */}
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3">
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
                    ? `${theme.ctaBg} text-white shadow`
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {t.label}
                <span className={`ml-1 text-[10px] tabular-nums ${tab === t.key ? "text-white/80" : "text-zinc-300"}`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

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
            <CouponCard
              key={course.id}
              course={course}
              themeColor={themeColor}
              onSelect={() => setSelectedCourse(course)}
            />
          ))
        )}
      </div>

      {/* ─── フッター注記 ─── */}
      <div className="max-w-2xl mx-auto px-4 pb-12 pt-4 border-t border-zinc-800 text-center space-y-1">
        <p className="text-[11px] text-zinc-300 font-bold">※ 料金は税込表示です</p>
        <p className="text-[11px] text-zinc-300 font-bold">※ 新規限定クーポンは初めてご来院の方が対象です</p>
      </div>

      {/* ─── 詳細モーダル ─── */}
      {selectedCourse && (
        <CourseDetailModal
          course={selectedCourse}
          themeColor={themeColor}
          onClose={() => setSelectedCourse(null)}
        />
      )}
    </div>
  );
}

// ─── カードコンポーネント（タップで詳細を開く） ─────────────────────────
function CouponCard({
  course,
  themeColor,
  onSelect,
}: {
  course: ReservationCourse;
  themeColor: ThemeColor;
  onSelect: () => void;
}) {
  const aud = audienceOf(course);
  const theme = getThemeClasses(themeColor);
  const hasDiscount =
    course.regular_price != null &&
    course.price != null &&
    course.regular_price > course.price;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="block w-full text-left bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-zinc-700 active:scale-[0.99] transition-all shadow-lg shadow-black/20"
    >
      <div className="flex gap-3 p-3">
        {/* サムネイル */}
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
          <div className="flex items-start gap-2 mb-1">
            <h3 className="text-sm font-black text-white leading-snug line-clamp-2 flex-1">
              {course.name}
            </h3>
            {course.badge_label && (
              <span className={`shrink-0 flex items-center gap-0.5 ${theme.accentBgSoft} ${theme.accentText} text-[9px] font-bold px-1.5 py-0.5 rounded border ${theme.accentBorderSoft}`}>
                <Star className="w-2.5 h-2.5" />
                {course.badge_label}
              </span>
            )}
          </div>

          {course.description && (
            <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2 mb-2">
              {course.description}
            </p>
          )}

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

      {/* CTA帯（タップで詳細を表示） */}
      <div className={`border-t border-zinc-800 ${theme.accentBgSoft} px-4 py-2.5 flex items-center justify-between`}>
        <span className={`text-xs font-black ${theme.accentText} flex items-center gap-1`}>
          <Info className="w-3.5 h-3.5" />
          タップして詳細を見る
        </span>
        <span className={`${theme.accentText} font-black text-sm`}>→</span>
      </div>
    </button>
  );
}

// ─── 詳細モーダル ────────────────────────────────────────────────
function CourseDetailModal({
  course,
  themeColor,
  onClose,
}: {
  course: ReservationCourse;
  themeColor: ThemeColor;
  onClose: () => void;
}) {
  const aud = audienceOf(course);
  const theme = getThemeClasses(themeColor);
  const hasDiscount =
    course.regular_price != null &&
    course.price != null &&
    course.regular_price > course.price;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="course-detail-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-lg max-h-[92vh] sm:max-h-[88vh] bg-slate-900 sm:rounded-3xl rounded-t-3xl border-t sm:border border-zinc-700 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 閉じるボタン */}
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="absolute top-3 right-3 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 backdrop-blur text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 上部つまみ（モバイルのドラッグハンドル風） */}
        <div className="sm:hidden absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1 bg-white/30 rounded-full pointer-events-none" />

        {/* スクロール可能なコンテンツ */}
        <div className="flex-1 overflow-y-auto pb-32">
          {/* 大きな画像 */}
          <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] bg-slate-800">
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
                <Sparkles className="w-16 h-16 text-blue-400/30" />
              </div>
            )}

            {/* バッジ重ね */}
            <div className="absolute top-3 left-3 flex flex-col gap-1.5">
              {aud === "first" && (
                <span className="bg-rose-500 text-white text-xs font-black px-2.5 py-1 rounded-md shadow-lg">
                  新規限定
                </span>
              )}
              {aud === "repeat" && (
                <span className="bg-purple-500 text-white text-xs font-black px-2.5 py-1 rounded-md shadow-lg">
                  再来限定
                </span>
              )}
              {aud === "all" && (
                <span className="bg-emerald-500 text-white text-xs font-black px-2.5 py-1 rounded-md shadow-lg">
                  全員OK
                </span>
              )}
              {course.badge_label && (
                <span className={`flex items-center gap-1 ${theme.accentBgSoft} ${theme.accentText} text-xs font-bold px-2.5 py-1 rounded-md border ${theme.accentBorderSoft} backdrop-blur`}>
                  <Star className="w-3 h-3 fill-current" />
                  {course.badge_label}
                </span>
              )}
            </div>

            {/* %OFF */}
            {hasDiscount && course.price != null && course.regular_price != null && (
              <div className="absolute top-3 right-16 bg-amber-400 text-slate-900 text-base font-black px-3 py-1.5 rounded-md shadow-lg">
                {formatPercent(course.price, course.regular_price)}
              </div>
            )}
          </div>

          {/* タイトル＋価格＋時間 */}
          <div className="p-5 sm:p-6 space-y-5">
            <div>
              <h2
                id="course-detail-title"
                className="text-xl sm:text-2xl font-black text-white leading-tight tracking-tight"
              >
                {course.name}
              </h2>

              <div className="mt-4 flex items-end justify-between gap-3 flex-wrap">
                <div className="flex flex-col">
                  {hasDiscount && course.regular_price != null && (
                    <span className="text-sm text-zinc-500 line-through tabular-nums">
                      通常 ¥{course.regular_price.toLocaleString()}
                    </span>
                  )}
                  {course.price != null ? (
                    <div className="flex items-baseline gap-1">
                      <span className={`font-black tabular-nums ${hasDiscount ? "text-amber-400 text-3xl sm:text-4xl" : "text-white text-2xl sm:text-3xl"}`}>
                        ¥{course.price.toLocaleString()}
                      </span>
                      <span className="text-sm text-zinc-400 font-bold">税込</span>
                    </div>
                  ) : (
                    <span className="text-base text-zinc-400 font-bold">料金 — 要相談</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-sm text-white bg-zinc-800 border border-zinc-700 px-3 py-2 rounded-lg font-bold">
                  <Clock className="w-4 h-4" />
                  {course.duration_minutes}分
                </div>
              </div>
            </div>

            {/* 区切り線 */}
            <div className="border-t border-zinc-800" />

            {/* 説明文（大きく・全文表示） */}
            {course.description ? (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-2">
                  メニュー詳細
                </p>
                <p className="text-base sm:text-[17px] text-white/90 leading-relaxed whitespace-pre-wrap">
                  {course.description}
                </p>
              </div>
            ) : null}

            {/* メタ情報 */}
            <div className="bg-zinc-800/40 border border-zinc-800 rounded-xl p-4 space-y-2 text-sm text-zinc-300">
              <p className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-zinc-500" />
                所要時間 <span className="font-bold text-white">{course.duration_minutes}分</span>
              </p>
              {aud === "first" && (
                <p className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-rose-400" />
                  対象 <span className="font-bold text-white">新規ご来院の方限定</span>
                </p>
              )}
              {aud === "repeat" && (
                <p className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-purple-400" />
                  対象 <span className="font-bold text-white">2回目以降ご来院の方限定</span>
                </p>
              )}
              {aud === "all" && (
                <p className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  対象 <span className="font-bold text-white">どなたでも</span>
                </p>
              )}
              {hasDiscount && course.regular_price != null && course.price != null && (
                <p className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-amber-400" />
                  通常 ¥{course.regular_price.toLocaleString()} →{" "}
                  <span className="font-bold text-amber-400">¥{course.price.toLocaleString()}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 下部固定の予約CTA */}
        <div className="absolute bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur border-t border-zinc-800 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Link
            href={`/reserve/calendar?courseId=${course.id}`}
            className={`flex items-center justify-center gap-2 w-full h-14 rounded-2xl ${theme.ctaBg} ${theme.ctaHoverBg} active:scale-[0.99] text-white text-base font-black shadow-xl ${theme.ctaShadow} transition-all`}
          >
            <CalendarDays className="w-5 h-5" />
            このメニューで予約する
          </Link>
          <p className="text-center text-[11px] text-zinc-500 mt-2">
            タップすると空き時間カレンダーへ進みます
          </p>
        </div>
      </div>
    </div>
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
      <p className="text-zinc-300 text-xs">条件を変えてもう一度お探しください</p>
    </div>
  );
}
