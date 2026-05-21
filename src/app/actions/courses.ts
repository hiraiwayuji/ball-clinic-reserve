"use server";

import { revalidatePath } from "next/cache";
import { checkAdminAuth } from "./auth";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";

export type ReservationCourse = {
  id: string;
  clinic_id: string;
  name: string;
  duration_minutes: number;
  price: number | null;
  /** 初診時の税込価格。NULL なら price をフォールバックに使う。 */
  first_visit_price: number | null;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  image_url: string | null;
  is_coupon: boolean;
  is_first_visit_only: boolean;
  is_repeat_only: boolean;
  regular_price: number | null;
  badge_label: string | null;
};

export type ReservationStaff = {
  id: string;
  clinic_id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  /** ダッシュボードのタイムテーブルビューに表示するか（受付助手等を非表示にする） */
  show_in_timeline?: boolean;
};

// ── コース取得（管理側：全件） ──
export async function getCourses(): Promise<ReservationCourse[]> {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data } = await supabase
    .from("reservation_courses")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("sort_order")
    .order("created_at");

  return data ?? [];
}

// ── コース取得（患者側：有効なもののみ） ──
export async function getActiveCourses(): Promise<ReservationCourse[]> {
  const { createClient } = await import("@/lib/supabase/server");
  const { createClient: createAdminClient } = await import("@supabase/supabase-js");

  const DEFAULT_CLINIC_ID = PUBLIC_CLINIC_ID;

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data } = await adminClient
    .from("reservation_courses")
    .select("*")
    .eq("clinic_id", DEFAULT_CLINIC_ID)
    .eq("is_active", true)
    .order("sort_order")
    .order("created_at");

  return data ?? [];
}

// ── スタッフ取得（管理側：全件） ──
export async function getStaffList(): Promise<ReservationStaff[]> {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data } = await supabase
    .from("reservation_staff")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("sort_order")
    .order("created_at");

  return data ?? [];
}

// ── スタッフ取得（患者側：有効なもののみ） ──
export async function getActiveStaff(): Promise<ReservationStaff[]> {
  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const DEFAULT_CLINIC_ID = PUBLIC_CLINIC_ID;

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data } = await adminClient
    .from("reservation_staff")
    .select("*")
    .eq("clinic_id", DEFAULT_CLINIC_ID)
    .eq("is_active", true)
    .order("sort_order")
    .order("created_at");

  return data ?? [];
}

// ── コース保存（upsert） ──
export async function saveCourse(course: Partial<ReservationCourse> & { name: string; duration_minutes: number }) {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const payload = {
    clinic_id: clinicId,
    name: course.name,
    duration_minutes: course.duration_minutes,
    price: course.price ?? null,
    first_visit_price: course.first_visit_price ?? null,
    description: course.description ?? null,
    is_active: course.is_active ?? true,
    sort_order: course.sort_order ?? 0,
    image_url: course.image_url ?? null,
    is_coupon: course.is_coupon ?? false,
    is_first_visit_only: course.is_first_visit_only ?? false,
    is_repeat_only: course.is_repeat_only ?? false,
    regular_price: course.regular_price ?? null,
    badge_label: course.badge_label ?? null,
  };

  if (course.id) {
    const { error } = await supabase
      .from("reservation_courses")
      .update(payload)
      .eq("id", course.id)
      .eq("clinic_id", clinicId);
    if (error) return { success: false, error: error.message };
  } else {
    // tenant-isolation-ignore: payload.clinic_id 設定済み（このファイルの saveCourse 内）
    const { error } = await supabase
      .from("reservation_courses")
      .insert(payload);
    if (error) return { success: false, error: error.message };
  }

  revalidatePath("/admin/settings");
  return { success: true };
}

// ── コース削除 ──
export async function deleteCourse(id: string) {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { error } = await supabase
    .from("reservation_courses")
    .delete()
    .eq("id", id)
    .eq("clinic_id", clinicId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings");
  return { success: true };
}

// ── スタッフ保存（upsert） ──
export async function saveStaff(staff: Partial<ReservationStaff> & { name: string }) {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const payload = {
    clinic_id: clinicId,
    name: staff.name,
    is_active: staff.is_active ?? true,
    sort_order: staff.sort_order ?? 0,
    show_in_timeline: staff.show_in_timeline ?? true,
  };

  if (staff.id) {
    const { error } = await supabase
      .from("reservation_staff")
      .update(payload)
      .eq("id", staff.id)
      .eq("clinic_id", clinicId);
    if (error) return { success: false, error: error.message };
  } else {
    // tenant-isolation-ignore: payload.clinic_id 設定済み（このファイルの saveStaff 内）
    const { error } = await supabase
      .from("reservation_staff")
      .insert(payload);
    if (error) return { success: false, error: error.message };
  }

  revalidatePath("/admin/settings");
  return { success: true };
}

// ── スタッフ削除 ──
export async function deleteStaff(id: string) {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { error } = await supabase
    .from("reservation_staff")
    .delete()
    .eq("id", id)
    .eq("clinic_id", clinicId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings");
  return { success: true };
}

// ─────────────────────────────────────────────────────────
// 個室（ReservationRoom）
// ─────────────────────────────────────────────────────────

export type ReservationRoom = {
  id: string;
  clinic_id: string;
  name: string;
  description: string | null;
  capacity: number;
  is_active: boolean;
  sort_order: number;
};

// ── 個室取得（管理側：全件） ──
export async function getRooms(): Promise<ReservationRoom[]> {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data } = await supabase
    .from("reservation_rooms")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("sort_order")
    .order("created_at");

  return data ?? [];
}

// ── 個室取得（患者側：有効なもののみ） ──
export async function getActiveRooms(): Promise<ReservationRoom[]> {
  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const DEFAULT_CLINIC_ID = PUBLIC_CLINIC_ID;

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data } = await adminClient
    .from("reservation_rooms")
    .select("*")
    .eq("clinic_id", DEFAULT_CLINIC_ID)
    .eq("is_active", true)
    .order("sort_order")
    .order("created_at");

  return data ?? [];
}

// ── 個室保存（upsert） ──
export async function saveRoom(room: Partial<ReservationRoom> & { name: string }) {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const payload = {
    clinic_id: clinicId,
    name: room.name,
    description: room.description ?? null,
    capacity: room.capacity ?? 1,
    is_active: room.is_active ?? true,
    sort_order: room.sort_order ?? 0,
  };

  if (room.id) {
    const { error } = await supabase
      .from("reservation_rooms")
      .update(payload)
      .eq("id", room.id)
      .eq("clinic_id", clinicId);
    if (error) return { success: false, error: error.message };
  } else {
    // tenant-isolation-ignore: payload.clinic_id 設定済み（このファイルの saveRoom 内）
    const { error } = await supabase
      .from("reservation_rooms")
      .insert(payload);
    if (error) return { success: false, error: error.message };
  }

  revalidatePath("/admin/settings");
  return { success: true };
}

// ── 個室削除 ──
export async function deleteRoom(id: string) {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { error } = await supabase
    .from("reservation_rooms")
    .delete()
    .eq("id", id)
    .eq("clinic_id", clinicId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings");
  return { success: true };
}
