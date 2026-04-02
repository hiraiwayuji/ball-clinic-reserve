import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_CLINIC_ID = "00000000-0000-0000-0000-000000000001";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
}

function formatApt(apt: any) {
  const startTime = new Date(apt.start_time);
  const customer = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
  return {
    aptId: apt.id,
    name: customer?.name || "不明",
    date: startTime.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" }),
    time: startTime.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }),
    visitType: apt.is_first_visit ? "初診" : "再診",
    status: apt.status,
  };
}

async function notifyOwnerCancelled(name: string, date: string, time: string, visitType: string) {
  const ownerLineId = process.env.OWNER_LINE_USER_ID;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!ownerLineId || !token) return;
  const text = `❌【予約キャンセル】\n\n患者名: ${name}\n日時: ${date} ${time}\n種別: ${visitType}\n\nWeb からキャンセルされました。`;
  try {
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: ownerLineId, messages: [{ type: "text", text }] }),
    });
  } catch (err) {
    console.error("[LINE通知] キャンセル通知エラー:", err);
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const phone = req.nextUrl.searchParams.get("phone");
  const name = req.nextUrl.searchParams.get("name");
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "DB接続エラー" }, { status: 500 });

  if (id) {
    const { data: appointments } = await supabase
      .from("appointments")
      .select("id, start_time, is_first_visit, status, customers(name)")
      .eq("clinic_id", DEFAULT_CLINIC_ID)
      .in("status", ["pending", "confirmed", "waiting"])
      .order("created_at", { ascending: false });
    const apt = (appointments || []).find(a => a.id.startsWith(id.toLowerCase()));
    if (!apt) return NextResponse.json({ error: "予約が見つかりませんでした。番号をご確認ください。" }, { status: 404 });
    return NextResponse.json({ success: true, appointments: [formatApt(apt)] });
  }

  if (phone) {
    const cleanPhone = phone.replace(/-/g, "");
    const { data: customers } = await supabase
      .from("customers")
      .select("id")
      .eq("clinic_id", DEFAULT_CLINIC_ID)
      .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%${phone}%`);
    if (!customers || customers.length === 0)
      return NextResponse.json({ error: "この電話番号の予約が見つかりませんでした" }, { status: 404 });
    const customerIds = customers.map((c: any) => c.id);
    const { data: appointments } = await supabase
      .from("appointments")
      .select("id, start_time, is_first_visit, status, customers(name)")
      .in("customer_id", customerIds)
      .in("status", ["pending", "confirmed", "waiting"])
      .order("start_time", { ascending: true });
    if (!appointments || appointments.length === 0)
      return NextResponse.json({ error: "有効な予約が見つかりませんでした" }, { status: 404 });
    return NextResponse.json({ success: true, appointments: appointments.map(formatApt) });
  }

  if (name) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id")
      .eq("clinic_id", DEFAULT_CLINIC_ID)
      .ilike("name", `%${name.trim()}%`);
    if (!customers || customers.length === 0)
      return NextResponse.json({ error: "この名前の予約が見つかりませんでした" }, { status: 404 });
    const customerIds = customers.map((c: any) => c.id);
    const { data: appointments } = await supabase
      .from("appointments")
      .select("id, start_time, is_first_visit, status, customers(name)")
      .in("customer_id", customerIds)
      .in("status", ["pending", "confirmed", "waiting"])
      .order("start_time", { ascending: true });
    if (!appointments || appointments.length === 0)
      return NextResponse.json({ error: "有効な予約が見つかりませんでした" }, { status: 404 });
    return NextResponse.json({ success: true, appointments: appointments.map(formatApt) });
  }

  return NextResponse.json({ error: "検索条件が必要です" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const { ids } = await req.json();
  if (!ids || !Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: "予約IDが必要です" }, { status: 400 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "DB接続エラー" }, { status: 500 });

  // キャンセル前に予約情報を取得（LINE通知用）
  const { data: apts } = await supabase
    .from("appointments")
    .select("id, start_time, is_first_visit, customers(name)")
    .in("id", ids);

  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .in("id", ids)
    .eq("clinic_id", DEFAULT_CLINIC_ID);

  if (error) return NextResponse.json({ error: "キャンセルに失敗しました" }, { status: 500 });

  // 院長LINEへ通知（非同期、失敗してもキャンセル自体は成功扱い）
  if (apts) {
    for (const apt of apts) {
      const customer = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
      const startTime = new Date(apt.start_time);
      const date = startTime.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" });
      const time = startTime.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
      const visitType = apt.is_first_visit ? "初診" : "再診";
      await notifyOwnerCancelled(customer?.name || "不明", date, time, visitType);
    }
  }

  return NextResponse.json({ success: true });
}
