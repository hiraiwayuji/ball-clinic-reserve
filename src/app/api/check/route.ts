import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
}

function formatApt(apt: any, waitlistPosition?: number) {
  const startTime = new Date(apt.start_time);
  const customer = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
  return {
    aptId: apt.id,
    name: customer?.name || "不明",
    date: startTime.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" }),
    time: startTime.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }),
    visitType: apt.is_first_visit ? "初診" : "再診",
    status: apt.status,
    waitlistPosition: waitlistPosition ?? null,
  };
}

async function getWaitlistPosition(supabase: any, aptId: string, startTime: string): Promise<number | null> {
  const { data } = await supabase
    .from("appointments")
    .select("id, created_at")
    .eq("start_time", startTime)
    .eq("status", "waiting")
    .order("created_at", { ascending: true });
  if (!data) return null;
  const index = data.findIndex((a: any) => a.id === aptId);
  return index >= 0 ? index + 1 : null;
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const phone = req.nextUrl.searchParams.get("phone");
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "DB接続エラー" }, { status: 500 });

  if (id) {
    const { data: appointments } = await supabase
      .from("appointments")
      .select("id, start_time, is_first_visit, status, customers(name)")
      .in("status", ["pending", "confirmed", "waiting"])
      .order("created_at", { ascending: false });
    const apt = (appointments || []).find(a => a.id.startsWith(id.toLowerCase()));
    if (!apt) return NextResponse.json({ error: "予約が見つかりませんでした。番号をご確認ください。" }, { status: 404 });
    const position = apt.status === "waiting" ? await getWaitlistPosition(supabase, apt.id, apt.start_time) : null;
    return NextResponse.json({ success: true, appointment: formatApt(apt, position ?? undefined) });
  }

  if (phone) {
    const cleanPhone = phone.replace(/-/g, "");
    const { data: customers } = await supabase
      .from("customers")
      .select("id")
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
    const formatted = await Promise.all(appointments.map(async (a: any) => {
      const pos = a.status === "waiting" ? await getWaitlistPosition(supabase, a.id, a.start_time) : null;
      return formatApt(a, pos ?? undefined);
    }));
    return NextResponse.json({ success: true, appointments: formatted });
  }

  const name = req.nextUrl.searchParams.get("name");
  if (name) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id")
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
    const formatted = await Promise.all(appointments.map(async (a: any) => {
      const pos = a.status === "waiting" ? await getWaitlistPosition(supabase, a.id, a.start_time) : null;
      return formatApt(a, pos ?? undefined);
    }));
    return NextResponse.json({ success: true, appointments: formatted });
  }

  return NextResponse.json({ error: "検索条件が必要です" }, { status: 400 });
}
