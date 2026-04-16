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
} as const;
