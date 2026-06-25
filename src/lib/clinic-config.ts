/**
 * クリニックブランディング設定
 * 環境変数で上書き可能。
 *
 * ★重要★ 「ボール接骨院」へのフォールバックは **ボール本体のデプロイ（clinic_id 一致）** のときだけ。
 * 他院は env が一部未設定でも、絶対に「ボール接骨院」の名前・ロゴを出さない（中立フォールバック）。
 * これにより NAME 等の env 設定漏れで他院がボール化する事故を構造的に防ぐ。
 */

/** ボール接骨院本体の clinic_id（固定） */
const BALL_CLINIC_ID = "00000000-0000-0000-0000-000000000001";
/** この稼働がボール本体か＝CLINIC_ID で判定（NAME 未設定でも他院がボール化しない） */
const IS_BALL =
  (process.env.NEXT_PUBLIC_CLINIC_ID ?? BALL_CLINIC_ID) === BALL_CLINIC_ID;

/** ボール本体だけ ball を、それ以外は中立値を返すフォールバック */
const ball = <T,>(ballValue: T, otherValue: T): T => (IS_BALL ? ballValue : otherValue);

export const CLINIC_CONFIG = {
  name: process.env.NEXT_PUBLIC_CLINIC_NAME ?? ball("ボール接骨院", "当院"),
  nameShort: process.env.NEXT_PUBLIC_CLINIC_NAME_SHORT ?? ball("ボール接骨院", "当院"),
  catchcopy: process.env.NEXT_PUBLIC_CLINIC_CATCHCOPY ?? ball("痛み根本改善、パフォーマンス向上をサポート", ""),
  description: process.env.NEXT_PUBLIC_CLINIC_DESCRIPTION ?? ball("プロスポーツ経験のある院長が、一人ひとりの身体の状態に合わせた最適なトータルボディケアを提供します。", ""),
  phone: process.env.NEXT_PUBLIC_CLINIC_PHONE ?? ball("088-635-5344", ""),
  address: process.env.NEXT_PUBLIC_CLINIC_ADDRESS ?? ball("徳島県板野郡藍住町", ""),
  mapsUrl: process.env.NEXT_PUBLIC_CLINIC_MAPS_URL ?? ball("https://maps.app.goo.gl/y8zBCQGFiWgS4SXv6", ""),
  /** 外部URL（relaqなど）または /images/xxx.png（ローカル）。他院でカスタム未設定なら空＝ボールロゴを出さない */
  logoUrl: process.env.NEXT_PUBLIC_CLINIC_LOGO_URL ?? ball("/images/logo_main_mini_white.png", ""),
  logoSmallUrl: process.env.NEXT_PUBLIC_CLINIC_LOGO_SMALL_URL ?? ball("/images/logo-white.png", ""),
  /** ロゴ画像にクリニック名テキストが含まれる場合 true → 隣のテキストを非表示 */
  usesWordmarkLogo: process.env.NEXT_PUBLIC_CLINIC_USES_WORDMARK_LOGO === "true",
  /** カスタムロゴが設定されているか（ボール接骨院デフォルト以外） */
  hasCustomLogo: !!process.env.NEXT_PUBLIC_CLINIC_LOGO_SMALL_URL,
  /** ボール接骨院本体のデプロイかどうか（clinic_id 基準。他院ではボールのロゴマークを絶対に出さない） */
  isDefaultClinic: IS_BALL,
  /** 営業時間（1行目・2行目・休診日） */
  hoursLine1: process.env.NEXT_PUBLIC_CLINIC_HOURS_1 ?? ball("月・火・木・金: 12:00 ～ 23:00（最終受付 22:30）", ""),
  hoursLine2: process.env.NEXT_PUBLIC_CLINIC_HOURS_2 ?? ball("土: 10:00 ～ 18:00（最終受付 17:30）", ""),
  hoursClosed: process.env.NEXT_PUBLIC_CLINIC_HOURS_CLOSED ?? ball("※水・日・祝日は休診", ""),
  /** AI 秘書がオーナーを呼ぶ呼びかけ名（ボール接骨院: "ぼーるくん"、からだ: "藤川先生" 等） */
  ownerNickname: process.env.NEXT_PUBLIC_CLINIC_OWNER_NICKNAME ?? ball("ぼーるくん", "院長先生"),
  /** 患者向け予約ページのテーマ。"warm" でHP寄りの明るい暖色（からだ等）、"light" で白背景＋黒文字。既定は従来の濃紺ダーク。 */
  reserveTheme: process.env.NEXT_PUBLIC_RESERVE_THEME ?? "dark",
} as const;
