import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pushLineText } from "@/lib/admin-notify";
import { birthdayDayMessage } from "@/lib/marketing-templates";
import { CLINIC_CONFIG } from "@/lib/clinic-config";

/**
 * 誕生日メッセージの自動送信（Vercel Cron: 毎朝 8:00 JST = 23:00 UTC）。
 *
 * - clinic_settings.auto_birthday_enabled = true の院だけ送る（既定OFF）。
 * - その日が誕生日（birth_date の月日一致）かつ LINE連携済みの患者へ送信。
 *   ※ birth_month しか無い患者は「日」が特定できないので送らない（月初に全員へ飛ぶ事故を防ぐ）。
 * - customers.birthday_line_sent_year で同じ年の二重送信を防ぐ（cron再実行・リトライ対策）。
 * - クリニック識別はビルド時 env（各院のデプロイが自院だけ処理）。
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CLINIC_ID = process.env.NEXT_PUBLIC_CLINIC_ID ?? "00000000-0000-0000-0000-000000000001";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}` || req.nextUrl.searchParams.get("secret") === secret;
}

function getAdminSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** JSTの今日（年・月・日） */
function todayJst(): { year: number; month: number; day: number } {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const [y, m, d] = s.split("-").map((v) => parseInt(v, 10));
  return { year: y, month: m, day: d };
}

/**
 * クーポンの有効期限＝誕生日から1ヶ月後を「◯年◯月◯日」で返す。
 * 1/31 → 2/31 のような存在しない日は、その月の末日に丸める（3/3 などに飛ばさない）。
 */
function expiryOneMonthLater(year: number, month: number, day: number): string {
  const targetMonth = month === 12 ? 1 : month + 1;
  const targetYear = month === 12 ? year + 1 : year;
  const lastDay = new Date(targetYear, targetMonth, 0).getDate(); // 翌月の末日
  const targetDay = Math.min(day, lastDay);
  return `${targetYear}年${targetMonth}月${targetDay}日`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getAdminSupabase();

  const { data: settings } = await supabase
    .from("clinic_settings")
    .select("auto_birthday_enabled, clinic_name")
    .eq("id", CLINIC_ID)
    .maybeSingle();

  if (!settings?.auto_birthday_enabled) {
    return NextResponse.json({ status: "skipped", reason: "auto birthday disabled" });
  }

  const clinicName = (settings as any).clinic_name || CLINIC_CONFIG.name;
  const { year, month, day } = todayJst();

  // 誕生日が今日で、LINE連携済み、かつ今年まだ送っていない患者
  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, display_name, birth_date, line_user_id, birthday_line_sent_year")
    .eq("clinic_id", CLINIC_ID)
    .not("birth_date", "is", null);

  const targets = (customers ?? []).filter((c: any) => {
    if (c.birthday_line_sent_year === year) return false; // 今年送信済み
    const bd = String(c.birth_date); // "YYYY-MM-DD"
    const m = parseInt(bd.slice(5, 7), 10);
    const d = parseInt(bd.slice(8, 10), 10);
    return m === month && d === day;
  });

  const results: { name: string; sent: boolean; detail?: string }[] = [];

  for (const c of targets as any[]) {
    // 家族連携も含めて宛先を集める（自院のみ）
    const { data: links } = await supabase
      .from("customer_line_links")
      .select("line_user_id")
      .eq("clinic_id", CLINIC_ID)
      .eq("customer_id", c.id);

    const lineIds = Array.from(
      new Set([...(links ?? []).map((l: any) => l.line_user_id), c.line_user_id].filter(Boolean)),
    ) as string[];
    if (lineIds.length === 0) continue;

    const name = c.display_name ?? c.name;
    // クーポンは誕生日から1ヶ月有効・実費メニューのみ（保険診療への値引きは違法）
    const msg = birthdayDayMessage(clinicName, name, expiryOneMonthLater(year, month, day));

    let anySent = false;
    let lastDetail: string | undefined;
    for (const lineId of lineIds) {
      const push = await pushLineText(lineId, msg, CLINIC_ID);
      if (push.ok) anySent = true;
      else lastDetail = push.detail;
    }

    // 1人でも届いたら「今年は送信済み」にする（二重送信防止を優先）
    if (anySent) {
      await supabase
        .from("customers")
        .update({ birthday_line_sent_year: year })
        .eq("id", c.id)
        .eq("clinic_id", CLINIC_ID);
    }
    results.push({ name, sent: anySent, detail: lastDetail });
  }

  return NextResponse.json({
    status: "ok",
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    count: results.filter((r) => r.sent).length,
    results,
  });
}
