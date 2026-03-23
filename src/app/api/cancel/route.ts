import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "予約番号が必要です" }, { status: 400 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "DB接続エラー" }, { status: 500 });

  const { data: appointments } = await supabase
    .from("appointments")
    .select("id, start_time, is_first_visit, status, customers(name)")
    .in("status", ["pending", "confirmed", "waiting"])
    .order("created_at", { ascending: false });

  const apt = (appointments || []).find(a => a.id.startsWith(id.toLowerCase()));

  if (!apt) return NextResponse.json({ error: "予約が見つかりませんでした。番号をご確認ください。" }, { status: 404 });

  const startTime = new Date(apt.start_time);
  const customer = apt.customers as any;

  return NextResponse.json({
    success: true,
    appointment: {
      name: customer?.name || "不明",
      date: startTime.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" }),
      time: startTime.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }),
      visitType: apt.is_first_visit ? "初診" : "再診",
    }
  });
}

export async function POST(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "予約番号が必要です" }, { status: 400 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "DB接続エラー" }, { status: 500 });

  const { data: appointments } = await supabase
    .from("appointments")
    .select("id")
    .in("status", ["pending", "confirmed", "waiting"]);

  const apt = (appointments || []).find(a => a.id.startsWith(id.toLowerCase()));
  if (!apt) return NextResponse.json({ error: "予約が見つかりませんでした" }, { status: 404 });

  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", apt.id);

  if (error) return NextResponse.json({ error: "キャンセルに失敗しました" }, { status: 500 });

  return NextResponse.json({ success: true });
}
