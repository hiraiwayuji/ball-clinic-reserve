"use server";

import { revalidatePath } from "next/cache";
import { checkAdminAuth } from "./auth";

export type ReservationCourse = {
  id: string;
  clinic_id: string;
  name: string;
  duration_minutes: number;
  price: number | null;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

export type ReservationStaff = {
  id: string;
  clinic_id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
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

  const DEFAULT_CLINIC_ID = "00000000-0000-0000-0000-000000000001";

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
  const DEFAULT_CLINIC_ID = "00000000-0000-0000-0000-000000000001";

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
    description: course.description ?? null,
    is_active: course.is_active ?? true,
    sort_order: course.sort_order ?? 0,
  };

  if (course.id) {
    const { error } = await supabase
      .from("reservation_courses")
      .update(payload)
      .eq("id", course.id)
      .eq("clinic_id", clinicId);
    if (error) return { success: false, error: error.message };
  } else {
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
  };

  if (staff.id) {
    const { error } = await supabase
      .from("reservation_staff")
      .update(payload)
      .eq("id", staff.id)
      .eq("clinic_id", clinicId);
    if (error) return { success: false, error: error.message };
  } else {
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
