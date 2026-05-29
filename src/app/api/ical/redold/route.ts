import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// レッドオールド試合専用の公開 iCal。
// calendar_id / member_name をサーバー側で固定し、クエリパラメータを一切受け付けない。
// → URL を改ざんされても「試合」以外（私的予定）は絶対に返さない。
const PUBLIC_CALENDAR_ID = "76p83beb";
const PUBLIC_MEMBER = "試合";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  // tenant-isolation-ignore: 公開 iCal 取得。calendar_id は固定トークン、member も固定。
  const { data: events, error } = await supabase
    .from("calendar_events")
    .select("id,title,description,start_time,end_time")
    .eq("calendar_id", PUBLIC_CALENDAR_ID)
    .eq("member_name", PUBLIC_MEMBER)
    .order("start_time", { ascending: true });
  if (error || !events) return new NextResponse("Error", { status: 500 });

  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  // iCal TEXT 値のエスケープ（改行・, ; \ を処理しないとVEVENTが壊れGoogleに無視される）
  const esc = (s: string) =>
    String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ball Clinic//RED OLD//JA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:レッドオールド 試合日程",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push("UID:" + event.id + "@ball-clinic-reserve");
    lines.push("DTSTAMP:" + fmt(new Date()));
    lines.push("DTSTART:" + fmt(new Date(event.start_time)));
    lines.push("DTEND:" + fmt(new Date(event.end_time)));
    lines.push("SUMMARY:" + esc(event.title));
    if (event.description) lines.push("DESCRIPTION:" + esc(event.description));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new NextResponse(lines.join("\r\n"), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
