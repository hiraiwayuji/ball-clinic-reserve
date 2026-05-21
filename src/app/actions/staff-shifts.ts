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

// ─────────────────────────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────────────────────────

export type ShiftLocationRow = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type ShiftSource = "manual" | "ai" | "imported";
export type ShiftStatus = "draft" | "confirmed" | "archived";
export type ShiftTaskType = "hanamaru" | "toko" | "break" | null;

export type StaffShiftRow = {
  id: string;
  staff_id: string;
  staff_name: string | null;
  staff_color: string | null;
  location_id: string;
  location_name: string | null;
  date: string;          // YYYY-MM-DD
  start_time: string;    // HH:MM
  end_time: string;      // HH:MM
  task_type: ShiftTaskType;
  note: string | null;
  source: ShiftSource;
  status: ShiftStatus;
  generation_id: string | null;
};

// ─────────────────────────────────────────────────────────────────
// shift_locations: 場所マスタ CRUD
// ─────────────────────────────────────────────────────────────────

export async function listShiftLocations(): Promise<{
  success: boolean;
  rows?: ShiftLocationRow[];
  error?: string;
}> {
  const auth = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { data, error } = await sb
    .from("shift_locations")
    .select("id, name, sort_order, is_active")
    .eq("clinic_id", auth.clinicId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, rows: (data ?? []) as ShiftLocationRow[] };
}

export type UpsertShiftLocationInput = {
  id?: string;            // 既存なら指定（update）、なければ create
  name: string;
  sort_order?: number;
  is_active?: boolean;
};

export async function upsertShiftLocation(
  input: UpsertShiftLocationInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const auth = await requireRole(["owner", "admin"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const name = input.name?.trim();
  if (!name) return { success: false, error: "場所名を入力してください" };

  if (input.id) {
    const { error } = await sb
      .from("shift_locations")
      .update({
        name,
        sort_order: input.sort_order ?? 0,
        is_active: input.is_active ?? true,
      })
      .eq("id", input.id)
      .eq("clinic_id", auth.clinicId);

    if (error) return { success: false, error: error.message };
    revalidatePath("/admin/settings/staff-schedule");
    return { success: true, id: input.id };
  }

  const { data, error } = await sb
    .from("shift_locations")
    .insert({
      clinic_id: auth.clinicId,
      name,
      sort_order: input.sort_order ?? 0,
      is_active: input.is_active ?? true,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings/staff-schedule");
  return { success: true, id: data?.id };
}

/** 場所の論理削除。参照中の staff_shifts があるため、物理削除はしない。 */
export async function deactivateShiftLocation(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireRole(["owner", "admin"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { error } = await sb
    .from("shift_locations")
    .update({ is_active: false })
    .eq("id", id)
    .eq("clinic_id", auth.clinicId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings/staff-schedule");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────
// staff_shifts: シフト本体 CRUD
// ─────────────────────────────────────────────────────────────────

export type ListShiftsOptions = {
  startDate: string;      // YYYY-MM-DD inclusive
  endDate: string;        // YYYY-MM-DD inclusive
  status?: ShiftStatus | "all";
};

export async function listShifts(
  opts: ListShiftsOptions,
): Promise<{ success: boolean; rows?: StaffShiftRow[]; error?: string }> {
  const auth = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  let query = sb
    .from("staff_shifts")
    .select(
      "id, staff_id, location_id, date, start_time, end_time, task_type, note, source, status, generation_id, reservation_staff(name, display_color), shift_locations(name)",
    )
    .eq("clinic_id", auth.clinicId)
    .gte("date", opts.startDate)
    .lte("date", opts.endDate)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (opts.status && opts.status !== "all") {
    query = query.eq("status", opts.status);
  }

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  const rows: StaffShiftRow[] = (data ?? []).map((r: any) => {
    const staff = Array.isArray(r.reservation_staff)
      ? r.reservation_staff[0]
      : r.reservation_staff;
    const location = Array.isArray(r.shift_locations)
      ? r.shift_locations[0]
      : r.shift_locations;
    return {
      id: r.id,
      staff_id: r.staff_id,
      staff_name: staff?.name ?? null,
      staff_color: staff?.display_color ?? null,
      location_id: r.location_id,
      location_name: location?.name ?? null,
      date: r.date,
      start_time: r.start_time?.slice(0, 5) ?? "",
      end_time: r.end_time?.slice(0, 5) ?? "",
      task_type: r.task_type,
      note: r.note,
      source: r.source,
      status: r.status,
      generation_id: r.generation_id,
    };
  });

  return { success: true, rows };
}

export type CreateShiftInput = {
  staff_id: string;
  location_id: string;
  date: string;           // YYYY-MM-DD
  start_time: string;     // HH:MM
  end_time: string;       // HH:MM
  task_type?: ShiftTaskType;
  note?: string | null;
  status?: ShiftStatus;   // 通常 'confirmed'。AI 案などは 'draft'
};

function validateShiftTime(start: string, end: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
    return "時刻は HH:MM 形式で指定してください";
  }
  if (start >= end) {
    return "終了時刻は開始時刻より後にしてください";
  }
  return null;
}

export async function createShift(
  input: CreateShiftInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const auth = await requireRole(["owner", "admin"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  if (!input.staff_id || !input.location_id || !input.date) {
    return { success: false, error: "必須項目が不足しています" };
  }
  const timeErr = validateShiftTime(input.start_time, input.end_time);
  if (timeErr) return { success: false, error: timeErr };

  const status: ShiftStatus = input.status ?? "confirmed";

  const { data, error } = await sb
    .from("staff_shifts")
    .insert({
      clinic_id: auth.clinicId,
      staff_id: input.staff_id,
      location_id: input.location_id,
      date: input.date,
      start_time: input.start_time,
      end_time: input.end_time,
      task_type: input.task_type ?? null,
      note: input.note ?? null,
      source: "manual",
      status,
      created_by: auth.userId,
      updated_by: auth.userId,
      confirmed_at: status === "confirmed" ? new Date().toISOString() : null,
      confirmed_by: status === "confirmed" ? auth.userId : null,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings/staff-schedule");
  return { success: true, id: data?.id };
}

export type UpdateShiftInput = Partial<{
  staff_id: string;
  location_id: string;
  date: string;
  start_time: string;
  end_time: string;
  task_type: ShiftTaskType;
  note: string | null;
  status: ShiftStatus;
}>;

export async function updateShift(
  id: string,
  patch: UpdateShiftInput,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireRole(["owner", "admin"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  if (patch.start_time && patch.end_time) {
    const timeErr = validateShiftTime(patch.start_time, patch.end_time);
    if (timeErr) return { success: false, error: timeErr };
  }

  const updateData: Record<string, unknown> = { ...patch, updated_by: auth.userId };

  if (patch.status === "confirmed") {
    // 状態が confirmed に変わるタイミングで confirmed_at / by を更新
    updateData.confirmed_at = new Date().toISOString();
    updateData.confirmed_by = auth.userId;
  }

  const { error } = await sb
    .from("staff_shifts")
    .update(updateData)
    .eq("id", id)
    .eq("clinic_id", auth.clinicId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings/staff-schedule");
  return { success: true };
}

export async function deleteShift(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireRole(["owner", "admin"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { error } = await sb
    .from("staff_shifts")
    .delete()
    .eq("id", id)
    .eq("clinic_id", auth.clinicId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings/staff-schedule");
  return { success: true };
}

/**
 * 期間内のシフトを別期間に一括コピー（複製機能）
 * 例: 先週(5/11-17)のシフトを今週(5/18-24)にコピー
 * date 差分は単純な日数オフセットで計算する。
 */
export async function copyShifts(input: {
  sourceStartDate: string;
  sourceEndDate: string;
  destStartDate: string;        // 結果が destStartDate から始まる
}): Promise<{ success: boolean; copiedCount?: number; error?: string }> {
  const auth = await requireRole(["owner", "admin"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  if (input.sourceStartDate > input.sourceEndDate) {
    return { success: false, error: "期間指定が不正です" };
  }

  const { data: source, error: selErr } = await sb
    .from("staff_shifts")
    .select(
      "staff_id, location_id, date, start_time, end_time, task_type, note",
    )
    .eq("clinic_id", auth.clinicId)
    .gte("date", input.sourceStartDate)
    .lte("date", input.sourceEndDate);
  if (selErr) return { success: false, error: selErr.message };
  if (!source || source.length === 0) {
    return { success: true, copiedCount: 0 };
  }

  // dateオフセット: sourceStartDate → destStartDate の日数差
  const srcStart = new Date(`${input.sourceStartDate}T00:00:00+09:00`);
  const dstStart = new Date(`${input.destStartDate}T00:00:00+09:00`);
  const offsetDays = Math.round(
    (dstStart.getTime() - srcStart.getTime()) / (24 * 60 * 60 * 1000),
  );

  const inserts = source.map((r: any) => {
    const srcDate = new Date(`${r.date}T00:00:00+09:00`);
    const dstDate = new Date(srcDate.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    const newDate = dstDate.toISOString().slice(0, 10);
    return {
      clinic_id: auth.clinicId,
      staff_id: r.staff_id,
      location_id: r.location_id,
      date: newDate,
      start_time: r.start_time,
      end_time: r.end_time,
      task_type: r.task_type,
      note: r.note,
      source: "manual" as const,
      status: "confirmed" as const,
      created_by: auth.userId,
      updated_by: auth.userId,
      confirmed_at: new Date().toISOString(),
      confirmed_by: auth.userId,
    };
  });

  // tenant-isolation-ignore: inserts の各行に clinic_id を埋め込み済み（L367）
  const { error: insErr } = await sb.from("staff_shifts").insert(inserts);
  if (insErr) return { success: false, error: insErr.message };

  revalidatePath("/admin/settings/staff-schedule");
  return { success: true, copiedCount: inserts.length };
}

// ─────────────────────────────────────────────────────────────────
// スタッフ表示色の設定
// ─────────────────────────────────────────────────────────────────

// プリセット色（STAFF_COLOR_PRESETS）と StaffColorKey 型は
// @/lib/staff-colors.ts に分離（"use server" ファイルからは object を export できないため）

export async function updateStaffColor(
  staffId: string,
  color: string | null,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireRole(["owner", "admin"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { error } = await sb
    .from("reservation_staff")
    .update({ display_color: color })
    .eq("id", staffId)
    .eq("clinic_id", auth.clinicId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings/staff-schedule");
  return { success: true };
}
