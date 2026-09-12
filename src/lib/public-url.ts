/**
 * 患者さん・スタッフのスマホに送るリンクの土台URLを決める。
 *
 * 🚨 ここを間違えると「送ったリンクを相手が開けない」事故になる。
 *
 * 背景（2026-09-12 からだ鍼灸整骨院で発覚）:
 *   トレーニング評価のレポートを患者さんへLINEで送っていたが、リンクを開くと
 *   Vercelのログイン画面が出て**誰も読めていなかった**。
 *   原因は `VERCEL_URL` へのフォールバック。`VERCEL_URL` は
 *   「そのデプロイ固有のURL」(例: karada-clinic-a1b2c3-xxx.vercel.app) で、
 *   Vercel の Deployment Protection の対象になるため、ログインしないと開けない。
 *   本番ドメイン (karada-clinic.vercel.app) は誰でも開ける。
 *
 * 優先順位:
 *   1. NEXT_PUBLIC_APP_URL          … 院ごとに明示設定（独自ドメインがあるならこれ）
 *   2. VERCEL_PROJECT_PRODUCTION_URL … Vercelが入れる「本番ドメイン」。保護されない
 *   3. VERCEL_URL                    … 最後の手段。保護対象なので外部の人には配らない
 *   4. http://localhost:3000         … ローカル開発
 */

/** 外部（患者さん・スタッフ）に配ってよい公開URLの土台。末尾スラッシュなし。 */
export function publicBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  // Vercel が自動で入れる本番ドメイン（デプロイ固有URLと違い保護されない）
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod) return `https://${prod.replace(/\/$/, "")}`;

  // デプロイ固有URL。Deployment Protection が有効だと開けないので、
  // 外部に配るリンクとしては本来使いたくない（最後の手段）。
  const deployUrl = process.env.VERCEL_URL?.trim();
  if (deployUrl) return `https://${deployUrl.replace(/\/$/, "")}`;

  return "http://localhost:3000";
}
