// シフト表で使うスタッフ色のプリセット定義。
// "use server" ファイルからは object/constant を export できないため、
// このファイル（client/server 共有可）に分離する。

export const STAFF_COLOR_PRESETS = {
  blue:   "#2563EB",  // 青 = 平岡 など
  green:  "#16A34A",
  yellow: "#EAB308",
  pink:   "#EC4899",
  orange: "#F97316",
  red:    "#DC2626",
  purple: "#9333EA",
  teal:   "#0D9488",
  gray:   "#6B7280",
} as const;

export type StaffColorKey = keyof typeof STAFF_COLOR_PRESETS;
