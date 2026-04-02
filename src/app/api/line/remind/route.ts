import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const REMIND_SECRET = process.env.REMIND_SECRET || "";
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

async function pushLine(userId: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({ to: userId, messages: [{ type: "text", text }] }),
  });
}

function toJSTDateStr(iso: string) {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = Object.fromEntries(f.formatToParts(d).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatJST(iso: string, withTime: boolean) {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric", day: "numeric", weekday: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
  return f.format(d);
}

export async function POST(req: NextRequest) {
  // シークレットチェック
  const { secret, mode } = await req.json().catch(() => ({}));
  if (!REMIND_SECRET || secret !== REMIND_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // mode: "morning" = 当日7時, "evening" = 前日20時
  const now = new Date();
  const jstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));

  let targetDate: Date;
  let label: string;
  if (mode === "evening") {
    // 前日20時 → 翌日の予定
    targetDate = new Date(jstNow);
    targetDate.setDate(targetDate.getDate() + 1);
    label = "明日";
  } else {
    // 当日7時 → 今日の予定
    targetDate = new Date(jstNow);
    label = "今日";
  }

  const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth()+1).padStart(2,"0")}-${String(targetDate.getDate()).padStart(2,"0")}`;
  const dayStart = `${dateStr}T00:00:00+09:00`;
  const dayEnd = `${dateStr}T23:59:59+09:00`;

  const DEFAULT_CLINIC_ID = "00000000-0000-0000-0000-000000000001";
  const supabase = getAdminSupabase();

  // 家族カレンダーのイベントを取得
  const { data: events } = await supabase
    .from("calendar_events")
    .select("title, start_time, end_time, is_all_day, member_name")
    .eq("clinic_id", DEFAULT_CLINIC_ID)
    .lte("start_time", dayEnd)
    .gte("end_time", dayStart)
    .order("start_time", { ascending: true });

  // 通知先LINEユーザーID一覧（環境変数から取得）
  const targetIds = [
    process.env.OWNER_LINE_USER_ID,
    process.env.FAMILY_LINE_USER_ID_1,
    process.env.FAMILY_LINE_USER_ID_2,
    process.env.FAMILY_LINE_USER_ID_3,
  ].filter(Boolean) as string[];

  if (targetIds.length === 0) {
    return NextResponse.json({ error: "No LINE user IDs configured" }, { status: 500 });
  }

  if (!events || events.length === 0) {
    const text = `📅 ${label}（${dateStr.slice(5).replace("-","/")}）の予定はありません。`;
    await Promise.all(targetIds.map(id => pushLine(id, text)));
    return NextResponse.json({ status: "ok", events: 0 });
  }

  const lines = events.map(e => {
    const time = e.is_all_day ? "終日" : formatJST(e.start_time, true);
    const member = e.member_name ? `【${e.member_name}】` : "";
    return `・${time} ${member}${e.title}`;
  });

  const text = `📅 ${label}（${dateStr.slice(5).replace("-","/")}）の予定\n\n${lines.join("\n")}`;
  await Promise.all(targetIds.map(id => pushLine(id, text)));

  return NextResponse.json({ status: "ok", events: events.length, date: dateStr });
}
