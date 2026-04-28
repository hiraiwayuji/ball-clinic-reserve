import type { ThemeColor } from "@/app/actions/publicSettings";

/**
 * Tailwind v4 は動的クラス名を検出できないため、
 * 各テーマ色のクラスを明示的に羅列する。
 * クラス文字列はビルド時にスキャンされて必ず JIT に含まれる。
 */
export type ThemeClasses = {
  /** ヒーロー背景グラデーション（暗→クリニック色） */
  heroGradient: string;
  /** メインCTAボタン */
  ctaBg: string;
  ctaHoverBg: string;
  ctaShadow: string;
  /** アクセント文字色（タブのアクティブなど） */
  accentText: string;
  /** アクセント背景の薄バージョン（バナー） */
  accentBgSoft: string;
  accentBorderSoft: string;
  /** ハイライトリング（選択中） */
  ringActive: string;
  /** リード文字色（ダーク背景） */
  leadText: string;
};

const THEMES: Record<ThemeColor, ThemeClasses> = {
  blue: {
    heroGradient: "from-blue-900 via-blue-950 to-slate-950",
    ctaBg: "bg-blue-600",
    ctaHoverBg: "hover:bg-blue-500",
    ctaShadow: "shadow-blue-950",
    accentText: "text-blue-300",
    accentBgSoft: "bg-blue-500/10",
    accentBorderSoft: "border-blue-500/30",
    ringActive: "ring-blue-500",
    leadText: "text-blue-200",
  },
  violet: {
    heroGradient: "from-violet-900 via-violet-950 to-slate-950",
    ctaBg: "bg-violet-600",
    ctaHoverBg: "hover:bg-violet-500",
    ctaShadow: "shadow-violet-950",
    accentText: "text-violet-300",
    accentBgSoft: "bg-violet-500/10",
    accentBorderSoft: "border-violet-500/30",
    ringActive: "ring-violet-500",
    leadText: "text-violet-200",
  },
  emerald: {
    heroGradient: "from-emerald-900 via-emerald-950 to-slate-950",
    ctaBg: "bg-emerald-600",
    ctaHoverBg: "hover:bg-emerald-500",
    ctaShadow: "shadow-emerald-950",
    accentText: "text-emerald-300",
    accentBgSoft: "bg-emerald-500/10",
    accentBorderSoft: "border-emerald-500/30",
    ringActive: "ring-emerald-500",
    leadText: "text-emerald-200",
  },
  amber: {
    heroGradient: "from-amber-800 via-amber-950 to-slate-950",
    ctaBg: "bg-amber-500",
    ctaHoverBg: "hover:bg-amber-400",
    ctaShadow: "shadow-amber-950",
    accentText: "text-amber-300",
    accentBgSoft: "bg-amber-500/10",
    accentBorderSoft: "border-amber-500/30",
    ringActive: "ring-amber-500",
    leadText: "text-amber-200",
  },
  orange: {
    heroGradient: "from-orange-700 via-orange-950 to-slate-950",
    ctaBg: "bg-orange-500",
    ctaHoverBg: "hover:bg-orange-400",
    ctaShadow: "shadow-orange-950",
    accentText: "text-orange-300",
    accentBgSoft: "bg-orange-500/10",
    accentBorderSoft: "border-orange-500/30",
    ringActive: "ring-orange-500",
    leadText: "text-orange-200",
  },
  rose: {
    heroGradient: "from-rose-900 via-rose-950 to-slate-950",
    ctaBg: "bg-rose-600",
    ctaHoverBg: "hover:bg-rose-500",
    ctaShadow: "shadow-rose-950",
    accentText: "text-rose-300",
    accentBgSoft: "bg-rose-500/10",
    accentBorderSoft: "border-rose-500/30",
    ringActive: "ring-rose-500",
    leadText: "text-rose-200",
  },
  sky: {
    heroGradient: "from-sky-900 via-sky-950 to-slate-950",
    ctaBg: "bg-sky-600",
    ctaHoverBg: "hover:bg-sky-500",
    ctaShadow: "shadow-sky-950",
    accentText: "text-sky-300",
    accentBgSoft: "bg-sky-500/10",
    accentBorderSoft: "border-sky-500/30",
    ringActive: "ring-sky-500",
    leadText: "text-sky-200",
  },
  teal: {
    heroGradient: "from-teal-900 via-teal-950 to-slate-950",
    ctaBg: "bg-teal-600",
    ctaHoverBg: "hover:bg-teal-500",
    ctaShadow: "shadow-teal-950",
    accentText: "text-teal-300",
    accentBgSoft: "bg-teal-500/10",
    accentBorderSoft: "border-teal-500/30",
    ringActive: "ring-teal-500",
    leadText: "text-teal-200",
  },
  indigo: {
    heroGradient: "from-indigo-900 via-indigo-950 to-slate-950",
    ctaBg: "bg-indigo-600",
    ctaHoverBg: "hover:bg-indigo-500",
    ctaShadow: "shadow-indigo-950",
    accentText: "text-indigo-300",
    accentBgSoft: "bg-indigo-500/10",
    accentBorderSoft: "border-indigo-500/30",
    ringActive: "ring-indigo-500",
    leadText: "text-indigo-200",
  },
};

export function getThemeClasses(color: ThemeColor): ThemeClasses {
  return THEMES[color] ?? THEMES.blue;
}
