"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { checkAdminAuth } from "./auth";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key);
}

/**
 * 同日同名の既存予約を取得（兄弟・親子の重複登録 / 二重予約検出用）。
 * 名前完全一致でヒットした customers すべてについて当日の予約を返す。
 *
 * NOTE: 本関数は adminReserve.ts から意図的に切り出してある。
 * adminReserve.ts には createManualReservation など多数の Server Action があり、
 * 新規 export を追加すると Next.js 16 が同ファイル内の Action ID を再計算して、
 * 既にロード済みのクライアント bundle と mismatch を起こす（=「通信エラー」）。
 * 重複チェック系の Server Action は本ファイルに集約し、createManualReservation
 * 側の Action ID を安定させる。
 */
export async function findSameDayAppointmentsByName(
  dateStr: string,
  name: string,
): Promise<{
  appointments: {
    id: string;
    time: string; // "HH:mm"
    customerId: string | null;
    phone: string | null;
    medicalRecordNumber: string | null;
  }[];
  customerCount: number; // 同名顧客の件数（兄弟・親子の可能性指標）
}> {
  try {
    const { clinicId } = await checkAdminAuth();
    const trimmed = name.trim();
    if (!trimmed || !dateStr) return { appointments: [], customerCount: 0 };

    const supabase = getAdminSupabase();
    if (!supabase) return { appointments: [], customerCount: 0 };

    const { data: sameNameCustomers } = await supabase
      .from("customers")
      .select("id, phone, medical_record_number")
      .eq("clinic_id", clinicId)
      .eq("name", trimmed);

    if (!sameNameCustomers || sameNameCustomers.length === 0) {
      return { appointments: [], customerCount: 0 };
    }

    const customerIds = sameNameCustomers.map((c) => c.id);
    const dayStart = `${dateStr}T00:00:00+09:00`;
    const dayEnd = `${dateStr}T23:59:59+09:00`;

    const { data: apts } = await supabase
      .from("appointments")
      .select("id, start_time, customer_id")
      .eq("clinic_id", clinicId)
      .in("customer_id", customerIds)
      .neq("status", "cancelled")
      .gte("start_time", dayStart)
      .lte("start_time", dayEnd)
      .order("start_time", { ascending: true });

    const byId = new Map(
      sameNameCustomers.map((c) => [c.id, c]),
    );
    const appointments = (apts ?? []).map((a) => {
      const cust = byId.get(a.customer_id as string);
      return {
        id: a.id as string,
        time: String(a.start_time).slice(11, 16),
        customerId: (a.customer_id as string) ?? null,
        phone: cust?.phone ?? null,
        medicalRecordNumber: cust?.medical_record_number ?? null,
      };
    });

    return { appointments, customerCount: sameNameCustomers.length };
  } catch (err) {
    console.error("findSameDayAppointmentsByName error:", err);
    return { appointments: [], customerCount: 0 };
  }
}
