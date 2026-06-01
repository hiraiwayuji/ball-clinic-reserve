import { NextRequest, NextResponse } from "next/server";
import { pushLineToOwners } from "@/lib/admin-notify";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";

/**
 * 院長（オーナー）宛に LINE で任意メッセージを送る内部用エンドポイント。
 *
 * 用途: 外部の自動化（例: 週次提案PRの新着通知）から、この院の
 * admin_notification_targets / OWNER_LINE_USER_ID 宛に LINE を飛ばす。
 * 送信トークンは本番の getLineAccessToken()（client_credentials）を使うので、
 * 呼び出し側は LINE トークンを一切持つ必要がない（失効に強い）。
 *
 * 認証: 既存 cron と同じ REMIND_SECRET を流用。
 * POST body: { "secret": "...", "text": "送りたい本文" }
 */
export async function POST(req: NextRequest) {
  const { secret, text } = await req.json().catch(() => ({ secret: "", text: "" }));

  // REMIND_SECRET は Vercel env 由来で末尾に改行が混入することがあるため
  // 両辺を trim して比較する（過去の「env 末尾改行」事故対策）。
  const expected = (process.env.REMIND_SECRET || "").trim();
  if (!expected || String(secret ?? "").trim() !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!text || typeof text !== "string") {
    return NextResponse.json({ ok: false, error: "text is required" }, { status: 400 });
  }

  try {
    await pushLineToOwners(PUBLIC_CLINIC_ID, text);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
