"use server";

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";
import { CLINIC_CONFIG } from "@/lib/clinic-config";
import { pushLineToOwners } from "@/lib/admin-notify";
import { requireRole } from "@/app/actions/auth";

/**
 * 勤怠（出退勤の打刻）＋残業の見える化 [Phase 1]
 * - 打刻ページはログイン不要（受付PC / 各自スマホ・名前選択）→ service role で
 *   PUBLIC_CLINIC_ID に限定。
 * - オーナー用（設定・一覧・時給）は requireRole(['owner'])（自院のみ）。
 * - 時給・コストは owner 専用。打刻側では一切返さない。
 */

// ── 共通 ───────────────────────────────────────────────

export type OvertimeReasonType = "requested" | "closing" | "valid" | "other";

export const OVERTIME_REASONS: { value: OvertimeReasonType; label: string }[] = [
  { value: "requested", label: "院長の依頼" },
  { value: "closing", label: "締め作業（1人で締め）" },
  { value: "valid", label: "正当な理由" },
  { value: "other", label: "その他" },
];

export const OVERTIME_REASON_LABEL: Record<OvertimeReasonType, string> = {
  requested: "院長の依頼",
  closing: "締め作業（1人で締め）",
  valid: "正当な理由",
  other: "その他",
};

export type AttendanceStaff = { id: string; name: string; display_color: string | null };

export type AttendanceConfig = {
  enabled: boolean;
  workEndTarget: string;        // "HH:mm"（原則退社の目標）
  overtimeReasonAfter: string;  // "HH:mm"（これ以降の退社は理由必須）
  closingAllowanceUntil: string;
  closingStaffId: string | null;
};

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** 現在時刻を JST で {勤務日, 0時からの分数} に。env のタイムゾーンに依存しない。 */
function jstNow(): { iso: string; date: string; minutes: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0; // 一部環境で 24:00 表記になる対策
  const minute = parseInt(get("minute"), 10);
  return { iso: now.toISOString(), date: `${get("year")}-${get("month")}-${get("day")}`, minutes: hour * 60 + minute };
}

function hhmm(t: string | null | undefined, fallback: string): string {
  if (!t) return fallback;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : fallback;
}
function toMinutes(hhmmStr: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmmStr);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
}

// ── 打刻ページ（ログイン不要） ─────────────────────────

/** クリニック名（打刻画面の見出し用・ビルド時固定） */
export async function getAttendanceClinicName(): Promise<string> {
  return CLINIC_CONFIG.name;
}

/** 名前選択用：自院のアクティブスタッフ（ログイン不要・時給は返さない） */
export async function listAttendanceStaff(): Promise<AttendanceStaff[]> {
  const { data } = await admin()
    .from("reservation_staff")
    .select("id, name, display_color")
    .eq("clinic_id", PUBLIC_CLINIC_ID)
    .eq("is_active", true)
    .order("sort_order")
    .order("created_at");
  return (data ?? []) as AttendanceStaff[];
}

/** 打刻画面が使う運用設定（ログイン不要・しきい値のみ） */
export async function getAttendanceConfig(): Promise<AttendanceConfig> {
  const { data } = await admin()
    .from("clinic_settings")
    .select("attendance_enabled, work_end_target, overtime_reason_after, closing_allowance_until, closing_staff_id")
    .eq("id", PUBLIC_CLINIC_ID)
    .maybeSingle();
  return {
    enabled: !!data?.attendance_enabled,
    workEndTarget: hhmm(data?.work_end_target as string | null, "20:00"),
    overtimeReasonAfter: hhmm(data?.overtime_reason_after as string | null, "20:15"),
    closingAllowanceUntil: hhmm(data?.closing_allowance_until as string | null, "20:30"),
    closingStaffId: (data?.closing_staff_id as string | null) ?? null,
  };
}

export type TodayAttendance = {
  clockInAt: string | null;
  clockOutAt: string | null;
  isOvertime: boolean;
  reasonType: OvertimeReasonType | null;
  reasonNote: string | null;
};

/** 指定スタッフの本日の打刻状態（ログイン不要） */
export async function getTodayAttendance(staffId: string): Promise<TodayAttendance | null> {
  if (!staffId) return null;
  const { date } = jstNow();
  const { data } = await admin()
    .from("staff_attendance")
    .select("clock_in_at, clock_out_at, is_overtime, overtime_reason_type, overtime_reason_note")
    .eq("clinic_id", PUBLIC_CLINIC_ID)
    .eq("staff_id", staffId)
    .eq("work_date", date)
    .maybeSingle();
  if (!data) return null;
  return {
    clockInAt: (data.clock_in_at as string | null) ?? null,
    clockOutAt: (data.clock_out_at as string | null) ?? null,
    isOvertime: !!data.is_overtime,
    reasonType: (data.overtime_reason_type as OvertimeReasonType | null) ?? null,
    reasonNote: (data.overtime_reason_note as string | null) ?? null,
  };
}

/** 自院の実在アクティブスタッフか検証（共通リンクの最低限の防御）。staff_name を返す。 */
async function verifyStaff(db: ReturnType<typeof admin>, staffId: string): Promise<string | null> {
  const { data } = await db
    .from("reservation_staff")
    .select("name")
    .eq("clinic_id", PUBLIC_CLINIC_ID)
    .eq("id", staffId)
    .eq("is_active", true)
    .maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

/** 出勤打刻（ログイン不要） */
export async function clockIn(staffId: string): Promise<{ success: boolean; error?: string }> {
  if (!staffId) return { success: false, error: "お名前を選んでください" };
  const db = admin();
  const name = await verifyStaff(db, staffId);
  if (!name) return { success: false, error: "スタッフが見つかりません。お名前を選び直してください。" };

  const { iso, date } = jstNow();
  const { error } = await db.from("staff_attendance").upsert(
    { clinic_id: PUBLIC_CLINIC_ID, staff_id: staffId, staff_name: name, work_date: date, clock_in_at: iso, updated_at: iso },
    { onConflict: "clinic_id, staff_id, work_date" },
  );
  return error ? { success: false, error: error.message } : { success: true };
}

/**
 * 退勤打刻（ログイン不要）。
 * しきい値(既定20:15)以降の退社は残業扱い→理由が無ければ requireReason を返す。
 */
export async function clockOut(
  staffId: string,
  reason?: { type?: OvertimeReasonType; note?: string },
): Promise<{ success: boolean; requireReason?: boolean; isOvertime?: boolean; error?: string }> {
  if (!staffId) return { success: false, error: "お名前を選んでください" };
  const db = admin();
  const name = await verifyStaff(db, staffId);
  if (!name) return { success: false, error: "スタッフが見つかりません。お名前を選び直してください。" };

  const cfg = await getAttendanceConfig();
  const { iso, date, minutes } = jstNow();
  const isOvertime = minutes >= toMinutes(cfg.overtimeReasonAfter);

  if (isOvertime) {
    if (!reason?.type) return { success: false, requireReason: true, isOvertime: true };
    if (reason.type === "valid" && !reason.note?.trim()) {
      return { success: false, requireReason: true, isOvertime: true, error: "「正当な理由」を選んだ場合は内容を入力してください。" };
    }
  }

  const { error } = await db.from("staff_attendance").upsert(
    {
      clinic_id: PUBLIC_CLINIC_ID,
      staff_id: staffId,
      staff_name: name,
      work_date: date,
      clock_out_at: iso,
      is_overtime: isOvertime,
      overtime_reason_type: isOvertime ? (reason?.type ?? null) : null,
      overtime_reason_note: isOvertime ? (reason?.note?.trim() || null) : null,
      updated_at: iso,
    },
    { onConflict: "clinic_id, staff_id, work_date" },
  );
  if (error) return { success: false, error: error.message };

  // 残業退社はオーナーへLINEで知らせる（依頼/締め以外は特に把握したい）
  if (isOvertime) {
    const label = reason?.type ? OVERTIME_REASON_LABEL[reason.type] : "理由なし";
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    try {
      await pushLineToOwners(
        PUBLIC_CLINIC_ID,
        `🕘 残業退社の記録\n${name}さん（${hh}:${mm} 退社）\n理由：${label}${reason?.note ? `（${reason.note}）` : ""}\n管理画面の「勤怠」でご確認いただけます。`,
      );
    } catch (e) {
      console.error("[attendance] owner LINE notify failed:", e);
    }
  }
  return { success: true, isOvertime };
}

// ── オーナー用（管理画面・自院のみ・owner専用） ───────────

export type OwnerStaffWage = { id: string; name: string; display_color: string | null; hourlyWage: number | null };

/** オーナー設定の取得（しきい値＋締め担当） */
export async function getAttendanceSettings(): Promise<AttendanceConfig> {
  await requireRole(["owner"]);
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data } = await supabase
    .from("clinic_settings")
    .select("attendance_enabled, work_end_target, overtime_reason_after, closing_allowance_until, closing_staff_id")
    .eq("id", process.env.NEXT_PUBLIC_CLINIC_ID!)
    .maybeSingle();
  return {
    enabled: !!data?.attendance_enabled,
    workEndTarget: hhmm(data?.work_end_target as string | null, "20:00"),
    overtimeReasonAfter: hhmm(data?.overtime_reason_after as string | null, "20:15"),
    closingAllowanceUntil: hhmm(data?.closing_allowance_until as string | null, "20:30"),
    closingStaffId: (data?.closing_staff_id as string | null) ?? null,
  };
}

/** オーナー設定の保存 */
export async function setAttendanceSettings(input: AttendanceConfig): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await requireRole(["owner"]);
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { error } = await supabase
    .from("clinic_settings")
    .update({
      attendance_enabled: input.enabled,
      work_end_target: input.workEndTarget,
      overtime_reason_after: input.overtimeReasonAfter,
      closing_allowance_until: input.closingAllowanceUntil,
      closing_staff_id: input.closingStaffId,
    })
    .eq("id", clinicId);
  return error ? { success: false, error: error.message } : { success: true };
}

/** オーナー：自院スタッフ＋時給（owner専用） */
export async function listStaffWages(): Promise<OwnerStaffWage[]> {
  const { clinicId } = await requireRole(["owner"]);
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data } = await supabase
    .from("reservation_staff")
    .select("id, name, display_color, hourly_wage")
    .eq("clinic_id", clinicId)
    .eq("is_active", true)
    .order("sort_order")
    .order("created_at");
  return (data ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    display_color: (s.display_color as string | null) ?? null,
    hourlyWage: (s.hourly_wage as number | null) ?? null,
  }));
}

/** オーナー：時給の保存（owner専用） */
export async function setStaffWage(staffId: string, wage: number | null): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await requireRole(["owner"]);
  if (wage != null && (!Number.isFinite(wage) || wage < 0 || wage > 100000)) {
    return { success: false, error: "時給の値が正しくありません" };
  }
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { error } = await supabase
    .from("reservation_staff")
    .update({ hourly_wage: wage })
    .eq("clinic_id", clinicId)
    .eq("id", staffId);
  return error ? { success: false, error: error.message } : { success: true };
}

export type AttendanceRecord = {
  id: string;
  staffId: string;
  staffName: string;
  displayColor: string | null;
  workDate: string;        // "YYYY-MM-DD"
  clockInAt: string | null;
  clockOutAt: string | null;
  isOvertime: boolean;
  reasonType: OvertimeReasonType | null;
  reasonNote: string | null;
};

/** オーナー：指定月の勤怠一覧（owner専用） */
export async function listAttendance(month: string): Promise<{ success: boolean; records?: AttendanceRecord[]; error?: string }> {
  const { clinicId } = await requireRole(["owner"]);
  if (!/^\d{4}-\d{2}$/.test(month)) return { success: false, error: "月の指定が不正です" };
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const [yy, mm] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(new Date(yy, mm, 0).getDate()).padStart(2, "0")}`;

  // 表示色のため staff の色を引く
  const { data: staffRows } = await supabase
    .from("reservation_staff").select("id, display_color").eq("clinic_id", clinicId);
  const colorOf = new Map<string, string | null>((staffRows ?? []).map((s) => [s.id as string, (s.display_color as string | null) ?? null]));

  const { data, error } = await supabase
    .from("staff_attendance")
    .select("id, staff_id, staff_name, work_date, clock_in_at, clock_out_at, is_overtime, overtime_reason_type, overtime_reason_note")
    .eq("clinic_id", clinicId)
    .gte("work_date", monthStart)
    .lte("work_date", monthEnd)
    .order("work_date", { ascending: false })
    .order("clock_out_at", { ascending: true });
  if (error) return { success: false, error: error.message };

  const records: AttendanceRecord[] = (data ?? []).map((r) => ({
    id: r.id as string,
    staffId: r.staff_id as string,
    staffName: r.staff_name as string,
    displayColor: colorOf.get(r.staff_id as string) ?? null,
    workDate: r.work_date as string,
    clockInAt: (r.clock_in_at as string | null) ?? null,
    clockOutAt: (r.clock_out_at as string | null) ?? null,
    isOvertime: !!r.is_overtime,
    reasonType: (r.overtime_reason_type as OvertimeReasonType | null) ?? null,
    reasonNote: (r.overtime_reason_note as string | null) ?? null,
  }));
  return { success: true, records };
}
