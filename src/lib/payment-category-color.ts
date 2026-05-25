/**
 * 支払区分（payment_categories.key）ごとの色定義。
 *
 * Tailwind は JIT で使用済みクラス名を検出するため、ここでは "bg-blue-500" の
 * ように完全なクラス名を文字列リテラルで列挙する。動的補間（`bg-${color}-500`）
 * は purge されるので不可。
 *
 * 標準7区分（is_system=true もしくは標準扱い）は決め打ち。
 * 院独自カテゴリ（鍼灸・トレーニング 等）には fallback の teal を使う。
 */
export type PaymentCategoryColor = {
  /** 選択中ボタン: 塗りつぶし */
  selected: string;
  /** 未選択ボタン: 淡色塗り＋色枠 */
  unselected: string;
  /** 売上一覧の小さなバッジ */
  badge: string;
};

const COLOR_MAP: Record<string, PaymentCategoryColor> = {
  // 保険施術 — 青
  hoken: {
    selected: "bg-blue-500 border-blue-600 text-white shadow-sm",
    unselected: "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  // 自費施術 — 緑
  jihi: {
    selected: "bg-emerald-500 border-emerald-600 text-white shadow-sm",
    unselected: "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  // 医療助成 — 紫
  hagukumi: {
    selected: "bg-violet-500 border-violet-600 text-white shadow-sm",
    unselected: "bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
  // 自賠責/労災 — 橙
  jibaiseki: {
    selected: "bg-orange-500 border-orange-600 text-white shadow-sm",
    unselected: "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100",
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  },
  // 関係者 — 水色
  kankeisha: {
    selected: "bg-sky-500 border-sky-600 text-white shadow-sm",
    unselected: "bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100",
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  },
  // はりきゅう助成券 — 桃
  harikyu_josei: {
    selected: "bg-pink-500 border-pink-600 text-white shadow-sm",
    unselected: "bg-pink-50 border-pink-200 text-pink-700 hover:bg-pink-100",
    badge: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  },
  // その他 — 灰
  other: {
    selected: "bg-slate-500 border-slate-600 text-white shadow-sm",
    unselected: "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100",
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
};

// 院独自カテゴリ用の fallback（teal）
const FALLBACK: PaymentCategoryColor = {
  selected: "bg-teal-500 border-teal-600 text-white shadow-sm",
  unselected: "bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100",
  badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
};

export function getPaymentCategoryColor(key: string | null | undefined): PaymentCategoryColor {
  if (!key) return FALLBACK;
  return COLOR_MAP[key] ?? FALLBACK;
}
