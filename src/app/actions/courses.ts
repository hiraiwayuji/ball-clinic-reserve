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
  /** 価格の自由表記（例: "¥1,700〜2,300"）。設定すると患者表示で price 数値の代わりにこれを出す。
   *  保険施術など負担割合で金額が変わるメニューを「幅」で見せるのに使う。 */
  price_note?: string | null;
  /** 予約時に「一緒に追加できるメニュー」として提案するか（ボールの水素のような同時追加を汎用化）。 */
  is_bookable_addon?: boolean;
  /** 実費施術とセットのときは無料にする付帯メニュー（保険施術のときは通常料金）。
   *  true だと、同じ患者が同日に実費施術を受けていて保険施術が無いとき、
   *  一括売上入力で「¥0（無料）」を自動提案する（ボールの水素：保険の人だけ¥500）。 */
  free_with_jihi?: boolean;
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
  /** このスタッフが出勤している日だけ予約可（NULL=誰でも可）。予約時はこのスタッフを自動で担当に。 */
  required_staff_id?: string | null;
  /** required_staff_id に対応するスタッフ名（getActiveCourses で自動付与）。DBカラムではない。 */
  required_staff_name?: string | null;
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
  /** true=「基本休み・出る日だけ予約可」モード（さみ等）。false=従来どおり常に予約可 */
  schedule_based_booking?: boolean;
  /** 毎週の出勤曜日（csv: 0=日,1=月,…,6=土）。schedule_based_booking 時に使用 */
  booking_weekdays?: string | null;
  /** 既定の出勤開始時刻 "HH:MM(:SS)"（schedule_based 時。NULL=院の営業時間どおり） */
  booking_start_time?: string | null;
  /** 既定の出勤終了時刻 "HH:MM(:SS)"（schedule_based 時。NULL=院の営業時間どおり） */
  booking_end_time?: string | null;
  /** オンライン予約の対象スタッフか（予約サイトのレーン/担当に出すか） */
  available_for_online_booking?: boolean | null;
};

/** "HH:MM:SS" / "HH:MM" / 空 → "HH:MM" / null に正規化（TIME カラム保存・表示用） */
function normalizeTimeHHMM(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  return t.length >= 5 ? t.slice(0, 5) : t;
}

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
  const { createClient: createAdminClient } = await import("@supabase/supabase-js");

  const DEFAULT_CLINIC_ID = PUBLIC_CLINIC_ID;

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [{ data }, { data: staffData }] = await Promise.all([
    adminClient
      .from("reservation_courses")
      .select("*")
      .eq("clinic_id", DEFAULT_CLINIC_ID)
      .eq("is_active", true)
      .order("sort_order")
      .order("created_at"),
    adminClient
      .from("reservation_staff")
      .select("id, name")
      .eq("clinic_id", DEFAULT_CLINIC_ID)
      .eq("is_active", true),
  ]);

  const staffMap = new Map<string, string>(
    (staffData ?? []).map((s: { id: string; name: string }) => [s.id, s.name])
  );

  return (data ?? []).map((c: ReservationCourse) => ({
    ...c,
    required_staff_name: c.required_staff_id ? (staffMap.get(c.required_staff_id) ?? null) : null,
  }));
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
    price_note: course.price_note ?? null,
    is_bookable_addon: course.is_bookable_addon ?? false,
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
  // 担当固定（さみ整体など）。undefined は触らない、null/空は解除。
  if (course.required_staff_id !== undefined) {
    payload.required_staff_id = course.required_staff_id || null;
  }
  // 実費とセットなら無料（水素）。undefined は触らない（部分更新のフラグ消失を防ぐ）。
  if (course.free_with_jihi !== undefined) {
    payload.free_with_jihi = course.free_with_jihi;
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
  // 出勤日ベース予約（さみ等）
  if (staff.schedule_based_booking !== undefined) payload.schedule_based_booking = !!staff.schedule_based_booking;
  if (staff.booking_weekdays !== undefined) payload.booking_weekdays = staff.booking_weekdays || null;
  if (staff.booking_start_time !== undefined) payload.booking_start_time = normalizeTimeHHMM(staff.booking_start_time);
  if (staff.booking_end_time !== undefined) payload.booking_end_time = normalizeTimeHHMM(staff.booking_end_time);

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
// スタッフ出勤日（schedule_based_booking 用：さみ整体など）
// ─────────────────────────────────────────────────────────
export type StaffBookingDate = { date: string; available: boolean; start?: string | null; end?: string | null };

// 管理側：個別の出勤日／例外休を取得
export async function getStaffBookingDates(staffId: string): Promise<StaffBookingDate[]> {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_booking_dates")
    .select("date, available, start_time, end_time")
    .eq("clinic_id", clinicId)
    .eq("staff_id", staffId)
    .order("date");
  return (data ?? []).map((d: { date: string; available: boolean; start_time?: string | null; end_time?: string | null }) => ({
    date: String(d.date).slice(0, 10),
    available: !!d.available,
    start: normalizeTimeHHMM(d.start_time),
    end: normalizeTimeHHMM(d.end_time),
  }));
}

// 管理側：個別日を登録/更新（available=true 出勤追加 / false 例外休）
// start/end は任意の出勤時間上書き（"HH:MM" or 空）。未指定なら既定の出勤時間に従う。
export async function setStaffBookingDate(
  staffId: string,
  date: string,
  available: boolean,
  start?: string | null,
  end?: string | null,
) {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  // tenant-isolation-ignore: clinic_id を明示設定済み
  const { error } = await supabase
    .from("staff_booking_dates")
    .upsert(
      {
        clinic_id: clinicId,
        staff_id: staffId,
        date,
        available,
        // 休み(available=false)なら時間は無意味なので必ず NULL に
        start_time: available ? normalizeTimeHHMM(start) : null,
        end_time: available ? normalizeTimeHHMM(end) : null,
      },
      { onConflict: "staff_id,date" },
    );
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings");
  return { success: true };
}

// 管理側：個別日の設定を削除（曜日ルールだけに戻す）
export async function removeStaffBookingDate(staffId: string, date: string) {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_booking_dates")
    .delete()
    .eq("clinic_id", clinicId)
    .eq("staff_id", staffId)
    .eq("date", date);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings");
  return { success: true };
}

// 患者予約フロー用：コースに担当固定があり、そのスタッフが出勤日ベースなら
// 出勤曜日・個別日を返す。無ければ null（＝日付制限なし）。
export async function getCourseRequiredStaffSchedule(courseId: string): Promise<
  { staffId: string; staffName: string; weekdays: number[]; dates: StaffBookingDate[]; defaultStart: string | null; defaultEnd: string | null } | null
> {
  if (!courseId) return null;
  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const DEFAULT_CLINIC_ID = PUBLIC_CLINIC_ID;
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: course } = await admin
    .from("reservation_courses")
    .select("required_staff_id")
    .eq("id", courseId)
    .eq("clinic_id", DEFAULT_CLINIC_ID)
    .maybeSingle();
  const staffId = (course?.required_staff_id as string | null | undefined) ?? null;
  if (!staffId) return null;
  const { data: staff } = await admin
    .from("reservation_staff")
    .select("id, name, schedule_based_booking, booking_weekdays, booking_start_time, booking_end_time")
    .eq("id", staffId)
    .eq("clinic_id", DEFAULT_CLINIC_ID)
    .maybeSingle();
  if (!staff || !staff.schedule_based_booking) return null;
  const weekdays = String(staff.booking_weekdays ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => n >= 0 && n <= 6);
  const { data: dates } = await admin
    .from("staff_booking_dates")
    .select("date, available, start_time, end_time")
    .eq("clinic_id", DEFAULT_CLINIC_ID)
    .eq("staff_id", staffId);
  return {
    staffId: staff.id as string,
    staffName: staff.name as string,
    weekdays,
    defaultStart: normalizeTimeHHMM(staff.booking_start_time as string | null),
    defaultEnd: normalizeTimeHHMM(staff.booking_end_time as string | null),
    dates: (dates ?? []).map((d: { date: string; available: boolean; start_time?: string | null; end_time?: string | null }) => ({
      date: String(d.date).slice(0, 10),
      available: !!d.available,
      start: normalizeTimeHHMM(d.start_time),
      end: normalizeTimeHHMM(d.end_time),
    })),
  };
}

// ── 患者側：出勤日制スタッフ（さみ・ヘッドスパ等）の出勤スケジュール一覧 ──
// 予約フォームの指名欄で「その日お休みのスタッフを出さない」ために使う。
// schedule_based でない常勤スタッフはこのマップに含まれない（＝常に指名可）。
export async function getPublicStaffSchedules(): Promise<
  Record<string, { weekdays: number[]; dates: StaffBookingDate[]; defaultStart: string | null; defaultEnd: string | null }>
> {
  try {
    const { createClient: createAdminClient } = await import("@supabase/supabase-js");
    const DEFAULT_CLINIC_ID = PUBLIC_CLINIC_ID;
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: staff } = await admin
      .from("reservation_staff")
      .select("id, booking_weekdays, booking_start_time, booking_end_time")
      .eq("clinic_id", DEFAULT_CLINIC_ID)
      .eq("is_active", true)
      .eq("schedule_based_booking", true);
    if (!staff || staff.length === 0) return {};
    const ids = staff.map((s) => s.id as string);
    const { data: dates } = await admin
      .from("staff_booking_dates")
      .select("staff_id, date, available, start_time, end_time")
      .eq("clinic_id", DEFAULT_CLINIC_ID)
      .in("staff_id", ids);
    const out: Record<string, { weekdays: number[]; dates: StaffBookingDate[]; defaultStart: string | null; defaultEnd: string | null }> = {};
    for (const s of staff) {
      out[s.id as string] = {
        weekdays: String(s.booking_weekdays ?? "")
          .split(",").map((x) => x.trim()).filter(Boolean).map(Number).filter((n) => n >= 0 && n <= 6),
        defaultStart: normalizeTimeHHMM((s as { booking_start_time?: string | null }).booking_start_time),
        defaultEnd: normalizeTimeHHMM((s as { booking_end_time?: string | null }).booking_end_time),
        dates: (dates ?? [])
          .filter((d: { staff_id: string }) => d.staff_id === s.id)
          .map((d: { date: string; available: boolean; start_time?: string | null; end_time?: string | null }) => ({
            date: String(d.date).slice(0, 10),
            available: !!d.available,
            start: normalizeTimeHHMM(d.start_time),
            end: normalizeTimeHHMM(d.end_time),
          })),
      };
    }
    return out;
  } catch (e) {
    console.error("getPublicStaffSchedules failed", e);
    return {};
  }
}

// ─────────────────────────────────────────────────────────
// メニュー別の「最短の空き日」（メニュー一覧カードの空きバッジ用）
// ─────────────────────────────────────────────────────────
export type CourseAvailability = { courseId: string; nextDate: string | null }; // nextDate: "yyyy-MM-dd" or null(30日以内に空き無し)

export async function getCoursesAvailability(): Promise<CourseAvailability[]> {
  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const { buildSchedule, getTimeSlots, isTimeSlotWithinTwoHours } = await import("@/lib/time-slots");
  const { isStaffAvailableOnYmd, filterSlotsByStaffSchedule } = await import("@/lib/staff-availability");
  const DEFAULT_CLINIC_ID = PUBLIC_CLINIC_ID;
  try {
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // 院設定（営業時間・枠サイズ）
    const { data: settings } = await admin
      .from("clinic_settings")
      .select("slot_duration_minutes, business_open_weekday, business_close_weekday, business_open_saturday, business_close_saturday, business_break_start_weekday, business_break_end_weekday, business_break_start_saturday, business_break_end_saturday, closed_weekdays")
      .eq("id", DEFAULT_CLINIC_ID)
      .maybeSingle();
    const schedule = buildSchedule(settings);
    const slotMinutes = ([15, 20, 30].includes(Number(settings?.slot_duration_minutes)) ? Number(settings?.slot_duration_minutes) : 30) as 15 | 20 | 30;

    const courses = await getActiveCourses();
    if (courses.length === 0) return [];

    // 期間（今日〜30日）
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(today); end.setDate(end.getDate() + 30);
    const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    // 休診日
    const { data: holidays } = await admin
      .from("clinic_holidays").select("date").eq("clinic_id", DEFAULT_CLINIC_ID);
    const holidaySet = new Set((holidays ?? []).map((h: { date: string }) => String(h.date).slice(0, 10)));

    // 予約（30日分）→ 日付ごとの予約済み30分スロット集合
    const startUTC = new Date(`${ymd(today)}T00:00:00+09:00`).toISOString();
    const endUTC = new Date(`${ymd(end)}T23:59:59+09:00`).toISOString();
    const { data: apts } = await admin
      .from("appointments").select("start_time, end_time")
      .eq("clinic_id", DEFAULT_CLINIC_ID).neq("status", "cancelled")
      .gte("start_time", startUTC).lte("start_time", endUTC);
    const bookedByDate = new Map<string, Set<string>>();
    for (const a of apts ?? []) {
      const s = new Date((a as { start_time: string }).start_time).getTime();
      const e = (a as { end_time?: string | null }).end_time ? new Date((a as { end_time: string }).end_time).getTime() : s + 30 * 60000;
      for (let cur = s; cur < e; cur += 30 * 60000) {
        const j = new Date(cur + 9 * 3600000);
        const dk = `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}-${String(j.getUTCDate()).padStart(2, "0")}`;
        const tk = `${String(j.getUTCHours()).padStart(2, "0")}:${String(j.getUTCMinutes()).padStart(2, "0")}`;
        if (!bookedByDate.has(dk)) bookedByDate.set(dk, new Set());
        bookedByDate.get(dk)!.add(tk);
      }
    }

    // 担当固定コースのスタッフ出勤スケジュールをまとめて取得
    const staffIds = Array.from(new Set(courses.map((c) => c.required_staff_id).filter(Boolean))) as string[];
    const staffSched = new Map<string, import("@/lib/staff-availability").StaffSchedule>();
    if (staffIds.length > 0) {
      const { data: staffRows } = await admin
        .from("reservation_staff").select("id, schedule_based_booking, booking_weekdays, booking_start_time, booking_end_time")
        .eq("clinic_id", DEFAULT_CLINIC_ID).in("id", staffIds);
      const { data: dateRows } = await admin
        .from("staff_booking_dates").select("staff_id, date, available, start_time, end_time")
        .eq("clinic_id", DEFAULT_CLINIC_ID).in("staff_id", staffIds);
      for (const s of staffRows ?? []) {
        if (!(s as { schedule_based_booking?: boolean }).schedule_based_booking) continue;
        const weekdays = String((s as { booking_weekdays?: string }).booking_weekdays ?? "").split(",").map((x) => x.trim()).filter(Boolean).map(Number);
        const dates = (dateRows ?? []).filter((d: { staff_id: string }) => d.staff_id === (s as { id: string }).id)
          .map((d: { date: string; available: boolean; start_time?: string | null; end_time?: string | null }) => ({
            date: String(d.date).slice(0, 10), available: !!d.available,
            start: normalizeTimeHHMM(d.start_time), end: normalizeTimeHHMM(d.end_time),
          }));
        staffSched.set((s as { id: string }).id, {
          weekdays, dates,
          defaultStart: normalizeTimeHHMM((s as { booking_start_time?: string | null }).booking_start_time),
          defaultEnd: normalizeTimeHHMM((s as { booking_end_time?: string | null }).booking_end_time),
        });
      }
    }

    const result: CourseAvailability[] = [];
    for (const course of courses) {
      const dur = course.duration_minutes || slotMinutes;
      const steps = Math.max(1, Math.ceil(dur / slotMinutes));
      const sched = course.required_staff_id ? staffSched.get(course.required_staff_id) : undefined;
      let next: string | null = null;
      for (let i = 0; i <= 30 && !next; i++) {
        const d = new Date(today); d.setDate(d.getDate() + i);
        const key = ymd(d);
        if (holidaySet.has(key)) continue;
        if (sched && !isStaffAvailableOnYmd(key, sched)) continue;
        let slots = getTimeSlots(d, { slotMinutes, schedule });
        if (sched) slots = filterSlotsByStaffSchedule(slots, d, sched);
        if (slots.length === 0) continue;
        const booked = bookedByDate.get(key) ?? new Set<string>();
        for (let idx = 0; idx < slots.length; idx++) {
          if (isTimeSlotWithinTwoHours(d, slots[idx])) continue;
          let fits = true;
          for (let k = 0; k < steps; k++) {
            const sl = slots[idx + k];
            if (!sl || booked.has(sl)) { fits = false; break; }
          }
          if (fits) { next = key; break; }
        }
      }
      result.push({ courseId: course.id, nextDate: next });
    }
    return result;
  } catch (e) {
    console.error("[getCoursesAvailability] failed:", e);
    return [];
  }
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
