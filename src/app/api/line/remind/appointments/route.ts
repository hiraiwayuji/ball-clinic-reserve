import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pushLineText } from "@/lib/admin-notify";
import { reminderMessage } from "@/lib/marketing-templates";
import { CLINIC_CONFIG } from "@/lib/clinic-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REMIND_SECRET = process.env.REMIND_SECRET || "";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

/**
 * 認可。Vercel Cron は CRON_SECRET を Authorization: Bearer で自動付与する（他のcronと同じ方式）。
 * 手動実行や外部スケジューラ向けに ?secret= / body.secret（REMIND_SECRET）も受ける。
 *
 * ※以前は vercel.json が "?secret=REMIND_SECRET_PLACEHOLDER" という
 *   プレースホルダのまま cron を叩いていたため、毎回401で一度も動いていなかった。
 */
function isAuthorized(req: NextRequest, bodySecret?: string): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const given = bodySecret ?? req.nextUrl.searchParams.get("secret") ?? "";
  return Boolean(REMIND_SECRET) && given === REMIND_SECRET;
}

/**
 * 自動当日リマインド配信エンドポイント
 * Vercel Cron（毎日 09:00 JST = 00:00 UTC）から GET で呼ばれる。
 * clinic_settings.auto_remind_enabled が true の院だけ送信する（既定OFF）。
 */
export async function POST(req: NextRequest) {
  const { secret } = await req.json().catch(() => ({}));
  if (!isAuthorized(req, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getAdminSupabase();
  const DEFAULT_CLINIC_ID = process.env.NEXT_PUBLIC_CLINIC_ID ?? "00000000-0000-0000-0000-000000000001";

  // 設定を取得
  const { data: settings } = await supabase
    .from("clinic_settings")
    .select("auto_remind_enabled, auto_remind_time, line_channel_access_token, clinic_name")
    .eq("id", DEFAULT_CLINIC_ID)
    .maybeSingle();

  // 患者に届く文面の院名は DB → env の順で解決（ベタ書き禁止＝他院にボール名で届く事故防止）
  const clinicName = settings?.clinic_name || CLINIC_CONFIG.name;

  if (!settings?.auto_remind_enabled) {
    return NextResponse.json({ status: "skipped", reason: "auto remind disabled" });
  }

  // 送信時刻は vercel.json の cron だけで決まる。auto_remind_time は画面表示用で、
  // ここでは使っていない（2026-08-23 検品指摘。資料に書くときは混同しないこと）。
  const now = new Date();
  const jstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));

  // 送信は共通経路 pushLineText（発行トークン優先・認証エラー時のみフォールバック）に統一。
  // 以前は院設定の保存トークンを最優先しており、古い値が残っていると全滅していた。

  // 本日の予約を取得
  const todayStr = `${jstNow.getFullYear()}-${String(jstNow.getMonth() + 1).padStart(2, "0")}-${String(jstNow.getDate()).padStart(2, "0")}`;
  const dayStart = `${todayStr}T00:00:00+09:00`;
  const dayEnd = `${todayStr}T23:59:59+09:00`;

  const { data: appointments } = await supabase
    .from("appointments")
    .select("*, customers(id, name, display_name, line_user_id)")
    .eq("clinic_id", DEFAULT_CLINIC_ID)
    .gte("start_time", dayStart)
    .lte("start_time", dayEnd)
    .neq("status", "cancelled");

  const results = [];
  for (const apt of appointments || []) {
    const customer = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
    if (!customer?.id) continue;

    // この customer に紐付く全 LINE userId を取得（家族紐付け対応・自院のみ）
    const { data: links } = await supabase
      .from("customer_line_links")
      .select("line_user_id")
      .eq("clinic_id", DEFAULT_CLINIC_ID)
      .eq("customer_id", customer.id);
    const lineIds = Array.from(
      new Set(
        [
          ...(links ?? []).map((r: { line_user_id: string }) => r.line_user_id),
          customer.line_user_id,
        ].filter((v): v is string => Boolean(v)),
      ),
    );
    if (lineIds.length === 0) continue;

    const timeStr = new Date(apt.start_time).toLocaleTimeString("ja-JP", {
      timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit",
    });
    const displayName = customer.display_name ?? customer.name;
    const msg = reminderMessage(clinicName, displayName, timeStr);

    for (const lineId of lineIds) {
      const push = await pushLineText(lineId, msg, DEFAULT_CLINIC_ID);
      results.push({ name: displayName, time: timeStr, sent: push.ok, detail: push.detail });
    }
  }

  return NextResponse.json({ status: "ok", count: results.length, results });
}

// Vercel Cron からのGETも受け付ける（cron jobはGETで叩く場合がある）
export async function GET(req: NextRequest) {
  // Vercel Cron は GET を `Authorization: Bearer $CRON_SECRET` で呼ぶ。
  // 以前はここで新しい NextRequest を組み立てており、その Authorization が落ちて
  // POST 側の認証を通らず 401 になっていた（2026-08-23 検品指摘）。
  // 全院 auto_remind_enabled=false だったので表面化していなかっただけ。
  const secret = req.nextUrl.searchParams.get("secret");
  return POST(new NextRequest(req.url, {
    method: "POST",
    body: JSON.stringify({ secret }),
    headers: {
      "Content-Type": "application/json",
      authorization: req.headers.get("authorization") ?? "",
    },
  }));
}
