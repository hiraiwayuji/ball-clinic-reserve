"use server";

import { createClient } from "@supabase/supabase-js";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";
import { getLineUidFromCookie } from "@/app/actions/family-line";
import { pushLineToOwners } from "@/lib/admin-notify";
import { isDateWithinAllowedRange, isTimeSlotWithinTwoHours } from "@/lib/time-slots";

const CLINIC_ID = PUBLIC_CLINIC_ID;

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type MyReservation = {
  id: string;
  customerName: string;
  startTime: string; // ISO
  endTime: string | null;
  courseId: string | null;
  courseName: string | null;
  staffName: string | null;
  status: string;
};

/** cookie の LINE userId に紐づく顧客の「今後の予約」を返す（本人確認の土台）。 */
async function getLinkedCustomerIds(sb: ReturnType<typeof getServiceClient>): Promise<string[]> {
  if (!sb) return [];
  const lineUid = await getLineUidFromCookie();
  if (!lineUid) return [];
  const { data } = await sb
    .from("customer_line_links")
    .select("customer_id")
    .eq("line_user_id", lineUid)
    .eq("clinic_id", CLINIC_ID);
  return (data ?? []).map((r: { customer_id: string }) => r.customer_id);
}

export async function getMyUpcomingReservations(): Promise<{ ok: boolean; reservations: MyReservation[]; error?: string }> {
  const sb = getServiceClient();
  if (!sb) return { ok: false, reservations: [], error: "server unavailable" };
  const customerIds = await getLinkedCustomerIds(sb);
  if (customerIds.length === 0) {
    return { ok: false, reservations: [], error: "LINEからの本人確認ができませんでした。お手数ですがLINEのメニューから開き直してください。" };
  }
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("appointments")
    .select("id, start_time, end_time, course_id, course_name, staff_name, status, customers!inner(name)")
    .eq("clinic_id", CLINIC_ID)
    .in("customer_id", customerIds)
    .in("status", ["pending", "confirmed", "waiting"])
    .gte("start_time", nowIso)
    .order("start_time", { ascending: true });
  if (error) {
    console.error("[manage] getMyUpcomingReservations error:", error.message);
    return { ok: false, reservations: [], error: "予約の取得に失敗しました" };
  }
  const reservations: MyReservation[] = (data ?? []).map((a: any) => {
    const cust = Array.isArray(a.customers) ? a.customers[0] : a.customers;
    return {
      id: a.id,
      customerName: cust?.name ?? "",
      startTime: a.start_time,
      endTime: a.end_time ?? null,
      courseId: a.course_id ?? null,
      courseName: a.course_name ?? null,
      staffName: a.staff_name ?? null,
      status: a.status,
    };
  });
  return { ok: true, reservations };
}

/** 本人の予約か（cookie の LINE に紐づく顧客の予約か）を検証して返す。 */
async function loadOwnedAppointment(sb: NonNullable<ReturnType<typeof getServiceClient>>, appointmentId: string) {
  const customerIds = await getLinkedCustomerIds(sb);
  if (customerIds.length === 0) return null;
  const { data } = await sb
    .from("appointments")
    .select("id, customer_id, start_time, end_time, course_id, staff_id, course_name, customers(name)")
    .eq("id", appointmentId)
    .eq("clinic_id", CLINIC_ID)
    .maybeSingle();
  if (!data || !customerIds.includes(data.customer_id as string)) return null;
  return data as any;
}

export async function cancelMyReservation(appointmentId: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getServiceClient();
  if (!sb) return { ok: false, error: "server unavailable" };
  const apt = await loadOwnedAppointment(sb, appointmentId);
  if (!apt) return { ok: false, error: "ご本人の予約として確認できませんでした。" };

  const { error } = await sb
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", appointmentId)
    .eq("clinic_id", CLINIC_ID);
  if (error) return { ok: false, error: "キャンセルに失敗しました。お手数ですがお電話・LINEでご連絡ください。" };

  const cust = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
  const jst = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  void pushLineToOwners(
    CLINIC_ID,
    `🚫【患者キャンセル】${cust?.name ?? "(患者)"}様\n日時: ${jst(apt.start_time)}${apt.course_name ? `\nメニュー: ${apt.course_name}` : ""}\n（患者さんがLINEからキャンセルされました）`,
  );
  return { ok: true };
}

export async function rescheduleMyReservation(
  appointmentId: string,
  newDate: string, // YYYY-MM-DD
  newTime: string, // HH:mm
): Promise<{ ok: boolean; error?: string }> {
  const sb = getServiceClient();
  if (!sb) return { ok: false, error: "server unavailable" };
  const apt = await loadOwnedAppointment(sb, appointmentId);
  if (!apt) return { ok: false, error: "ご本人の予約として確認できませんでした。" };

  if (!newDate || !newTime) return { ok: false, error: "日付と時間を選んでください。" };
  if (!isDateWithinAllowedRange(new Date(newDate))) return { ok: false, error: "1ヶ月より先の予約はできません。" };
  if (isTimeSlotWithinTwoHours(newDate, newTime)) return { ok: false, error: "直前（2時間以内）への変更はお電話・LINEでお願いします。" };

  // 所要時間は元予約を維持
  const oldStart = new Date(apt.start_time);
  const oldEnd = apt.end_time ? new Date(apt.end_time) : new Date(oldStart.getTime() + 30 * 60000);
  const durationMs = Math.max(30 * 60000, oldEnd.getTime() - oldStart.getTime());
  const newStartIso = `${newDate}T${newTime}:00+09:00`;
  const newStart = new Date(newStartIso);
  const newEndIso = new Date(newStart.getTime() + durationMs).toISOString();

  // 担当(レーン)があれば、新しい時間でそのレーンが空いているか確認（自分自身は除外）
  const staffId = (apt.staff_id as string | null) ?? null;
  if (staffId) {
    const { data: conf } = await sb
      .from("appointments")
      .select("id")
      .eq("clinic_id", CLINIC_ID)
      .eq("staff_id", staffId)
      .neq("status", "cancelled")
      .neq("id", appointmentId)
      .lt("start_time", newEndIso)
      .gt("end_time", newStartIso)
      .limit(1);
    if (conf && conf.length > 0) {
      return { ok: false, error: "その時間はすでに埋まっています。別のお時間をお選びください。" };
    }
  }

  const { error } = await sb
    .from("appointments")
    .update({ start_time: newStartIso, end_time: newEndIso, status: "pending" })
    .eq("id", appointmentId)
    .eq("clinic_id", CLINIC_ID);
  if (error) {
    // DB排他制約（単一資源の重複）に当たった場合もここに来る
    return { ok: false, error: "その時間は予約できませんでした。別のお時間をお選びください。" };
  }

  const cust = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
  const jst = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  void pushLineToOwners(
    CLINIC_ID,
    `🔁【患者が時間変更】${cust?.name ?? "(患者)"}様\n旧: ${jst(apt.start_time)}\n新: ${jst(newStartIso)}${apt.course_name ? `\nメニュー: ${apt.course_name}` : ""}\n（患者さんがLINEから変更されました）`,
  );
  return { ok: true };
}
