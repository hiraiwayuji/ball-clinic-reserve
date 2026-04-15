/**
 * APP_MODE feature flag
 *
 * CLINIC      - 接骨院管理システム（フル機能）
 * FAMILY_GIFT - 家族カレンダー専用モード（接骨院業務機能を非表示）
 *
 * 配布先では .env.local の NEXT_PUBLIC_APP_MODE=FAMILY_GIFT と
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY を別インスタンスに差し替えることで
 * データを完全に分離できます。
 */

export type AppMode = "CLINIC" | "FAMILY_GIFT";

export const APP_MODE: AppMode =
  (process.env.NEXT_PUBLIC_APP_MODE as AppMode) || "CLINIC";

export const isFamilyGift = APP_MODE === "FAMILY_GIFT";
export const isClinic = APP_MODE === "CLINIC";

export const APP_TITLE = isFamilyGift ? "家族カレンダー by V-ARC" : "V-ARC";
export const APP_SUBTITLE = isFamilyGift ? "Family Calendar" : "AI Secretary System";
