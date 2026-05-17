import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

// 朝の本番アクセス前 (7:00 JST) に Supabase Auth API + Postgres を一度叩いて
// cold start を解消する。これで 8:00 開院時の /admin/counter が cold で
// もたつくのを原理的に防ぐ。

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  // CRON_SECRET があれば Bearer / query secret のどちらでも許可。
  // 未設定なら Vercel Cron 由来 (user-agent: vercel-cron) のみ許可。
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth === `Bearer ${cronSecret}`) return true;
    const querySecret = req.nextUrl.searchParams.get("secret");
    if (querySecret === cronSecret) return true;
    return false;
  }
  const ua = req.headers.get("user-agent") ?? "";
  return ua.includes("vercel-cron");
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase env missing" }, { status: 500 });
  }

  const started = Date.now();

  // 1) Postgres 側を温める: 軽量 SELECT を 1 発打って connection pool を起こす
  let dbMs: number | null = null;
  let dbError: string | null = null;
  try {
    const t = Date.now();
    const db = createAdminClient(url, key, { auth: { persistSession: false } });
    await db.from("clinic_settings").select("id").limit(1);
    dbMs = Date.now() - t;
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
    console.error("[keepalive] db ping failed:", err);
  }

  // 2) Auth API を温める: GoTrue の settings エンドポイントは認証不要かつ軽量
  let authMs: number | null = null;
  let authError: string | null = null;
  if (anonKey) {
    try {
      const t = Date.now();
      await fetch(`${url}/auth/v1/settings`, {
        method: "GET",
        headers: { apikey: anonKey },
        cache: "no-store",
      });
      authMs = Date.now() - t;
    } catch (err) {
      authError = err instanceof Error ? err.message : String(err);
      console.error("[keepalive] auth ping failed:", err);
    }
  }

  return NextResponse.json({
    ok: dbError === null && authError === null,
    totalMs: Date.now() - started,
    dbMs,
    authMs,
    dbError,
    authError,
    at: new Date().toISOString(),
  });
}
