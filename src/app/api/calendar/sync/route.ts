import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { format, addHours } from "date-fns";

// Supabase初期化
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const revalidate = 0; // 常に最新を返す

/**
 * 簡易的に iCalendar (ICS) フォーマットの文字列を作るヘルパー
 */
function generateICalendar(events: any[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ball Clinic//Reservation System//JA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:ボール接骨院＆家族カレンダー",
    "X-WR-TIMEZONE:Asia/Tokyo",
  ];

  // 日付をICSフォーマット（YYYYMMDDTHHMMSSZ）に変換する関数
  // UTCとして書き出すため、JST（+9:00）の時刻から9時間引いてZをつけるのが標準ですが、
  // supabaseのデータは既にUTCで保存されている前提（あるいはTZ付き）で処理します。
  const formatIcsDate = (dateStr: string) => {
    const d = new Date(dateStr);
    // VEVENTはUTC時間でZをつけるのが最も確実
    return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  };

  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  events.forEach((ev) => {
    // 必須プロパティ
    const uid = ev.id || Math.random().toString(36).substring(2);
    
    // イベント開始・終了判定
    const dtStart = formatIcsDate(ev.start_time);
    // end_timeがない場合（予約データなど）は開始から1時間後とする
    const dtEnd = ev.end_time 
      ? formatIcsDate(ev.end_time)
      : formatIcsDate(addHours(new Date(ev.start_time), 1).toISOString());

    const title = ev.title || "予定";
    const description = ev.description || "";

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}@ballclinic.local`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${dtStart}`);
    lines.push(`DTEND:${dtEnd}`);
    lines.push(`SUMMARY:${title}`);
    if (description) {
      // 複数行の説明がある場合は改行をエスケープ
      lines.push(`DESCRIPTION:${description.replace(/\n/g, "\\n")}`);
    }
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");

  return lines.join("\r\n");
}

export async function GET(request: Request) {
  try {
    const eventsToSync: any[] = [];

    // 1. 接骨院の予約データを取得 (appointments)
    const { data: appointments, error: aptError } = await supabase
      .from("appointments")
      .select("id, start_time, memo, is_first_visit, status, customers(name, phone)")
      // 過去1ヶ月〜未来の予約を取得
      .gte("start_time", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .not("status", "eq", "cancelled");

    if (!aptError && appointments) {
      appointments.forEach((apt) => {
        const cust = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
        const custName = cust ? cust.name : "名前なし";
        const type = apt.is_first_visit ? "【初診】" : "【再診】";
        const phone = cust?.phone ? `\\n電話: ${cust.phone}` : "";
        
        eventsToSync.push({
          id: `apt-${apt.id}`,
          start_time: apt.start_time,
          title: `[予約] ${type} ${custName}様`,
          description: `ステータス: ${apt.status}\\nメモ: ${apt.memo || "なし"}${phone}`
        });
      });
    }

    // 2. 家族カレンダーの予定を取得 (calendar_events)
    const { data: familyEvents, error: famError } = await supabase
      .from("calendar_events")
      .select("*")
      .gte("start_time", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (!famError && familyEvents) {
      familyEvents.forEach((ev) => {
        const member = ev.member_name ? `(${ev.member_name})` : "";
        eventsToSync.push({
          id: `fam-${ev.id}`,
          start_time: ev.start_time,
          end_time: ev.end_time,
          title: `[家族] ${ev.title} ${member}`,
          description: ev.description || ""
        });
      });
    }

    // ICS文字列を生成
    const icsString = generateICalendar(eventsToSync);

    // テキスト/カレンダーとしてレスポンスを返す
    return new NextResponse(icsString, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        // ダウンロード時のファイル名（ブラウザ直接アクセス時）
        "Content-Disposition": 'attachment; filename="ball_clinic_calendar.ics"',
        // Googleカレンダー等のクローラー向けキャッシュ制御
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      },
    });

  } catch (error) {
    console.error("Vercel ICS API Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
