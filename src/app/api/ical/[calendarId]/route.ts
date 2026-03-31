import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ calendarId: string }> }) {
  const { calendarId } = await params;
  const supabase = await createClient();
  const { data: events, error } = await supabase.from("calendar_events").select("*").eq("calendar_id", calendarId).order("start_time", { ascending: true });
  if (error || !events) return new NextResponse("Error", { status: 500 });
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Ball Clinic//JA","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:ファミリーカレンダー","REFRESH-INTERVAL;VALUE=DURATION:PT1H"];
  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push("UID:" + event.id + "@ball-clinic-reserve");
    lines.push("DTSTAMP:" + fmt(new Date()));
    lines.push("DTSTART:" + fmt(new Date(event.start_time)));
    lines.push("DTEND:" + fmt(new Date(event.end_time)));
    lines.push("SUMMARY:" + event.title);
    if (event.description) lines.push("DESCRIPTION:" + event.description);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new NextResponse(lines.join("\r\n"), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-cache" } });
}