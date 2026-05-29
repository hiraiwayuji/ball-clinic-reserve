import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest, { params }: { params: Promise<{ calendarId: string }> }) {
  const { calendarId } = await params;
  const memberFilter = request.nextUrl.searchParams.get("member");
  // 公開iCal用：認証不要で読める（カレンダーIDを知っている人だけがアクセス可能）
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  // tenant-isolation-ignore: 公開 iCal 取得。calendar_id はランダムなトークン的IDなので
  // 同じトークンを知っている人だけが各 calendar にアクセス可能。clinic_id 横断で OK。
  let query = supabase.from("calendar_events").select("*").eq("calendar_id", calendarId).order("start_time", { ascending: true });
  if (memberFilter) query = query.eq("member_name", memberFilter);
  const { data: events, error } = await query;
  if (error || !events) return new NextResponse("Error", { status: 500 });
  const calName = memberFilter ? `${memberFilter}スケジュール` : "ファミリーカレンダー";
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  // iCal TEXT 値のエスケープ（改行・, ; \ を処理しないとVEVENTが壊れカレンダーに無視される）
  const esc = (s: string) =>
    String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Ball Clinic//JA","CALSCALE:GREGORIAN","METHOD:PUBLISH",`X-WR-CALNAME:${calName}`,"REFRESH-INTERVAL;VALUE=DURATION:PT1H"];
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
  return new NextResponse(lines.join("\r\n"), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-cache" } });
}