/**
 * APP_MODE feature flag
 *
 * CLINIC      - 接骨院管理システム（フル機能）
 * FAMILY_GIFT - 家族カレンダー専用モード（接骨院業務機能を非表示）
 * DEMO        - デモ/検証モード（ログイン自動入力・書き込み制限あり）
 *
 * 配布先では .env.local の NEXT_PUBLIC_APP_MODE=FAMILY_GIFT と
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY を別インスタンスに差し替えることで
 * データを完全に分離できます。
 *
 * DB分離のための環境変数:
 *   NEXT_PUBLIC_SUPABASE_URL       - Supabase プロジェクト URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  - Supabase 匿名キー
 *   SUPABASE_SERVICE_ROLE_KEY      - Supabase サービスロールキー（サーバーサイドのみ）
 */

export type AppMode = "CLINIC" | "FAMILY_GIFT" | "DEMO";

export const APP_MODE: AppMode =
  (process.env.NEXT_PUBLIC_APP_MODE as AppMode) || "CLINIC";

export const isFamilyGift = APP_MODE === "FAMILY_GIFT";
export const isClinic = APP_MODE === "CLINIC";
export const isDemo = APP_MODE === "DEMO";

/** CLINICまたはDEMOモード（接骨院UIを表示） */
export const showClinicUI = isClinic || isDemo;

export const APP_TITLE = isFamilyGift
  ? "家族カレンダー by V-ARC"
  : "V-ARC";

export const APP_SUBTITLE = isFamilyGift
  ? "Family Calendar"
  : isDemo
  ? "Demo Mode"
  : "AI Secretary System";
