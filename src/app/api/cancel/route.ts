import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";
import { writeAudit } from "@/lib/audit";
import { pushLineToOwners, pushLineToCustomer } from "@/lib/admin-notify";

const DEFAULT_CLINIC_ID = PUBLIC_CLINIC_ID;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

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
  const text = `❌【予約キャンセル】\n\n患者名: ${name}\n日時: ${date} ${time}\n種別: ${visitType}\n\nWeb からキャンセルされました。`;
  await pushLineToOwners(DEFAULT_CLINIC_ID, text);
}

/** 患者本人の LINE にキャンセル完了の確認を送信（line_user_id が登録されている場合のみ） */
async function notifyPatientCancelled(lineUserId: string | null | undefined, name: string, date: string, time: string) {
  if (!lineUserId) return;
  const text = `✅ 予約キャンセル完了\n\n${name}様の以下の予約をキャンセルしました。\n\n📅 日時: ${date} ${time}\n\nまたのご予約をお待ちしております。`;
  await pushLineToCustomer(lineUserId, text);
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
      .eq("clinic_id", DEFAULT_CLINIC_ID)
      .in("customer_id", customerIds)
      .in("status", ["pending", "confirmed", "waiting"])
      .order("start_time", { ascending: true });
    if (!appointments || appointments.length === 0)
      return NextResponse.json({ error: "有効な予約が見つかりませんでした" }, { status: 404 });
    return NextResponse.json({ success: true, appointments: appointments.map(formatApt) });
  }

  // 名前のみでの予約一覧取得は廃止（同名別人の予約が見えるリスク）
  // 電話番号または予約番号(id)での検索のみ許可

  return NextResponse.json({ error: "電話番号または予約番号で検索してください" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const { ids, phone, name } = await req.json();
  if (!ids || !Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: "予約IDが必要です" }, { status: 400 });

  // 電話番号 or 名前のどちらかで本人確認を必須化
  if (!phone && !name)
    return NextResponse.json({ error: "本人確認のため電話番号または氏名が必要です" }, { status: 400 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "DB接続エラー" }, { status: 500 });

  // ── 所有者確認 ──
  // 電話番号 or 名前でcustomer_idを特定し、対象予約が本人のものか検証する
  let allowedCustomerIds: string[] = [];
  if (phone) {
    const cleanPhone = phone.replace(/-/g, "");
    const { data: customers } = await supabase
      .from("customers")
      .select("id")
      .eq("clinic_id", DEFAULT_CLINIC_ID)
      .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%${phone}%`);
    allowedCustomerIds = (customers || []).map((c: any) => c.id);
  } else if (name) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id")
      .eq("clinic_id", DEFAULT_CLINIC_ID)
      .ilike("name", name.trim());
    allowedCustomerIds = (customers || []).map((c: any) => c.id);
  }

  if (allowedCustomerIds.length === 0)
    return NextResponse.json({ error: "本人確認ができませんでした。電話番号または氏名をご確認ください。" }, { status: 403 });

  // キャンセル対象の予約が本人のものかチェック
  const { data: targetApts } = await supabase
    .from("appointments")
    .select("id, customer_id, start_time, is_first_visit, customers(name)")
    .in("id", ids)
    .eq("clinic_id", DEFAULT_CLINIC_ID);

  if (!targetApts || targetApts.length === 0)
    return NextResponse.json({ error: "予約が見つかりませんでした" }, { status: 404 });

  const unauthorized = targetApts.filter((a: any) => !allowedCustomerIds.includes(a.customer_id));
  if (unauthorized.length > 0)
    return NextResponse.json({ error: "キャンセル権限がありません。ご自身の予約のみキャンセルできます。" }, { status: 403 });

  // ── 2 時間前制限のチェック ──
  // 1 件でも 2 時間以内の予約が含まれていたら、すべて拒否（部分成功にはしない）
  const now = Date.now();
  const tooClose = targetApts.find((a: any) => {
    const startMs = new Date(a.start_time).getTime();
    return startMs - now < TWO_HOURS_MS;
  });
  if (tooClose) {
    return NextResponse.json(
      {
        error:
          "予約開始 2 時間前を切っているため Web からはキャンセルできません。お電話（088-635-5344）または LINE にてご連絡ください。",
      },
      { status: 400 },
    );
  }

  // キャンセル前に line_user_id を取得（患者本人通知用）
  const customerIdsForLine = Array.from(new Set(targetApts.map((a: any) => a.customer_id))).filter(Boolean);
  const { data: customersWithLine } = customerIdsForLine.length
    ? await supabase
        .from("customers")
        .select("id, name, line_user_id")
        .in("id", customerIdsForLine)
        .eq("clinic_id", DEFAULT_CLINIC_ID)
    : { data: [] as { id: string; name: string; line_user_id: string | null }[] };
  const lineMap = new Map<string, { name: string; line_user_id: string | null }>();
  (customersWithLine ?? []).forEach((c: any) =>
    lineMap.set(c.id, { name: c.name, line_user_id: c.line_user_id }),
  );

  const apts = targetApts;

  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .in("id", ids)
    .eq("clinic_id", DEFAULT_CLINIC_ID);

  if (error) return NextResponse.json({ error: "キャンセルに失敗しました" }, { status: 500 });

  // 院長 + 患者本人 LINE へ通知 + 監査ログ（非同期、失敗しても成功扱い）
  if (apts) {
    for (const apt of apts) {
      const customer = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
      const startTime = new Date(apt.start_time);
      const date = startTime.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" });
      const time = startTime.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
      const visitType = apt.is_first_visit ? "初診" : "再診";
      const lineInfo = lineMap.get(apt.customer_id);

      await Promise.all([
        notifyOwnerCancelled(customer?.name || "不明", date, time, visitType),
        notifyPatientCancelled(lineInfo?.line_user_id ?? null, customer?.name || "お客様", date, time),
        writeAudit({
          clinicId: DEFAULT_CLINIC_ID,
          actorRole: "system",
          actionType: "appointment.cancel_by_patient",
          targetTable: "appointments",
          targetId: apt.id,
          before: { status: "active", start_time: apt.start_time, customer_name: customer?.name },
          after: { status: "cancelled" },
        }),
      ]);
    }
  }

  return NextResponse.json({ success: true });
}
