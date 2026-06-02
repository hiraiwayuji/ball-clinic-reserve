#!/usr/bin/env node
/**
 * ビルド時クリニックenvガード（監査係）。
 *
 * 各院は同一リポジトリの別Vercelで NEXT_PUBLIC_CLINIC_ID（ビルド時埋め込み）だけで区別する。
 * これが未設定のままデプロイされると、公開サイトがボール接骨院(default)へサイレント・
 * フォールバックし、他院ドメインがボール化＋予約データがボールに入る事故になる。
 *
 * → 本番(Vercel)ビルドで NEXT_PUBLIC_CLINIC_ID が空なら **ビルドを失敗** させる。
 *   失敗すると Vercel は直前の正常デプロイを維持するため、他院がボールに化けることはない。
 *   （ローカルビルドでは警告のみで続行）
 */

const id = (process.env.NEXT_PUBLIC_CLINIC_ID ?? "").trim();
const name = (process.env.NEXT_PUBLIC_CLINIC_NAME ?? "").trim();
const isVercelProd =
  process.env.VERCEL === "1" || process.env.VERCEL_ENV === "production";

if (!id) {
  if (isVercelProd) {
    console.error("❌ [check-clinic-env] NEXT_PUBLIC_CLINIC_ID が未設定です。");
    console.error("   ボールへのサイレント・フォールバック事故を防ぐため、ビルドを中止します。");
    console.error("   この院の Vercel プロジェクト env に NEXT_PUBLIC_CLINIC_ID を設定してください。");
    console.error("   （ボール本体も明示設定: 00000000-0000-0000-0000-000000000001）");
    process.exit(1);
  }
  console.warn("⚠️ [check-clinic-env] NEXT_PUBLIC_CLINIC_ID 未設定（ローカルビルドのため続行。本番では必須）");
} else {
  // name が空＝ボール(デフォルト)。name 有り＝非ボール院。整合だけ軽く表示。
  console.log(`✅ [check-clinic-env] NEXT_PUBLIC_CLINIC_ID=${id}${name ? ` / NAME=${name}` : " (default=ボール接骨院)"}`);
}
