"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { checkAdminAuth } from "./auth";
import { revalidatePath } from "next/cache";

type CustomerWithStats = {
  id: string;
  name: string;
  phone: string;
  created_at: string;
  appointmentCount: number;
  cancelCount: number;
  lastVisit: string | null;
  booking_suspended: boolean;
  line_user_id: string | null;
  birth_month: number | null;
  gender: string | null;
  age_group: string | null;
  guardian_name: string | null;
  city_name: string | null;
  birth_date: string | null;
  referral_source: string | null;
  medical_record_number: string | null;
};

export async function getCustomers(): Promise<CustomerWithStats[]> {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await createClient();

    // まず medical_record_number を含めてクエリ
    let { data: rawCustomers, error } = await supabase
      .from("customers")
      .select(`
        id,
        name,
        phone,
        created_at,
        booking_suspended,
        line_user_id,
        birth_month,
        gender,
        age_group,
        guardian_name,
        city_name,
        birth_date,
        referral_source,
        medical_record_number,
        appointments (
          id,
          start_time,
          status
        )
      `)
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false });

    // エラーが発生した場合（medical_record_number カラム未作成など）は除外して再クエリ
    if (error) {
      const errMsg = (error as any).message ?? JSON.stringify(error);
      console.warn("First query failed, retrying without medical_record_number:", errMsg);
      const fallback = await supabase
        .from("customers")
        .select(`
          id,
          name,
          phone,
          created_at,
          booking_suspended,
          line_user_id,
          birth_month,
          gender,
          age_group,
          guardian_name,
          city_name,
          birth_date,
          referral_source,
          appointments (
            id,
            start_time,
            status
          )
        `)
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false });
      rawCustomers = (fallback.data as any) ?? null;
      error = fallback.error;
    }

    if (error) {
      const errMsg = (error as any).message ?? JSON.stringify(error);
      console.error("Failed to fetch customers:", errMsg);
      return [];
    }

    const customers = rawCustomers ?? [];

    const formattedCustomers: CustomerWithStats[] = (customers as any[]).map((c: any) => {
      const appointments = c.appointments || [];
      const cancelled = appointments.filter((a: any) => a.status === "cancelled");
      const active = appointments.filter((a: any) => a.status !== "cancelled");

      let lastVisit = null;
      if (active.length > 0) {
        const sorted = [...active].sort((a, b) =>
          new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
        );
        lastVisit = sorted[0].start_time;
      }

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        created_at: c.created_at,
        appointmentCount: active.length,
        cancelCount: cancelled.length,
        lastVisit,
        booking_suspended: c.booking_suspended ?? false,
        line_user_id: c.line_user_id ?? null,
        birth_month: c.birth_month ?? null,
        gender: c.gender ?? null,
        age_group: c.age_group ?? null,
        guardian_name: c.guardian_name ?? null,
        city_name: c.city_name ?? null,
        birth_date: c.birth_date ?? null,
        referral_source: c.referral_source ?? null,
        medical_record_number: c.medical_record_number ?? null,
      };
    });

    return formattedCustomers;
  } catch (err) {
    console.error("Customers fetch error:", err);
    return [];
  }
}

export async function updateCustomerQuestionnaire(
  customerId: string,
  data: {
    guardian_name?: string | null;
    birth_month?: number | null;
    gender?: string | null;
    age_group?: string | null;
    city_name?: string | null;
    birth_date?: string | null;
    referral_source?: string | null;
  }
) {
  const { clinicId } = await checkAdminAuth();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");
  const supabase = createAdminClient(url, key);
  const { error } = await supabase
    .from("customers")
    .update(data)
    .eq("id", customerId)
    .eq("clinic_id", clinicId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/customers");
  return { success: true };
}

export async function updateCustomerInfo(
  customerId: string, 
  name: string, 
  phone: string,
  medicalRecordNumber?: string | null
) {
  const { clinicId } = await checkAdminAuth();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createAdminClient(url, key);
  
  const updateData: any = { 
    name: name.trim(), 
    phone: phone.trim() 
  };
  
  if (medicalRecordNumber !== undefined) {
    updateData.medical_record_number = medicalRecordNumber?.trim() || null;
  }

  const { error } = await supabase
    .from("customers")
    .update(updateData)
    .eq("id", customerId)
    .eq("clinic_id", clinicId);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/customers");
  return { success: true };
}

/**
 * 二つの顧客データを統合する（名寄せ）
 * sourceId の予約履歴を targetId へ移動し、sourceId を削除する
 */
export async function mergeCustomers(sourceId: string, targetId: string) {
  const { clinicId } = await checkAdminAuth();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createAdminClient(url, key);

  // 1. 予約データの移行
  const { error: moveError } = await supabase
    .from("appointments")
    .update({ customer_id: targetId })
    .eq("customer_id", sourceId)
    .eq("clinic_id", clinicId);

  if (moveError) {
    console.error("Failed to move appointments:", moveError);
    throw new Error("予約データの移行に失敗しました");
  }

  // 2. 元の顧客データを削除
  const { error: deleteError } = await supabase
    .from("customers")
    .delete()
    .eq("id", sourceId)
    .eq("clinic_id", clinicId);

  if (deleteError) {
    console.error("Failed to delete source customer:", deleteError);
    // 予約は既に移動済みなので、ここでのエラーは致命的ではないかもしれないが通知
  }

  revalidatePath("/admin/customers");
  return { success: true };
}

export async function linkLineUser(customerId: string, lineUserId: string) {
  const { clinicId } = await checkAdminAuth();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createAdminClient(url, key);
  const { error } = await supabase
    .from("customers")
    .update({ line_user_id: lineUserId.trim() })
    .eq("id", customerId)
    .eq("clinic_id", clinicId);

  if (error) {
    console.error("linkLineUser error:", error);
    throw new Error(error.message);
  }
  revalidatePath("/admin/customers");
  return { success: true };
}

export async function unlinkLineUser(customerId: string) {
  const { clinicId } = await checkAdminAuth();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createAdminClient(url, key);
  const { error } = await supabase
    .from("customers")
    .update({ line_user_id: null })
    .eq("id", customerId)
    .eq("clinic_id", clinicId);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/customers");
}

// 最近LINEからメッセージを送ってきた未紐づけのユーザーIDを取得
export async function getRecentUnlinkedLineLogs(): Promise<{ user_id: string; message: string | null; created_at: string }[]> {
  await checkAdminAuth();

  // RLSをバイパスするためにservice roleキーで接続
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const supabase = createAdminClient(url, key);

  // line_debug_logsからユニークなuser_idを取得（最近のもの優先）
  const { data: logs, error: logsError } = await supabase
    .from("line_debug_logs")
    .select("user_id, message, created_at")
    .neq("user_id", "unknown")
    .order("created_at", { ascending: false })
    .limit(200);

  if (logsError) {
    console.error("line_debug_logs fetch error:", logsError);
    return [];
  }
  if (!logs || logs.length === 0) return [];

  // 既に紐づけ済みのLINE IDを取得
  const { data: linked } = await supabase
    .from("customers")
    .select("line_user_id")
    .not("line_user_id", "is", null);

  const linkedIds = new Set((linked || []).map((c: any) => c.line_user_id));

  // ユニーク化（最新のメッセージのみ）& 未紐づけのみ
  const seen = new Set<string>();
  const result: { user_id: string; message: string | null; created_at: string }[] = [];
  for (const log of logs) {
    if (!seen.has(log.user_id) && !linkedIds.has(log.user_id)) {
      seen.add(log.user_id);
      result.push({ user_id: log.user_id, message: log.message, created_at: log.created_at });
    }
    if (result.length >= 20) break;
  }
  return result;
}

export async function toggleBookingSuspension(customerId: string, suspend: boolean) {
  const { clinicId } = await checkAdminAuth();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createAdminClient(url, key);
  const { error } = await supabase
    .from("customers")
    .update({ booking_suspended: suspend })
    .eq("id", customerId)
    .eq("clinic_id", clinicId);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/customers");
}
