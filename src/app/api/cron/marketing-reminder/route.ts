import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { pushLineToOwners } from "@/lib/admin-notify";
import { metricsScore, type PostMetrics } from "@/lib/ai-marketing";

// SNS投稿の朝リマインド（Vercel Cron: 毎朝 8:00 JST = 23:00 UTC）。
// - 今日が投稿予定日（scheduled_date）の投稿案があれば院長LINEへ通知
// - 予定日を過ぎて未投稿のものがあれば件数を添える
// - 毎月1日は先月のSNSふりかえりミニレポートも送る
// クリニック識別はビルド時 env（各院の Vercel デプロイごとに自院だけ通知する）。

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CLINIC_ID = process.env.NEXT_PUBLIC_CLINIC_ID ?? "00000000-0000-0000-0000-000000000001";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("secret") === secret;
}

function todayJST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

type PostRow = {
  id: string;
  category: string;
  theme: string | null;
  scheduled_date: string | null;
  posted_date: string | null;
  metrics: PostMetrics | null;
};

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase env missing" }, { status: 500 });
  }
  const db = createAdminClient(url, key, { auth: { persistSession: false } });

  const today = todayJST(); // YYYY-MM-DD (JST)
  const [y, m, d] = today.split("-").map(Number);
  const messages: string[] = [];

  // 1) 今日が予定日の投稿・期限切れの未投稿
  const { data, error } = await db
    .from("ai_marketing_posts")
    .select("id, category, theme, scheduled_date, posted_date, metrics")
    .eq("clinic_id", CLINIC_ID)
    .is("posted_date", null)
    .neq("status", "rejected")
    .not("scheduled_date", "is", null)
    .lte("scheduled_date", today);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as PostRow[];
  const dueToday = rows.filter((r) => r.scheduled_date === today);
  const overdue = rows.filter((r) => r.scheduled_date && r.scheduled_date < today);

  if (dueToday.length > 0) {
    const lines = dueToday
      .slice(0, 5)
      .map((r) => `・【${r.category}】${(r.theme ?? "テーマ未設定").slice(0, 30)}`);
    let text = `📣 今日はSNS投稿の予定日です（${m}/${d}）\n${lines.join("\n")}`;
    if (overdue.length > 0) text += `\n\nほかに予定日を過ぎた未投稿が ${overdue.length} 件あります。`;
    text += `\n\n▼ AI投稿作成（文章のコピーはこちらから）\n${baseUrl()}/admin/marketing/ai-posts`;
    messages.push(text);
  }

  // 2) 毎月1日: 先月のSNSふりかえりミニレポート
  if (d === 1) {
    const prevY = m === 1 ? y - 1 : y;
    const prevM = m === 1 ? 12 : m - 1;
    const from = `${prevY}-${String(prevM).padStart(2, "0")}-01`;
    const to = `${prevY}-${String(prevM).padStart(2, "0")}-31`;
    const { data: posted } = await db
      .from("ai_marketing_posts")
      .select("id, category, theme, posted_date, metrics")
      .eq("clinic_id", CLINIC_ID)
      .gte("posted_date", from)
      .lte("posted_date", to);

    const prows = (posted ?? []) as PostRow[];
    if (prows.length > 0) {
      const totals = prows.reduce(
        (acc, r) => {
          acc.likes += r.metrics?.likes || 0;
          acc.saves += r.metrics?.saves || 0;
          acc.comments += r.metrics?.comments || 0;
          acc.reservations += r.metrics?.reservations || 0;
          return acc;
        },
        { likes: 0, saves: 0, comments: 0, reservations: 0 },
      );
      const top = [...prows].sort((a, b) => metricsScore(b.metrics) - metricsScore(a.metrics))[0];
      let text = `🌸 先月（${prevM}月）のSNSふりかえり\n投稿数: ${prows.length}件\nいいね${totals.likes}・保存${totals.saves}・コメント${totals.comments}・予約につながった数${totals.reservations}`;
      if (top && metricsScore(top.metrics) > 0) {
        text += `\n一番反応が良かった投稿: 【${top.category}】${(top.theme ?? "").slice(0, 25)}`;
      }
      text += `\n\n今月もコツコツ続けていきましょう！\n詳しくは「効果」タブで確認できます。\n${baseUrl()}/admin/marketing/ai-posts`;
      messages.push(text);
    }
  }

  for (const text of messages) {
    await pushLineToOwners(CLINIC_ID, text);
  }

  return NextResponse.json({
    ok: true,
    clinic: CLINIC_ID,
    dueToday: dueToday.length,
    overdue: overdue.length,
    notified: messages.length,
  });
}
