import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const REMIND_SECRET = process.env.REMIND_SECRET || "";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

async function pushLine(userId: string, text: string, token: string) {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to: userId, messages: [{ type: "text", text }] }),
  });
  return res.ok;
}

/**
 * 自動当日リマインド配信エンドポイント
 * Vercel Cron または外部から呼ばれる
 * clinic_settings の auto_remind_enabled / auto_remind_time を確認して実行
 */
export async function POST(req: NextRequest) {
  const { secret } = await req.json().catch(() => ({}));
  if (!REMIND_SECRET || secret !== REMIND_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getAdminSupabase();
  const DEFAULT_CLINIC_ID = "00000000-0000-0000-0000-000000000001";

  // 設定を取得
  const { data: settings } = await supabase
    .from("clinic_settings")
    .select("auto_remind_enabled, auto_remind_time, line_channel_access_token")
    .eq("id", DEFAULT_CLINIC_ID)
    .maybeSingle();

  if (!settings?.auto_remind_enabled) {
    return NextResponse.json({ status: "skipped", reason: "auto remind disabled" });
  }

  // Vercel Hobby plan: cron fires once/day at 23:00 UTC = 8:00 JST
  // Pro plan users can set auto_remind_time and use a more frequent cron
  const now = new Date();
  const jstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));

  const channelToken = settings.line_channel_access_token || process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelToken) {
    return NextResponse.json({ error: "LINE token not configured" }, { status: 500 });
  }

  // 本日の予約を取得
  const todayStr = `${jstNow.getFullYear()}-${String(jstNow.getMonth() + 1).padStart(2, "0")}-${String(jstNow.getDate()).padStart(2, "0")}`;
  const dayStart = `${todayStr}T00:00:00+09:00`;
  const dayEnd = `${todayStr}T23:59:59+09:00`;

  const { data: appointments } = await supabase
    .from("appointments")
    .select("*, customers(name, line_user_id)")
    .eq("clinic_id", DEFAULT_CLINIC_ID)
    .gte("start_time", dayStart)
    .lte("start_time", dayEnd)
    .neq("status", "cancelled");

  const results = [];
  for (const apt of appointments || []) {
    const customer = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
    if (!customer?.line_user_id) continue;

    const timeStr = new Date(apt.start_time).toLocaleTimeString("ja-JP", {
      timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit",
    });
    const msg = `${customer.name}様\n\nこんにちは！ボール接骨院です。\n本日 ${timeStr} からご予約を頂いております。\nお気を付けてお越しください！`;

    const ok = await pushLine(customer.line_user_id, msg, channelToken);
    results.push({ name: customer.name, time: timeStr, sent: ok });
  }

  return NextResponse.json({ status: "ok", count: results.length, results });
}

// Vercel Cron からのGETも受け付ける（cron jobはGETで叩く場合がある）
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  return POST(new NextRequest(req.url, {
    method: "POST",
    body: JSON.stringify({ secret }),
    headers: { "Content-Type": "application/json" },
  }));
}
