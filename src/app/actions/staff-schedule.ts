"use server";

import { requireRole, checkAdminAuth } from "@/app/actions/auth";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}

export type OverrideKind = "meeting" | "leave" | "training" | "other";

export type StaffOverrideRow = {
  id: string;
  staff_id: string;
  staff_name: string | null;
  date: string;           // YYYY-MM-DD
  start_time: string | null;
  end_time: string | null;
  kind: OverrideKind;
  note: string | null;
  blocks_booking: boolean;
  created_by_email: string | null;
  created_at: string;
};

export type StaffOption = { id: string; name: string };

export async function listActiveStaff(): Promise<{ success: boolean; staff?: StaffOption[]; error?: string }> {
  const auth = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { data, error } = await sb
    .from("reservation_staff")
    .select("id, name")
    .eq("clinic_id", auth.clinicId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, staff: (data ?? []) as StaffOption[] };
}

type ListOverridesOptions = {
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string;   // YYYY-MM-DD inclusive
};

export async function listOverrides(
  opts: ListOverridesOptions
): Promise<{ success: boolean; rows?: StaffOverrideRow[]; error?: string }> {
  const auth = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { data, error } = await sb
    .from("staff_working_overrides")
    .select("id, staff_id, date, start_time, end_time, kind, note, blocks_booking, created_by_email, created_at, reservation_staff(name)")
    .eq("clinic_id", auth.clinicId)
    .gte("date", opts.startDate)
    .lte("date", opts.endDate)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) return { success: false, error: error.message };

  const rows: StaffOverrideRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    staff_id: r.staff_id,
    staff_name: Array.isArray(r.reservation_staff) ? r.reservation_staff[0]?.name : r.reservation_staff?.name ?? null,
    date: r.date,
    start_time: r.start_time,
    end_time: r.end_time,
    kind: r.kind,
    note: r.note,
    blocks_booking: r.blocks_booking,
    created_by_email: r.created_by_email,
    created_at: r.created_at,
  }));

  return { success: true, rows };
}

export type CreateOverrideInput = {
  staff_id: string;
  date: string;                 // YYYY-MM-DD
  start_time: string | null;    // HH:MM, null なら終日
  end_time: string | null;
  kind: OverrideKind;
  note?: string | null;
  blocks_booking?: boolean;     // default true
};

export async function createOverride(
  input: CreateOverrideInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  // owner/admin のみ
  const auth = await requireRole(["owner", "admin"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  if (!input.staff_id || !input.date || !input.kind) {
    return { success: false, error: "必須項目が不足しています" };
  }
  // start/end の整合性チェック
  if ((input.start_time && !input.end_time) || (!input.start_time && input.end_time)) {
    return { success: false, error: "開始・終了時刻はどちらも指定するか、両方未指定（終日）にしてください" };
  }
  if (input.start_time && input.end_time && input.start_time >= input.end_time) {
    return { success: false, error: "終了時刻は開始時刻より後にしてください" };
  }

  const { data, error } = await sb
    .from("staff_working_overrides")
    .insert({
      clinic_id: auth.clinicId,
      staff_id: input.staff_id,
      date: input.date,
      start_time: input.start_time,
      end_time: input.end_time,
      kind: input.kind,
      note: input.note ?? null,
      blocks_booking: input.blocks_booking ?? true,
      created_by_email: auth.email ?? null,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings/staff-schedule");
  return { success: true, id: data?.id };
}

export async function deleteOverride(id: string): Promise<{ success: boolean; error?: string }> {
  const auth = await requireRole(["owner", "admin"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { error } = await sb
    .from("staff_working_overrides")
    .delete()
    .eq("id", id)
    .eq("clinic_id", auth.clinicId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings/staff-schedule");
  return { success: true };
}

/**
 * 患者LP (anon) から呼び出すラッパー：
 * NEXT_PUBLIC_CLINIC_ID 環境変数を使って自院の clinic_id を解決し、ブロック中スロットを返す。
 */
export async function getBlockedTimesForCurrentClinic(dateStr: string): Promise<string[]> {
  const clinicId = process.env.NEXT_PUBLIC_CLINIC_ID ?? "00000000-0000-0000-0000-000000000001";
  return getBlockedTimesForDate(clinicId, dateStr);
}

/**
 * 患者LPの予約スロット計算で使う：
 * その日に「全スタッフがブロック中」または「予約可能なスタッフが残らない」時間帯を返す。
 *
 * シンプル実装：
 *  - blocks_booking=true の override を全件取得
 *  - active reservation_staff の人数 N と比較し、ある時間帯で全 N 人が overrides に含まれる場合のみ block
 *  - 終日 override (start_time=null) は全営業時間が対象
 *
 * 戻り値は HH:MM の配列。getTimeSlots() の結果と Set で減算して使う想定。
 */
export async function getBlockedTimesForDate(
  clinicId: string,
  dateStr: string
): Promise<string[]> {
  const sb = getServiceClient();
  if (!sb) return [];

  const [{ data: staffData }, { data: overrideData }] = await Promise.all([
    sb
      .from("reservation_staff")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("is_active", true)
      .eq("available_for_online_booking", true),
    sb
      .from("staff_working_overrides")
      .select("staff_id, start_time, end_time")
      .eq("clinic_id", clinicId)
      .eq("date", dateStr)
      .eq("blocks_booking", true),
  ]);

  const activeStaffIds = new Set((staffData ?? []).map((s: any) => s.id));
  const totalStaff = activeStaffIds.size;
  if (totalStaff === 0) return [];

  // 30 分グリッドで集計
  const blockedSlots: string[] = [];
  const allSlots = [
    "08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30",
    "13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30",
    "18:00","18:30","19:00","19:30","20:00","20:30","21:00","21:30","22:00","22:30",
  ];
  for (const slot of allSlots) {
    const blockedStaff = new Set<string>();
    for (const o of (overrideData ?? []) as any[]) {
      if (!activeStaffIds.has(o.staff_id)) continue;
      // 終日 override
      if (!o.start_time || !o.end_time) {
        blockedStaff.add(o.staff_id);
        continue;
      }
      // 時間範囲チェック: slot が [start, end) に含まれるか
      if (slot >= o.start_time && slot < o.end_time) {
        blockedStaff.add(o.staff_id);
      }
    }
    if (blockedStaff.size >= totalStaff) blockedSlots.push(slot);
  }
  return blockedSlots;
}
