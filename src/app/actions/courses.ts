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
  /** 集計用カテゴリ: jusei (柔整) / shinkyu (鍼灸) / seitai (整体) / null (未分類) */
  category?: "jusei" | "shinkyu" | "seitai" | null;
  // ── 部門・席予約（カフェ等）。部門なし院では全て NULL/既定値で従来通り動く ──
  /** どの部門のメニューか（'サロン' | 'カフェ' 等）。NULL=部門なし院 */
  department?: string | null;
  /** 'service'=施術(1対1) / 'seating'=席(人数制) */
  capacity_type?: "service" | "seating";
  /** 席予約: 1予約あたり最大人数（NULL=制限なし） */
  max_party_size?: number | null;
  /** 席予約: 席種の在庫（同時に取れる卓/席数）。NULL=制限なし */
  inventory_count?: number | null;
  /** 席予約: 最低人数（個室=5）。NULL=制限なし */
  min_party_size?: number | null;
  /** 席予約: 子連れなら最低人数を免除（個室=true） */
  allow_children_exception?: boolean;
};

export type ReservationStaff = {
  id: string;
  clinic_id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  /** ダッシュボードのタイムテーブルビューに表示するか（受付助手等を非表示にする） */
  show_in_timeline?: boolean;
  /** ログイン用 email。/admin/my-schedule で本人スタッフレコード解決に使う */
  email?: string | null;
  /** 月間施術目標数（合計）。NULL or 0 ならタイムテーブルに目標を出さない */
  monthly_visit_target?: number | null;
  /** 月間目標: 柔整カテゴリ */
  target_jusei?: number | null;
  /** 月間目標: 鍼灸カテゴリ */
  target_shinkyu?: number | null;
  /** 月間目標: 整体カテゴリ */
  target_seitai?: number | null;
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

/**
 * アクティブコースを「使用回数（人気順）」で取得。同数のときは sort_order でフォールバック。
 * 過去 daysBack 日（デフォルト 90 日）の appointments を集計。
 * Fail-safe: 集計失敗時は sort_order 順を返す。
 */
export async function getActiveCoursesByPopularity(daysBack: number = 90): Promise<ReservationCourse[]> {
  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const DEFAULT_CLINIC_ID = PUBLIC_CLINIC_ID;

  try {
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: courses } = await adminClient
      .from("reservation_courses")
      .select("*")
      .eq("clinic_id", DEFAULT_CLINIC_ID)
      .eq("is_active", true);

    if (!courses || courses.length === 0) return [];

    // 過去 daysBack 日の予約から course_id 別の使用回数を集計
    const since = new Date();
    since.setDate(since.getDate() - daysBack);
    const { data: apts } = await adminClient
      .from("appointments")
      .select("course_id")
      .eq("clinic_id", DEFAULT_CLINIC_ID)
      .neq("status", "cancelled")
      .gte("start_time", since.toISOString())
      .not("course_id", "is", null);

    const countMap = new Map<string, number>();
    for (const a of apts ?? []) {
      if (a.course_id) countMap.set(a.course_id, (countMap.get(a.course_id) ?? 0) + 1);
    }

    // 使用回数 DESC、同数なら sort_order ASC
    return [...courses].sort((a, b) => {
      const ca = countMap.get(a.id) ?? 0;
      const cb = countMap.get(b.id) ?? 0;
      if (cb !== ca) return cb - ca;
      return (a.sort_order ?? 9999) - (b.sort_order ?? 9999);
    });
  } catch (e) {
    console.error("[getActiveCoursesByPopularity] fallback to sort_order:", e);
    return getActiveCourses();
  }
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

  // category は undefined なら touch しない（既存値を保持）
  const normalizedCategory = (() => {
    if (course.category === undefined) return undefined;
    if (course.category === null) return null;
    const c = String(course.category);
    return (c === "jusei" || c === "shinkyu" || c === "seitai") ? c : null;
  })();

  const payload: Record<string, unknown> = {
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
  if (normalizedCategory !== undefined) {
    payload.category = normalizedCategory;
  }

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

// ── コース並び替え（sort_order を一括更新） ──
// orderedIds を「表示したい順」で受け取り、sort_order = 0,1,2... を振り直す。
// 他カラムには触れないので編集内容を壊さない。自院（clinic_id）のみ更新。
export async function reorderCourses(orderedIds: string[]) {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("reservation_courses")
      .update({ sort_order: i })
      .eq("id", orderedIds[i])
      .eq("clinic_id", clinicId);
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

  // email は trim、空文字なら null。重複バリデーションはサーバー側で軽くチェック
  const normalizedEmail = (() => {
    if (staff.email === undefined) return undefined; // 触らない（更新時に email を送らないケース）
    if (staff.email === null) return null;
    const e = String(staff.email).trim().toLowerCase();
    return e || null;
  })();

  // 目標値: undefined なら触らない、0 や空は null として保存
  const normalizeTarget = (v: unknown): number | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  };
  const normalizedTarget   = normalizeTarget(staff.monthly_visit_target);
  const normalizedJusei    = normalizeTarget(staff.target_jusei);
  const normalizedShinkyu  = normalizeTarget(staff.target_shinkyu);
  const normalizedSeitai   = normalizeTarget(staff.target_seitai);

  const payload: Record<string, unknown> = {
    clinic_id: clinicId,
    name: staff.name,
    is_active: staff.is_active ?? true,
    sort_order: staff.sort_order ?? 0,
    show_in_timeline: staff.show_in_timeline ?? true,
  };
  if (normalizedEmail !== undefined) {
    payload.email = normalizedEmail;
  }
  if (normalizedTarget !== undefined) {
    payload.monthly_visit_target = normalizedTarget;
  }
  if (normalizedJusei   !== undefined) payload.target_jusei   = normalizedJusei;
  if (normalizedShinkyu !== undefined) payload.target_shinkyu = normalizedShinkyu;
  if (normalizedSeitai  !== undefined) payload.target_seitai  = normalizedSeitai;

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
