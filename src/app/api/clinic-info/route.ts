/**
 * 公開クリニック識別エンドポイント（監視用）。
 *
 * 目的:
 *   各院は同一リポジトリの別 Vercel プロジェクトで、NEXT_PUBLIC_CLINIC_* (ビルド時埋め込み)
 *   だけで区別している。env が未設定/誤りのままデプロイされると、公開サイトが
 *   ボール接骨院(デフォルト)へ「サイレントにフォールバック」し、他院のはずのドメインで
 *   ボールが表示され、予約データもボールの clinic_id に入ってしまう事故が起きる。
 *
 *   このエンドポイントは「このデプロイがどの院として焼き込まれているか」を返す。
 *   post-deploy-smoke / verify-clinic-identity / 朝のヘルスチェックが、各ドメインの
 *   期待クリニックと突き合わせて、フォールバックを即検知するために使う。
 *
 * 認証なし・副作用なし（env を読むだけ。clinic_id はクライアントバンドルにも入っており秘匿情報ではない）。
 */
import { NextResponse } from "next/server";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const envName = process.env.NEXT_PUBLIC_CLINIC_NAME ?? "";
  const isDefault = !envName; // NEXT_PUBLIC_CLINIC_NAME 未設定 = ボール接骨院(デフォルト)
  return NextResponse.json(
    {
      clinicId: PUBLIC_CLINIC_ID,
      clinicName: envName || "ボール接骨院",
      clinicNameShort: process.env.NEXT_PUBLIC_CLINIC_NAME_SHORT ?? (envName || "ボール接骨院"),
      isDefault,
      // env の整合性: NAME と ID の両方が想定どおり埋め込まれているか
      hasClinicIdEnv: !!process.env.NEXT_PUBLIC_CLINIC_ID,
      hasClinicNameEnv: !!process.env.NEXT_PUBLIC_CLINIC_NAME,
      time: new Date().toISOString(),
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
