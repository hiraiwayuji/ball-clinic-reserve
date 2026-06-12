/**
 * クリニックブランディング設定
 * 環境変数で上書き可能。未設定時はボール接骨院（デフォルト）の値を使用。
 */

export const CLINIC_CONFIG = {
  name: process.env.NEXT_PUBLIC_CLINIC_NAME ?? "ボール接骨院",
  nameShort: process.env.NEXT_PUBLIC_CLINIC_NAME_SHORT ?? "ボール接骨院",
  catchcopy: process.env.NEXT_PUBLIC_CLINIC_CATCHCOPY ?? "痛み根本改善、パフォーマンス向上をサポート",
  description: process.env.NEXT_PUBLIC_CLINIC_DESCRIPTION ?? "プロスポーツ経験のある院長が、一人ひとりの身体の状態に合わせた最適なトータルボディケアを提供します。",
  phone: process.env.NEXT_PUBLIC_CLINIC_PHONE ?? "088-635-5344",
  address: process.env.NEXT_PUBLIC_CLINIC_ADDRESS ?? "徳島県板野郡藍住町",
  mapsUrl: process.env.NEXT_PUBLIC_CLINIC_MAPS_URL ?? "https://maps.app.goo.gl/y8zBCQGFiWgS4SXv6",
  /** 外部URL（relaqなど）または /images/xxx.png（ローカル）*/
  logoUrl: process.env.NEXT_PUBLIC_CLINIC_LOGO_URL ?? "/images/logo_main_mini_white.png",
  logoSmallUrl: process.env.NEXT_PUBLIC_CLINIC_LOGO_SMALL_URL ?? "/images/logo-white.png",
  /** ロゴ画像にクリニック名テキストが含まれる場合 true → 隣のテキストを非表示 */
  usesWordmarkLogo: process.env.NEXT_PUBLIC_CLINIC_USES_WORDMARK_LOGO === "true",
  /** カスタムロゴが設定されているか（ボール接骨院デフォルト以外） */
  hasCustomLogo: !!process.env.NEXT_PUBLIC_CLINIC_LOGO_SMALL_URL,
  /** ボール接骨院本体のデプロイかどうか（他院ではロゴマークを使用禁止） */
  isDefaultClinic: !process.env.NEXT_PUBLIC_CLINIC_NAME,
  /** 営業時間（1行目・2行目・休診日） */
  hoursLine1: process.env.NEXT_PUBLIC_CLINIC_HOURS_1 ?? "月・火・木・金: 12:00 ～ 23:00（最終受付 22:30）",
  hoursLine2: process.env.NEXT_PUBLIC_CLINIC_HOURS_2 ?? "土: 10:00 ～ 18:00（最終受付 17:30）",
  hoursClosed: process.env.NEXT_PUBLIC_CLINIC_HOURS_CLOSED ?? "※水・日・祝日は休診",
  /** AI 秘書がオーナーを呼ぶ呼びかけ名（ボール接骨院: "ぼーるくん"、からだ: "藤川先生" 等） */
  ownerNickname: process.env.NEXT_PUBLIC_CLINIC_OWNER_NICKNAME ?? "院長先生",
  /** 患者向け予約ページのテーマ。"warm" でHP寄りの明るい暖色（からだ等）。既定は従来の濃紺ダーク。 */
  reserveTheme: process.env.NEXT_PUBLIC_RESERVE_THEME ?? "dark",
} as const;
