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

export type OverrideStatus = "pending" | "approved" | "rejected";

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
  status: OverrideStatus;
  created_by_email: string | null;
  created_at: string;
};

export type StaffOption = { id: string; name: string; display_color?: string | null };

export async function listActiveStaff(): Promise<{ success: boolean; staff?: StaffOption[]; error?: string }> {
  const auth = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { data, error } = await sb
    .from("reservation_staff")
    .select("id, name, display_color")
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
    .select("id, staff_id, date, start_time, end_time, kind, note, blocks_booking, status, created_by_email, created_at, reservation_staff(name)")
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
    status: (r.status as OverrideStatus) ?? "approved",
    created_by_email: r.created_by_email,
    created_at: r.created_at,
  }));

  return { success: true, rows };
}

// ─── スタッフ向け：自分の休み希望提出フロー ───────────────────────────
// staff role は staff-schedule タブにアクセス権がないので、専用 server action 経由。
// reservation_staff.email == auth.email で自分のスタッフ ID を解決する。

export type MyLeaveRequest = {
  id: string;
  date: string;
  status: OverrideStatus;
  note: string | null;
  created_at: string;
};

/**
 * ログインユーザーが自分の reservation_staff を解決して返す。
 * email が一致する staff レコードが無ければ null。
 */
async function resolveMyStaffId(): Promise<{ staffId: string | null; clinicId: string }> {
  const auth = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb || !auth.email) return { staffId: null, clinicId: auth.clinicId };

  const { data } = await sb
    .from("reservation_staff")
    .select("id")
    .eq("clinic_id", auth.clinicId)
    .eq("email", auth.email)
    .eq("is_active", true)
    .maybeSingle();

  return { staffId: data?.id ?? null, clinicId: auth.clinicId };
}

/**
 * 指定月の自分の休み希望一覧を取得。
 * monthStr: "YYYY-MM"（省略時は来月）
 */
export async function listMyLeaveRequests(
  monthStr?: string,
): Promise<{ success: boolean; rows?: MyLeaveRequest[]; staffId?: string | null; error?: string }> {
  const { staffId, clinicId } = await resolveMyStaffId();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };
  if (!staffId) return { success: true, rows: [], staffId: null };

  // 月範囲
  const now = new Date();
  const [y, m] = monthStr
    ? monthStr.split("-").map(n => parseInt(n, 10))
    : (() => {
        // 来月
        const nm = now.getMonth() + 1 === 12 ? 1 : now.getMonth() + 2;
        const nmY = now.getMonth() + 1 === 12 ? now.getFullYear() + 1 : now.getFullYear();
        return [nmY, nm];
      })();
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const monthEnd = new Date(y, m, 0).toISOString().split("T")[0];

  const { data, error } = await sb
    .from("staff_working_overrides")
    .select("id, date, status, note, created_at")
    .eq("clinic_id", clinicId)
    .eq("staff_id", staffId)
    .eq("kind", "leave")
    .gte("date", monthStart)
    .lte("date", monthEnd)
    .order("date", { ascending: true });

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    staffId,
    rows: (data ?? []).map((r: any) => ({
      id: r.id,
      date: r.date,
      status: (r.status as OverrideStatus) ?? "pending",
      note: r.note,
      created_at: r.created_at,
    })),
  };
}

/**
 * スタッフ自身が休み希望を提出（pending として登録）。
 * 既に同日に override があれば二重登録しない。
 */
export async function requestMyLeave(
  dateStr: string,
  note?: string,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const auth = await checkAdminAuth();
  const { staffId, clinicId } = await resolveMyStaffId();
  if (!staffId) {
    return { success: false, error: "スタッフ情報が見つかりません。管理者に reservation_staff.email の設定を依頼してください。" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { success: false, error: "日付の形式が不正です" };
  }
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  // 重複チェック（同日 leave）
  const { data: existing } = await sb
    .from("staff_working_overrides")
    .select("id, status")
    .eq("clinic_id", clinicId)
    .eq("staff_id", staffId)
    .eq("date", dateStr)
    .eq("kind", "leave")
    .maybeSingle();

  if (existing) {
    return { success: false, error: existing.status === "rejected" ? "この日は却下済みです。管理者にご相談ください" : "既に登録済みです" };
  }

  const { data, error } = await sb
    .from("staff_working_overrides")
    .insert({
      clinic_id: clinicId,
      staff_id: staffId,
      date: dateStr,
      start_time: null,
      end_time: null,
      kind: "leave" as OverrideKind,
      note: note?.trim() || null,
      blocks_booking: false, // pending 段階では予約をブロックしない
      status: "pending",
      created_by_email: auth.email ?? null,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/my-schedule");
  revalidatePath("/admin/settings/staff-schedule");
  return { success: true, id: data?.id };
}

/**
 * スタッフ自身が自分の休み希望（pending のみ）を取り消す。
 * approved 済みは取り消し不可（オーナーに依頼）。
 */
export async function cancelMyLeaveRequest(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const { staffId, clinicId } = await resolveMyStaffId();
  if (!staffId) return { success: false, error: "スタッフ情報が見つかりません" };
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { data: row } = await sb
    .from("staff_working_overrides")
    .select("id, status, staff_id")
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (!row) return { success: false, error: "対象が見つかりません" };
  if (row.staff_id !== staffId) return { success: false, error: "自分の希望のみ取消できます" };
  if (row.status !== "pending") {
    return { success: false, error: "承認済み/却下済みの希望は管理者にご相談ください" };
  }

  const { error } = await sb
    .from("staff_working_overrides")
    .delete()
    .eq("id", id)
    .eq("clinic_id", clinicId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/my-schedule");
  revalidatePath("/admin/settings/staff-schedule");
  return { success: true };
}

/**
 * オーナー/管理者：pending な休み希望を承認 → approved に変更し blocks_booking=true に。
 */
export async function approveLeaveRequest(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireRole(["owner"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { error } = await sb
    .from("staff_working_overrides")
    .update({ status: "approved", blocks_booking: true })
    .eq("id", id)
    .eq("clinic_id", auth.clinicId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/my-schedule");
  revalidatePath("/admin/settings/staff-schedule");
  return { success: true };
}

/**
 * オーナー/管理者：pending な休み希望を却下 → rejected。
 */
export async function rejectLeaveRequest(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireRole(["owner"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { error } = await sb
    .from("staff_working_overrides")
    .update({ status: "rejected", blocks_booking: false })
    .eq("id", id)
    .eq("clinic_id", auth.clinicId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/my-schedule");
  revalidatePath("/admin/settings/staff-schedule");
  return { success: true };
}

/**
 * オーナー画面用：clinic 内の pending な休み希望一覧を取得（承認待ち）
 */
export async function listPendingLeaveRequests(): Promise<{
  success: boolean;
  rows?: StaffOverrideRow[];
  error?: string;
}> {
  const auth = await requireRole(["owner"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { data, error } = await sb
    .from("staff_working_overrides")
    .select("id, staff_id, date, start_time, end_time, kind, note, blocks_booking, status, created_by_email, created_at, reservation_staff(name)")
    .eq("clinic_id", auth.clinicId)
    .eq("status", "pending")
    .eq("kind", "leave")
    .order("date", { ascending: true });

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
    status: (r.status as OverrideStatus) ?? "pending",
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
  const auth = await requireRole(["owner"]);
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
  const auth = await requireRole(["owner"]);
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

  const dayOfWeek = new Date(`${dateStr}T12:00:00+09:00`).getDay();

  const [{ data: staffData }, { data: overrideData }, { data: weeklyHoursData }] = await Promise.all([
    sb
      .from("reservation_staff")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("is_active", true)
      .eq("available_for_online_booking", true),
    sb
      .from("staff_working_overrides")
      .select("staff_id, start_time, end_time, kind")
      .eq("clinic_id", clinicId)
      .eq("date", dateStr)
      .eq("blocks_booking", true),
    // 週次デフォルトの休憩時間も取得（override がなければ週次 break を使う）
    sb
      .from("staff_working_hours")
      .select("staff_id, break_start, break_end")
      .eq("clinic_id", clinicId)
      .eq("day_of_week", dayOfWeek),
  ]);

  const activeStaffIds = new Set((staffData ?? []).map((s: any) => s.id));
  const totalStaff = activeStaffIds.size;
  if (totalStaff === 0) return [];

  // 週次休憩をマップ化（override break があれば上書き）
  const weeklyBreakMap = new Map<string, { start: string; end: string }>();
  for (const w of (weeklyHoursData ?? []) as any[]) {
    if (w.break_start && w.break_end) {
      weeklyBreakMap.set(w.staff_id, { start: w.break_start.slice(0, 5), end: w.break_end.slice(0, 5) });
    }
  }
  // override の break レコードで上書き
  for (const o of (overrideData ?? []) as any[]) {
    if (o.kind === "break" && o.start_time && o.end_time) {
      weeklyBreakMap.set(o.staff_id, { start: o.start_time.slice(0, 5), end: o.end_time.slice(0, 5) });
    }
  }

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
      if (o.kind === "break") continue; // break は下で処理
      if (!o.start_time || !o.end_time) { blockedStaff.add(o.staff_id); continue; }
      if (slot >= o.start_time.slice(0, 5) && slot < o.end_time.slice(0, 5)) blockedStaff.add(o.staff_id);
    }
    // 週次 or override の休憩時間チェック
    for (const [staffId, brk] of weeklyBreakMap.entries()) {
      if (!activeStaffIds.has(staffId)) continue;
      if (slot >= brk.start && slot < brk.end) blockedStaff.add(staffId);
    }
    if (blockedStaff.size >= totalStaff) blockedSlots.push(slot);
  }
  return blockedSlots;
}

// ─────────────────────────────────────────────────────────────────
// 基本勤務時間 (staff_working_hours) の CRUD
// ─────────────────────────────────────────────────────────────────

export type WorkingHourRow = {
  id: string;
  staff_id: string;
  staff_name: string | null;
  day_of_week: number;        // 0=日 〜 6=土
  start_time: string;          // "09:00"
  end_time: string;            // "18:00"
  break_start: string | null;
  break_end: string | null;
};

export async function listWorkingHours(): Promise<{ success: boolean; rows?: WorkingHourRow[]; error?: string }> {
  const auth = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { data, error } = await sb
    .from("staff_working_hours")
    .select("id, staff_id, day_of_week, start_time, end_time, break_start, break_end, reservation_staff(name)")
    .eq("clinic_id", auth.clinicId)
    .order("staff_id", { ascending: true })
    .order("day_of_week", { ascending: true });

  if (error) return { success: false, error: error.message };

  const rows: WorkingHourRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    staff_id: r.staff_id,
    staff_name: Array.isArray(r.reservation_staff) ? r.reservation_staff[0]?.name : r.reservation_staff?.name ?? null,
    day_of_week: r.day_of_week,
    start_time: r.start_time?.slice(0, 5) ?? "",      // TIME → "HH:MM"
    end_time: r.end_time?.slice(0, 5) ?? "",
    break_start: r.break_start ? r.break_start.slice(0, 5) : null,
    break_end: r.break_end ? r.break_end.slice(0, 5) : null,
  }));

  return { success: true, rows };
}

export type UpsertWorkingHourInput = {
  staff_id: string;
  day_of_week: number;        // 0-6
  start_time: string;          // "09:00"
  end_time: string;            // "18:00"
  break_start?: string | null;
  break_end?: string | null;
};

export async function upsertWorkingHours(
  input: UpsertWorkingHourInput
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireRole(["owner"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  if (input.day_of_week < 0 || input.day_of_week > 6) {
    return { success: false, error: "曜日は 0〜6 で指定してください" };
  }
  if (!/^\d{2}:\d{2}$/.test(input.start_time) || !/^\d{2}:\d{2}$/.test(input.end_time)) {
    return { success: false, error: "時刻は HH:MM 形式で" };
  }
  if (input.start_time >= input.end_time) {
    return { success: false, error: "終了時刻は開始時刻より後にしてください" };
  }
  if (input.break_start && input.break_end && input.break_start >= input.break_end) {
    return { success: false, error: "休憩終了は休憩開始より後に" };
  }

  // UNIQUE (staff_id, day_of_week) で UPSERT
  const { error } = await sb
    .from("staff_working_hours")
    .upsert(
      {
        clinic_id: auth.clinicId,
        staff_id: input.staff_id,
        day_of_week: input.day_of_week,
        start_time: input.start_time,
        end_time: input.end_time,
        break_start: input.break_start ?? null,
        break_end: input.break_end ?? null,
      },
      { onConflict: "staff_id,day_of_week" }
    );

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings/staff-schedule");
  return { success: true };
}

export async function deleteWorkingHour(
  staff_id: string,
  day_of_week: number
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireRole(["owner"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { error } = await sb
    .from("staff_working_hours")
    .delete()
    .eq("clinic_id", auth.clinicId)
    .eq("staff_id", staff_id)
    .eq("day_of_week", day_of_week);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings/staff-schedule");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────
// タスク管理 (staff_tasks) の CRUD
// ─────────────────────────────────────────────────────────────────

export type TaskStatus = "pending" | "done";
export type TaskPriority = "low" | "normal" | "high";

export type StaffTaskRow = {
  id: string;
  staff_id: string | null;
  staff_name: string | null;
  title: string;
  description: string | null;
  due_date: string | null;     // YYYY-MM-DD
  status: TaskStatus;
  priority: TaskPriority;
  created_by_email: string | null;
  created_at: string;
  completed_at: string | null;
};

export type ListTasksOptions = {
  status?: TaskStatus | "all";
  staff_id?: string | "me" | "all";
  due_before?: string;          // YYYY-MM-DD
};

export async function listTasks(
  opts: ListTasksOptions = {}
): Promise<{ success: boolean; rows?: StaffTaskRow[]; error?: string }> {
  const auth = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  let query = sb
    .from("staff_tasks")
    .select("id, staff_id, title, description, due_date, status, priority, created_by_email, created_at, completed_at, reservation_staff(name)")
    .eq("clinic_id", auth.clinicId);

  if (opts.status && opts.status !== "all") {
    query = query.eq("status", opts.status);
  }
  // staff_id="me" は auth.email → reservation_staff.email マッピングで解決（email カラムある前提）
  if (opts.staff_id === "me") {
    const { data: meRow } = await sb
      .from("reservation_staff")
      .select("id")
      .eq("clinic_id", auth.clinicId)
      .eq("email", auth.email ?? "")
      .maybeSingle();
    if (meRow?.id) {
      query = query.eq("staff_id", meRow.id);
    } else {
      // 自分が reservation_staff にいないなら、未割当 (staff_id IS NULL) のみ
      query = query.is("staff_id", null);
    }
  } else if (opts.staff_id && opts.staff_id !== "all") {
    query = query.eq("staff_id", opts.staff_id);
  }
  if (opts.due_before) {
    query = query.lte("due_date", opts.due_before);
  }

  // 並び: 期限昇順 (NULLS LAST) → 優先度 → 作成日昇順
  const { data, error } = await query
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) return { success: false, error: error.message };

  const rows: StaffTaskRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    staff_id: r.staff_id,
    staff_name: Array.isArray(r.reservation_staff) ? r.reservation_staff[0]?.name : r.reservation_staff?.name ?? null,
    title: r.title,
    description: r.description,
    due_date: r.due_date,
    status: r.status,
    priority: r.priority,
    created_by_email: r.created_by_email,
    created_at: r.created_at,
    completed_at: r.completed_at,
  }));

  return { success: true, rows };
}

export type CreateTaskInput = {
  staff_id: string | null;      // null = 未割当
  title: string;
  description?: string | null;
  due_date?: string | null;     // YYYY-MM-DD
  priority?: TaskPriority;
};

export async function createTask(
  input: CreateTaskInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const auth = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const title = input.title?.trim();
  if (!title) return { success: false, error: "タイトルを入力してください" };
  if (title.length > 200) return { success: false, error: "タイトルは 200 文字以内で" };
  if (input.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.due_date)) {
    return { success: false, error: "期限は YYYY-MM-DD 形式で" };
  }

  const { data, error } = await sb
    .from("staff_tasks")
    .insert({
      clinic_id: auth.clinicId,
      staff_id: input.staff_id,
      title,
      description: input.description?.trim() || null,
      due_date: input.due_date || null,
      priority: input.priority ?? "normal",
      created_by_email: auth.email ?? null,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings/staff-schedule");
  revalidatePath("/admin/dashboard");
  return { success: true, id: data?.id };
}

export type UpdateTaskPatch = Partial<{
  staff_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: TaskPriority;
}>;

export async function updateTask(
  id: string,
  patch: UpdateTaskPatch
): Promise<{ success: boolean; error?: string }> {
  const auth = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  // staff role は自分のタスクのみ編集可（reservation_staff.email == auth.email）
  if (auth.role === "staff") {
    const { data: meRow } = await sb
      .from("reservation_staff")
      .select("id")
      .eq("clinic_id", auth.clinicId)
      .eq("email", auth.email ?? "")
      .maybeSingle();
    const { data: target } = await sb
      .from("staff_tasks")
      .select("staff_id")
      .eq("id", id)
      .eq("clinic_id", auth.clinicId)
      .maybeSingle();
    const isMyTask = meRow?.id && target?.staff_id === meRow.id;
    const isUnassigned = target?.staff_id === null;
    if (!isMyTask && !isUnassigned) {
      return { success: false, error: "他のスタッフのタスクは編集できません" };
    }
  }

  if (patch.title !== undefined) {
    const t = patch.title?.trim();
    if (!t) return { success: false, error: "タイトルが空です" };
    if (t.length > 200) return { success: false, error: "タイトルは 200 文字以内で" };
  }
  if (patch.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(patch.due_date)) {
    return { success: false, error: "期限は YYYY-MM-DD 形式で" };
  }

  const updateData: Record<string, unknown> = {};
  if (patch.staff_id !== undefined) updateData.staff_id = patch.staff_id;
  if (patch.title !== undefined) updateData.title = patch.title.trim();
  if (patch.description !== undefined) updateData.description = patch.description?.trim() || null;
  if (patch.due_date !== undefined) updateData.due_date = patch.due_date || null;
  if (patch.priority !== undefined) updateData.priority = patch.priority;

  const { error } = await sb
    .from("staff_tasks")
    .update(updateData)
    .eq("id", id)
    .eq("clinic_id", auth.clinicId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings/staff-schedule");
  return { success: true };
}

export async function completeTask(id: string): Promise<{ success: boolean; error?: string }> {
  const auth = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { error } = await sb
    .from("staff_tasks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("clinic_id", auth.clinicId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings/staff-schedule");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function reopenTask(id: string): Promise<{ success: boolean; error?: string }> {
  const auth = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { error } = await sb
    .from("staff_tasks")
    .update({ status: "pending", completed_at: null })
    .eq("id", id)
    .eq("clinic_id", auth.clinicId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings/staff-schedule");
  return { success: true };
}

export async function deleteTask(id: string): Promise<{ success: boolean; error?: string }> {
  const auth = await requireRole(["owner"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { error } = await sb
    .from("staff_tasks")
    .delete()
    .eq("id", id)
    .eq("clinic_id", auth.clinicId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings/staff-schedule");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────
// 集計: スタッフ別タスク負荷（OwnerSecretaryWidget / AI 秘書用）
// ─────────────────────────────────────────────────────────────────

export type TaskLoadSummary = {
  staff_id: string | null;
  staff_name: string;
  pending: number;
  overdue: number;
  highPriority: number;
};

export async function getTaskLoadByStaff(): Promise<{ success: boolean; rows?: TaskLoadSummary[]; error?: string }> {
  const auth = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  // 全タスク取得 → JS 側で集計（行数は院あたり数百以内の想定で十分軽い）
  const todayStr = new Date().toISOString().slice(0, 10);
  const [tasksRes, staffRes] = await Promise.all([
    sb
      .from("staff_tasks")
      .select("staff_id, status, priority, due_date")
      .eq("clinic_id", auth.clinicId)
      .eq("status", "pending"),
    sb
      .from("reservation_staff")
      .select("id, name")
      .eq("clinic_id", auth.clinicId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  if (tasksRes.error) return { success: false, error: tasksRes.error.message };
  if (staffRes.error) return { success: false, error: staffRes.error.message };

  const staffList = (staffRes.data ?? []) as { id: string; name: string }[];
  const summaryMap = new Map<string | null, TaskLoadSummary>();

  // 全 active スタッフを 0 件で初期化（タスクなしスタッフも表示するため）
  for (const s of staffList) {
    summaryMap.set(s.id, { staff_id: s.id, staff_name: s.name, pending: 0, overdue: 0, highPriority: 0 });
  }
  // 未割当の枠
  summaryMap.set(null, { staff_id: null, staff_name: "(未割当)", pending: 0, overdue: 0, highPriority: 0 });

  for (const t of (tasksRes.data ?? []) as any[]) {
    const key = t.staff_id ?? null;
    const cur = summaryMap.get(key) ?? {
      staff_id: key,
      staff_name: key === null ? "(未割当)" : "(削除されたスタッフ)",
      pending: 0,
      overdue: 0,
      highPriority: 0,
    };
    cur.pending++;
    if (t.due_date && t.due_date < todayStr) cur.overdue++;
    if (t.priority === "high") cur.highPriority++;
    summaryMap.set(key, cur);
  }

  // 並び: pending 件数 降順、未割当は最後
  const rows = [...summaryMap.values()]
    .filter((r) => r.staff_id !== null || r.pending > 0)  // 未割当は 0 件なら隠す
    .sort((a, b) => {
      if (a.staff_id === null) return 1;
      if (b.staff_id === null) return -1;
      return b.pending - a.pending;
    });

  return { success: true, rows };
}

// ─────────────────────────────────────────────────────────────────
// タイムテーブル用：特定日のスタッフ勤務状況を一括取得
// ─────────────────────────────────────────────────────────────────

export type StaffDaySchedule = {
  staffId: string;
  staffName: string;
  role: string | null;
  displayColor: string | null;
  showInTimeline: boolean;
  startTime: string | null;   // "HH:MM"
  endTime: string | null;     // "HH:MM"
  breakStart: string | null;  // "HH:MM" 休憩開始
  breakEnd: string | null;    // "HH:MM" 休憩終了
  source: "override" | "weekly" | "none";
  isOff: boolean;
};

export async function getStaffSchedulesForDate(
  dateStr: string,
): Promise<{ success: boolean; schedules?: StaffDaySchedule[]; error?: string }> {
  const auth = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  // 全スタッフを取得（show_in_timeline は reservation_staff の列）
  const { data: staffData, error: staffError } = await sb
    .from("reservation_staff")
    .select("id, name, role, display_color, show_in_timeline")
    .eq("clinic_id", auth.clinicId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (staffError) return { success: false, error: staffError.message };

  const staffList = (staffData ?? []) as {
    id: string;
    name: string;
    role: string | null;
    display_color: string | null;
    show_in_timeline: boolean | null;
  }[];

  // その日の override を一括取得
  const { data: overrideData } = await sb
    .from("staff_working_overrides")
    .select("staff_id, start_time, end_time, kind")
    .eq("clinic_id", auth.clinicId)
    .eq("date", dateStr);

  const overrideMap = new Map<string, { start_time: string | null; end_time: string | null; kind: string }>();
  for (const o of (overrideData ?? []) as any[]) {
    overrideMap.set(o.staff_id, { start_time: o.start_time, end_time: o.end_time, kind: o.kind });
  }

  // 曜日: 0=日、6=土
  const dayOfWeek = new Date(dateStr).getDay();

  // その曜日の週次勤務時間を一括取得（休憩時間も含む）
  const { data: weeklyData } = await sb
    .from("staff_working_hours")
    .select("staff_id, start_time, end_time, break_start, break_end")
    .eq("clinic_id", auth.clinicId)
    .eq("day_of_week", dayOfWeek);

  const weeklyMap = new Map<string, { start_time: string; end_time: string; break_start: string | null; break_end: string | null }>();
  for (const w of (weeklyData ?? []) as any[]) {
    weeklyMap.set(w.staff_id, { start_time: w.start_time, end_time: w.end_time, break_start: w.break_start ?? null, break_end: w.break_end ?? null });
  }

  // 休憩オーバーライド（kind="break"）を別途取得
  const breakOverrideMap = new Map<string, { start_time: string; end_time: string }>();
  for (const o of (overrideData ?? []) as any[]) {
    if (o.kind === "break" && o.start_time && o.end_time) {
      breakOverrideMap.set(o.staff_id, { start_time: o.start_time, end_time: o.end_time });
    }
  }

  const schedules: StaffDaySchedule[] = staffList.map((s) => {
    // 休憩: breakOverride > weeklyDefault
    const breakOverride = breakOverrideMap.get(s.id);
    const weeklyBreak = weeklyMap.get(s.id);
    const breakStart = breakOverride
      ? breakOverride.start_time.slice(0, 5)
      : (weeklyBreak?.break_start ? weeklyBreak.break_start.slice(0, 5) : null);
    const breakEnd = breakOverride
      ? breakOverride.end_time.slice(0, 5)
      : (weeklyBreak?.break_end ? weeklyBreak.break_end.slice(0, 5) : null);

    const override = overrideMap.get(s.id);
    if (override && override.kind !== "break") {
      const isOff = override.kind === "off" || override.kind === "leave";
      return {
        staffId: s.id,
        staffName: s.name,
        role: s.role,
        displayColor: s.display_color,
        showInTimeline: s.show_in_timeline !== false,
        startTime: isOff ? null : (override.start_time ? override.start_time.slice(0, 5) : null),
        endTime: isOff ? null : (override.end_time ? override.end_time.slice(0, 5) : null),
        breakStart,
        breakEnd,
        source: "override",
        isOff,
      };
    }
    const weekly = weeklyMap.get(s.id);
    if (weekly) {
      return {
        staffId: s.id,
        staffName: s.name,
        role: s.role,
        displayColor: s.display_color,
        showInTimeline: s.show_in_timeline !== false,
        startTime: weekly.start_time.slice(0, 5),
        endTime: weekly.end_time.slice(0, 5),
        breakStart,
        breakEnd,
        source: "weekly",
        isOff: false,
      };
    }
    return {
      staffId: s.id,
      staffName: s.name,
      role: s.role,
      displayColor: s.display_color,
      showInTimeline: s.show_in_timeline !== false,
      startTime: null,
      endTime: null,
      breakStart,
      breakEnd,
      source: "none",
      isOff: false,
    };
  });

  return { success: true, schedules };
}

export async function upsertStaffScheduleForDate(
  staffId: string,
  dateStr: string,
  startTime: string | null,
  endTime: string | null,
  isOff: boolean,
  breakStart?: string | null,
  breakEnd?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireRole(["owner"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const kind = isOff ? "off" : "work";
  const start = isOff ? null : startTime;
  const end = isOff ? null : endTime;

  // 1) 勤務時間オーバーライド（kind=work/off）をupsert
  const { data: existing } = await sb
    .from("staff_working_overrides")
    .select("id")
    .eq("clinic_id", auth.clinicId)
    .eq("staff_id", staffId)
    .eq("date", dateStr)
    .neq("kind", "break")
    .maybeSingle();

  if (existing?.id) {
    const { error } = await sb
      .from("staff_working_overrides")
      .update({ kind, start_time: start, end_time: end, blocks_booking: isOff, status: "approved", created_by_email: auth.email ?? null })
      .eq("id", existing.id)
      .eq("clinic_id", auth.clinicId);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await sb
      .from("staff_working_overrides")
      .insert({ clinic_id: auth.clinicId, staff_id: staffId, date: dateStr, kind, start_time: start, end_time: end, blocks_booking: isOff, status: "approved", created_by_email: auth.email ?? null, note: null });
    if (error) return { success: false, error: error.message };
  }

  // 2) 休憩時間オーバーライド（kind=break, blocks_booking=true）をupsert/delete
  const { data: existingBreak } = await sb
    .from("staff_working_overrides")
    .select("id")
    .eq("clinic_id", auth.clinicId)
    .eq("staff_id", staffId)
    .eq("date", dateStr)
    .eq("kind", "break")
    .maybeSingle();

  if (breakStart && breakEnd && breakStart < breakEnd) {
    // 休憩あり → upsert
    if (existingBreak?.id) {
      await sb.from("staff_working_overrides")
        .update({ start_time: breakStart, end_time: breakEnd, blocks_booking: true, status: "approved", created_by_email: auth.email ?? null })
        .eq("id", existingBreak.id).eq("clinic_id", auth.clinicId);
    } else {
      await sb.from("staff_working_overrides")
        .insert({ clinic_id: auth.clinicId, staff_id: staffId, date: dateStr, kind: "break", start_time: breakStart, end_time: breakEnd, blocks_booking: true, status: "approved", created_by_email: auth.email ?? null, note: null });
    }
  } else if (existingBreak?.id) {
    // 休憩クリア → 既存削除
    await sb.from("staff_working_overrides").delete().eq("id", existingBreak.id).eq("clinic_id", auth.clinicId);
  }

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/settings/staff-schedule");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────
// CSV インポート（Phase 4 で UI 実装。Phase 1 では server action 本体のみ）
// ─────────────────────────────────────────────────────────────────

export type CsvImportResult = {
  inserted: number;
  updated: number;
  skipped: number;
  errors: { row: number; reason: string }[];
};

// 軽量 CSV パーサ: BOM/CRLF/ダブルクオートに対応
function parseCsv(text: string): string[][] {
  const cleaned = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let i = 0, cur = "", row: string[] = [], inQuote = false;
  while (i < cleaned.length) {
    const ch = cleaned[i];
    if (inQuote) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') { cur += '"'; i += 2; continue; }
        inQuote = false; i++; continue;
      }
      cur += ch; i++; continue;
    }
    if (ch === '"') { inQuote = true; i++; continue; }
    if (ch === ",") { row.push(cur); cur = ""; i++; continue; }
    if (ch === "\n") { row.push(cur); rows.push(row); cur = ""; row = []; i++; continue; }
    cur += ch; i++;
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  // 末尾の完全空行を捨てる
  return rows.filter((r) => r.length > 1 || (r[0] && r[0].trim().length > 0));
}

export async function importWorkingHoursFromCsv(
  csvText: string
): Promise<{ success: boolean; result?: CsvImportResult; error?: string }> {
  const auth = await requireRole(["owner"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const rows = parseCsv(csvText);
  if (rows.length === 0) return { success: false, error: "CSV が空です" };

  // ヘッダ検証
  const expectedHeader = ["staff_name", "day_of_week", "start_time", "end_time", "break_start", "break_end"];
  const header = rows[0].map((c) => c.trim());
  for (let i = 0; i < expectedHeader.length; i++) {
    if (header[i] !== expectedHeader[i]) {
      return { success: false, error: `ヘッダ不一致: 列 ${i + 1} は ${expectedHeader[i]} のはずが ${header[i]}` };
    }
  }

  // スタッフ名 → id マップ
  const { data: staffData } = await sb
    .from("reservation_staff")
    .select("id, name")
    .eq("clinic_id", auth.clinicId)
    .eq("is_active", true);
  const nameToId = new Map<string, string>();
  for (const s of (staffData ?? []) as { id: string; name: string }[]) {
    nameToId.set(s.name.trim(), s.id);
  }

  const result: CsvImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const [staffName, dayStr, startTime, endTime, breakStart, breakEnd] = cells.map((c) => c?.trim() ?? "");

    if (!staffName) { result.errors.push({ row: r + 1, reason: "staff_name が空" }); result.skipped++; continue; }
    const staffId = nameToId.get(staffName);
    if (!staffId) { result.errors.push({ row: r + 1, reason: `staff_name "${staffName}" が見つかりません` }); result.skipped++; continue; }

    const day = Number(dayStr);
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      result.errors.push({ row: r + 1, reason: `day_of_week は 0-6 (got "${dayStr}")` });
      result.skipped++; continue;
    }

    const timeRe = /^\d{1,2}:\d{2}$/;
    if (!timeRe.test(startTime) || !timeRe.test(endTime)) {
      result.errors.push({ row: r + 1, reason: "時刻形式が不正 (HH:MM)" });
      result.skipped++; continue;
    }
    const normalize = (t: string) => t.split(":").map((p) => p.padStart(2, "0")).join(":");
    const st = normalize(startTime);
    const et = normalize(endTime);
    if (st >= et) {
      result.errors.push({ row: r + 1, reason: "end_time は start_time より後" });
      result.skipped++; continue;
    }
    const bs = breakStart && timeRe.test(breakStart) ? normalize(breakStart) : null;
    const be = breakEnd && timeRe.test(breakEnd) ? normalize(breakEnd) : null;

    const { error: upsertError } = await sb
      .from("staff_working_hours")
      .upsert(
        {
          clinic_id: auth.clinicId,
          staff_id: staffId,
          day_of_week: day,
          start_time: st,
          end_time: et,
          break_start: bs,
          break_end: be,
        },
        { onConflict: "staff_id,day_of_week" }
      );

    if (upsertError) {
      result.errors.push({ row: r + 1, reason: upsertError.message });
      result.skipped++;
    } else {
      // upsert は新規/更新の区別が取れない → 新規として計上
      result.inserted++;
    }
  }

  revalidatePath("/admin/settings/staff-schedule");
  return { success: true, result };
}

export async function importTasksFromCsv(
  csvText: string
): Promise<{ success: boolean; result?: CsvImportResult; error?: string }> {
  const auth = await requireRole(["owner"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const rows = parseCsv(csvText);
  if (rows.length === 0) return { success: false, error: "CSV が空です" };

  const expectedHeader = ["staff_name", "title", "due_date", "priority", "description"];
  const header = rows[0].map((c) => c.trim());
  for (let i = 0; i < expectedHeader.length; i++) {
    if (header[i] !== expectedHeader[i]) {
      return { success: false, error: `ヘッダ不一致: 列 ${i + 1} は ${expectedHeader[i]} のはずが ${header[i]}` };
    }
  }

  const { data: staffData } = await sb
    .from("reservation_staff")
    .select("id, name")
    .eq("clinic_id", auth.clinicId)
    .eq("is_active", true);
  const nameToId = new Map<string, string>();
  for (const s of (staffData ?? []) as { id: string; name: string }[]) {
    nameToId.set(s.name.trim(), s.id);
  }

  const result: CsvImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const [staffName, title, dueDate, priorityStr, description] = cells.map((c) => c?.trim() ?? "");

    if (!title) { result.errors.push({ row: r + 1, reason: "title が空" }); result.skipped++; continue; }
    if (title.length > 200) { result.errors.push({ row: r + 1, reason: "title が 200 文字超過" }); result.skipped++; continue; }

    const staffId = staffName ? nameToId.get(staffName) : null;
    if (staffName && !staffId) {
      result.errors.push({ row: r + 1, reason: `staff_name "${staffName}" が見つかりません` });
      result.skipped++; continue;
    }

    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      result.errors.push({ row: r + 1, reason: "due_date は YYYY-MM-DD" });
      result.skipped++; continue;
    }

    const priority: TaskPriority =
      priorityStr === "low" || priorityStr === "high" || priorityStr === "normal"
        ? (priorityStr as TaskPriority)
        : "normal";

    // 重複チェック: 同一 (clinic_id, staff_id, title, due_date) の pending があれば skip
    const { data: dup } = await sb
      .from("staff_tasks")
      .select("id")
      .eq("clinic_id", auth.clinicId)
      .eq("title", title)
      .eq("status", "pending")
      .is("staff_id", staffId ?? null)
      .limit(1);

    if (dup && dup.length > 0) {
      result.skipped++;
      continue;
    }

    const { error: insertError } = await sb.from("staff_tasks").insert({
      clinic_id: auth.clinicId,
      staff_id: staffId ?? null,
      title,
      description: description || null,
      due_date: dueDate || null,
      priority,
      created_by_email: auth.email ?? null,
    });

    if (insertError) {
      result.errors.push({ row: r + 1, reason: insertError.message });
      result.skipped++;
    } else {
      result.inserted++;
    }
  }

  revalidatePath("/admin/settings/staff-schedule");
  return { success: true, result };
}


// ──────────────────────────────────────────────────────────────────────
// 出勤調整用：特定日のスタッフ別サマリー（勤務時間＋予約件数）を返す
// ──────────────────────────────────────────────────────────────────────

export type DayStaffSummary = StaffDaySchedule & {
  appointmentCount: number;
};

export async function getDayStaffSummary(
  dateStr: string,
): Promise<{ success: boolean; summaries?: DayStaffSummary[]; error?: string }> {
  try {
    const schedResult = await getStaffSchedulesForDate(dateStr);
    if (!schedResult.success || !schedResult.schedules) {
      return { success: false, error: schedResult.error };
    }

    const auth = await checkAdminAuth();
    const supabase = getServiceClient();
    if (!supabase) return { success: false, error: "サーバー設定エラー" };

    const dayStart = `${dateStr}T00:00:00+09:00`;
    const dayEnd   = `${dateStr}T23:59:59+09:00`;
    const { data: apts } = await supabase
      .from("appointments")
      .select("staff_id")
      .eq("clinic_id", auth.clinicId)
      .neq("status", "cancelled")
      .gte("start_time", dayStart)
      .lte("start_time", dayEnd);

    const countMap = new Map<string, number>();
    for (const a of (apts ?? []) as { staff_id: string | null }[]) {
      if (!a.staff_id) continue;
      countMap.set(a.staff_id, (countMap.get(a.staff_id) ?? 0) + 1);
    }

    const summaries: DayStaffSummary[] = schedResult.schedules.map((s) => ({
      ...s,
      appointmentCount: countMap.get(s.staffId) ?? 0,
    }));

    return { success: true, summaries };
  } catch (e) {
    console.error("getDayStaffSummary error", e);
    return { success: false, error: "取得に失敗しました" };
  }
}
