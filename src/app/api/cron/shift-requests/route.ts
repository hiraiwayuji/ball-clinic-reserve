import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { pushLineToOwners, sendEmailTo } from "@/lib/admin-notify";

// 出勤希望アンケートの自動運用（Vercel Cron: 毎日 9:00 JST = 0:00 UTC）。
// - 翌月分を「1ヶ月前（毎月1日）」に開始 → 院長LINEで案内＋スタッフへメール（ベストエフォート）
// - 締切＝翌月開始の2週間前。締切の 7/3/1日前・当日に未提出者へリマインド＋院長へ未提出報告
// クリニック識別はビルド時 env（各院デプロイが自院だけ処理）。clinic_settings.shift_request_enabled=true の院のみ。
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CLINIC_ID = process.env.NEXT_PUBLIC_CLINIC_ID ?? "00000000-0000-0000-0000-000000000001";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}` || req.nextUrl.searchParams.get("secret") === secret;
}

function todayJST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
// YYYY-MM-DD の日数加減（カレンダー日付のみ・JST想定でTZズレ無し）
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return ymd(new Date(Date.UTC(y, m - 1, d + days)));
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "supabase env missing" }, { status: 500 });
  const db = createAdminClient(url, key, { auth: { persistSession: false } });

  // この院で出勤アンケート運用がONか
  const { data: settings } = await db
    .from("clinic_settings").select("shift_request_enabled, clinic_name")
    .eq("id", CLINIC_ID).maybeSingle();
  if (!settings?.shift_request_enabled) {
    return NextResponse.json({ ok: true, clinic: CLINIC_ID, skipped: "shift_request_disabled" });
  }
  const clinicName = (settings.clinic_name as string) || "当院";

  const today = todayJST();
  const [y, m, d] = today.split("-").map(Number);
  // 翌月（=対象月）
  const ty = m === 12 ? y + 1 : y;
  const tm = m === 12 ? 1 : m + 1;
  const targetMonth = `${ty}-${String(tm).padStart(2, "0")}`;
  const targetStart = `${targetMonth}-01`;
  const deadline = addDays(targetStart, -14); // 2週間前
  const link = `${baseUrl()}/shift-request`;
  const adminUrl = `${baseUrl()}/admin/my-schedule`;

  const actions: string[] = [];

  // アクティブスタッフ
  const { data: staffRows } = await db
    .from("reservation_staff").select("id, name, email")
    .eq("clinic_id", CLINIC_ID).eq("is_active", true);
  const staff = (staffRows ?? []) as { id: string; name: string; email: string | null }[];

  // ① 開始：毎月1日に翌月分を案内
  if (d === 1) {
    await pushLineToOwners(
      CLINIC_ID,
      `🗓️ ${tm}月の出勤希望アンケートを開始しました\nスタッフへこのリンクを送ってください👇\n${link}\n\n締切：${deadline}（2週間前）\n提出状況は「出勤調整」で確認できます。\n${adminUrl}`,
    );
    const emails = staff.map((s) => s.email).filter((e): e is string => !!e);
    const mail = await sendEmailTo(
      emails,
      `【${clinicName}】${tm}月の出勤希望の提出のお願い`,
      `お疲れさまです。\n${tm}月の出勤希望（出勤できる日・時間）の提出をお願いします。\n\n▼こちらから提出してください（お名前を選んで入力）\n${link}\n\n締切：${deadline} まで\nご不明な点は院長までお願いします。`,
      clinicName,
    );
    actions.push(`opened target=${targetMonth} ownerLINE staffMail=${mail.attempted}/${emails.length}`);
  }

  // ② リマインド：締切の 7/3/1日前・当日、未提出者がいれば
  const remindDays = [addDays(deadline, -7), addDays(deadline, -3), addDays(deadline, -1), deadline];
  if (remindDays.includes(today)) {
    const { data: reqRows } = await db
      .from("staff_shift_requests").select("staff_id, submitted_at")
      .eq("clinic_id", CLINIC_ID).eq("month", targetMonth);
    const submitted = new Set((reqRows ?? []).filter((r) => r.submitted_at).map((r) => r.staff_id as string));
    const unsub = staff.filter((s) => !submitted.has(s.id));
    if (unsub.length > 0) {
      const isLast = today === deadline;
      const names = unsub.map((s) => s.name).join("・");
      await pushLineToOwners(
        CLINIC_ID,
        `⏰ ${tm}月の出勤希望 ${isLast ? "本日が締切" : "締切が近づいています"}（締切 ${deadline}）\n未提出 ${unsub.length}名：${names}\n声かけ・リンク再送をお願いします👇\n${link}`,
      );
      const emails = unsub.map((s) => s.email).filter((e): e is string => !!e);
      const mail = await sendEmailTo(
        emails,
        `【${clinicName}】${tm}月の出勤希望 ${isLast ? "本日締切" : "締切間近"}のお願い`,
        `お疲れさまです。\n${tm}月の出勤希望がまだ未提出です。${isLast ? "本日が締切です。" : `締切は ${deadline} です。`}\n\n▼こちらから提出してください\n${link}`,
        clinicName,
      );
      actions.push(`remind target=${targetMonth} unsubmitted=${unsub.length} staffMail=${mail.attempted}/${emails.length}`);
    } else {
      actions.push(`remind target=${targetMonth} all-submitted`);
    }
  }

  return NextResponse.json({ ok: true, clinic: CLINIC_ID, today, targetMonth, deadline, actions });
}
