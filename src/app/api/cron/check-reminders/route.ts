import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToCalendar } from "@/lib/push-notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WINDOW_MINUTES = 2;

type CalendarEventRow = {
  id: string;
  calendar_id: string;
  title: string;
  start_time: string;
  end_time: string;
  is_all_day: boolean | null;
  member_name: string | null;
  is_recurring: boolean | null;
  recurrence_rule: string | null;
  reminder_minutes_before: number[] | null;
};

function toJSTDateStr(date: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

function formatTimeJST(iso: string): string {
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(new Date(iso));
}

function reminderLabel(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440}日後`;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}時間後`;
  return `${minutes}分後`;
}

function buildPayload(event: CalendarEventRow, minutesBefore: number) {
  const time = event.is_all_day ? "終日" : `${formatTimeJST(event.start_time)}〜`;
  const owner = event.member_name || "家族";
  return {
    title: `⏰ ${reminderLabel(minutesBefore)} - ${event.title}`,
    body: `${owner} / ${time}`,
    url: `/calendar/${event.calendar_id}`,
    tag: `reminder-${event.id}-${minutesBefore}`,
  };
}

// 繰り返し展開 (cron 内最小実装: DAILY / WEEKLY / WEEKLY:1,3,5 / MONTHLY)
function* expandOccurrences(event: CalendarEventRow, from: Date, to: Date): Generator<Date> {
  const start = new Date(event.start_time);
  if (!event.is_recurring) {
    if (start >= from && start <= to) yield start;
    return;
  }
  const rule = event.recurrence_rule || "WEEKLY";
  const base = rule.split(";")[0];
  const exdates = (rule.split(";").find((p) => p.startsWith("EXDATE:")) || "")
    .replace("EXDATE:", "")
    .split(",")
    .filter(Boolean);
  const freq = base.startsWith("DAILY") ? "daily" : base.startsWith("MONTHLY") ? "monthly" : "weekly";
  const weeklyDays = base.startsWith("WEEKLY:")
    ? base.replace("WEEKLY:", "").split(",").map(Number).filter((n) => !isNaN(n))
    : [];

  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const limit = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
  while (cursor < limit) {
    let matches = false;
    if (freq === "daily") matches = true;
    else if (freq === "weekly") {
      if (weeklyDays.length > 0) matches = weeklyDays.includes(cursor.getDay());
      else matches = cursor.getDay() === start.getDay();
    } else if (freq === "monthly") {
      matches = cursor.getDate() === start.getDate();
    }
    const dateKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    if (
      matches &&
      !exdates.includes(dateKey) &&
      cursor >= new Date(start.getFullYear(), start.getMonth(), start.getDate())
    ) {
      const occ = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), start.getHours(), start.getMinutes());
      yield occ;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase env missing" }, { status: 500 });
  }
  const supabase = createClient(url, key);

  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MINUTES * 60 * 1000);
  const windowEnd = new Date(now.getTime() + WINDOW_MINUTES * 60 * 1000);
  const expandFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const expandTo = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { data: candidates, error } = await supabase
    .from("calendar_events")
    .select("id, calendar_id, title, start_time, end_time, is_all_day, member_name, is_recurring, recurrence_rule, reminder_minutes_before")
    .not("reminder_minutes_before", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const events = (candidates || []) as CalendarEventRow[];
  type Due = { event: CalendarEventRow; occurrenceDate: string; minutes: number };
  const due: Due[] = [];

  for (const ev of events) {
    const minutesList = ev.reminder_minutes_before;
    if (!minutesList || minutesList.length === 0) continue;
    for (const occ of expandOccurrences(ev, expandFrom, expandTo)) {
      for (const minutes of minutesList) {
        const fireAt = new Date(occ.getTime() - minutes * 60 * 1000);
        if (fireAt < windowStart || fireAt > windowEnd) continue;
        due.push({ event: ev, occurrenceDate: toJSTDateStr(occ), minutes });
      }
    }
  }

  if (due.length === 0) {
    return NextResponse.json({ ok: true, checked: events.length, sent: 0 });
  }

  const { data: alreadySent } = await supabase
    .from("event_reminder_sent")
    .select("event_id, occurrence_date, minutes_before")
    .in("event_id", due.map((d) => d.event.id));
  const sentSet = new Set(
    (alreadySent || []).map((r) => `${r.event_id}|${r.occurrence_date}|${r.minutes_before}`),
  );

  let sent = 0;
  for (const item of due) {
    const k = `${item.event.id}|${item.occurrenceDate}|${item.minutes}`;
    if (sentSet.has(k)) continue;
    const result = await sendPushToCalendar(
      item.event.calendar_id,
      buildPayload(item.event, item.minutes),
      item.event.member_name ?? null,
    );
    const { error: insErr } = await supabase
      .from("event_reminder_sent")
      .insert({
        event_id: item.event.id,
        occurrence_date: item.occurrenceDate,
        minutes_before: item.minutes,
      });
    if (insErr && !insErr.message.includes("duplicate")) {
      console.error("[cron] event_reminder_sent insert error:", insErr.message);
    }
    sent += result.sent;
  }

  return NextResponse.json({ ok: true, checked: events.length, candidates: due.length, sent });
}
