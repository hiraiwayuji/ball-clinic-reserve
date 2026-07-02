"use server";

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";
import { CLINIC_CONFIG } from "@/lib/clinic-config";
import { pushLineToOwners } from "@/lib/admin-notify";
import { requireRole } from "@/app/actions/auth";
import { OVERTIME_REASON_LABEL } from "@/lib/attendance-constants";

/**
 * 勤怠（出退勤の打刻）＋残業の見える化 [Phase 1]
 * - 打刻ページはログイン不要（受付PC / 各自スマホ・名前選択）→ service role で
 *   PUBLIC_CLINIC_ID に限定。
 * - オーナー用（設定・一覧・時給）は requireRole(['owner'])（自院のみ）。
 * - 時給・コストは owner 専用。打刻側では一切返さない。
 */

// ── 共通 ───────────────────────────────────────────────

export type OvertimeReasonType = "requested" | "closing" | "valid" | "other";

// 値（OVERTIME_REASONS / OVERTIME_REASON_LABEL / JUDGMENT_LABEL）は
// "@/lib/attendance-constants" に分離（"use server" は値を export できないため）。

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
    .eq("attendance_excluded", false)
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

// ── 当日の業務チェックリスト（役割別テンプレ → 出勤時に生成・退勤時に申告） ──

/** テンプレ項目の曜日/時期プレフィックス（例 "火:入金確認" "月初:レセプト"）を判定 */
function templateAppliesToday(title: string, dateStr: string): { applies: boolean; clean: string } {
  const m = title.match(/^(月初|月末|月|火|水|木|金|土|日):(.+)$/);
  if (!m) return { applies: true, clean: title };
  const d = new Date(dateStr + "T00:00:00+09:00");
  const dow = "日月火水木金土"[d.getDay()];
  const day = d.getDate();
  const tag = m[1];
  const applies =
    tag === "月初" ? day <= 5 :
    tag === "月末" ? day >= 25 :
    tag === dow;
  return { applies, clean: m[2].trim() };
}

/** 出勤時：所属グループのテンプレから当日タスクを生成（無いものだけ。承認済み扱い） */
async function ensureTodayTasks(db: ReturnType<typeof admin>, staffId: string, dateStr: string): Promise<void> {
  const [{ data: staff }, { data: settings }, { data: existing }] = await Promise.all([
    db.from("reservation_staff").select("task_groups").eq("id", staffId).eq("clinic_id", PUBLIC_CLINIC_ID).maybeSingle(),
    db.from("clinic_settings").select("daily_task_templates").eq("id", PUBLIC_CLINIC_ID).maybeSingle(),
    db.from("staff_tasks").select("title").eq("clinic_id", PUBLIC_CLINIC_ID).eq("staff_id", staffId).eq("due_date", dateStr),
  ]);
  const groups: string[] = (staff?.task_groups as string[] | null) ?? [];
  const templates = (settings?.daily_task_templates as Record<string, string[]> | null) ?? {};
  const wanted: string[] = [];
  for (const g of groups) {
    for (const t of templates[g] ?? []) {
      const { applies, clean } = templateAppliesToday(t, dateStr);
      if (applies && !wanted.includes(clean)) wanted.push(clean);
    }
  }
  const have = new Set((existing ?? []).map((r: any) => r.title as string));
  const rows = wanted.filter((t) => !have.has(t)).map((title) => ({
    clinic_id: PUBLIC_CLINIC_ID, staff_id: staffId, title, due_date: dateStr,
    status: "pending", priority: "normal", task_kind: "other", approved: true, source: "manual",
  }));
  if (rows.length > 0) await db.from("staff_tasks").insert(rows);
}

export type TodayTask = { id: string; title: string; outcome: "done" | "not_done" | null; outcomeReason: string | null };

/** 当日の自分の業務リスト（ログイン不要・打刻画面用） */
export async function getTodayTasks(staffId: string): Promise<TodayTask[]> {
  if (!staffId) return [];
  const db = admin();
  const { date } = jstNow();
  const { data } = await db.from("staff_tasks")
    .select("id, title, outcome, outcome_reason")
    .eq("clinic_id", PUBLIC_CLINIC_ID).eq("staff_id", staffId).eq("due_date", date).eq("approved", true)
    .order("created_at");
  return (data ?? []).map((r: any) => ({
    id: r.id, title: r.title,
    outcome: (r.outcome as "done" | "not_done" | null) ?? null,
    outcomeReason: (r.outcome_reason as string | null) ?? null,
  }));
}

/** 業務の申告（できた/できない）。できない場合は理由を残せる（ログイン不要） */
export async function reportTask(
  staffId: string, taskId: string, outcome: "done" | "not_done", reason?: string,
): Promise<{ success: boolean; error?: string }> {
  if (!staffId || !taskId) return { success: false, error: "不正なリクエストです" };
  const db = admin();
  const name = await verifyStaff(db, staffId);
  if (!name) return { success: false, error: "スタッフが見つかりません" };
  const { iso } = jstNow();
  const { error } = await db.from("staff_tasks")
    .update({
      outcome,
      outcome_reason: outcome === "not_done" ? (reason?.trim() || null) : null,
      status: outcome === "done" ? "done" : "pending",
      completed_at: outcome === "done" ? iso : null,
    })
    .eq("id", taskId).eq("clinic_id", PUBLIC_CLINIC_ID).eq("staff_id", staffId);
  return error ? { success: false, error: error.message } : { success: true };
}

/** 出勤打刻（ログイン不要）。当日の業務リストも役割テンプレから自動生成する */
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
  if (error) return { success: false, error: error.message };
  // 今日の業務チェックリストを用意（失敗しても打刻は成立させる）
  try { await ensureTodayTasks(db, staffId, date); } catch (e) { console.error("[attendance] ensureTodayTasks:", e); }
  return { success: true };
}

/**
 * 退勤打刻（ログイン不要）。
 * しきい値(既定20:15)以降の退社は残業扱い→理由が無ければ requireReason を返す。
 */
export async function clockOut(
  staffId: string,
  reason?: { type?: OvertimeReasonType; note?: string },
): Promise<{ success: boolean; requireReason?: boolean; isOvertime?: boolean; requireTaskReport?: boolean; remainingTasks?: number; error?: string }> {
  if (!staffId) return { success: false, error: "お名前を選んでください" };
  const db = admin();
  const name = await verifyStaff(db, staffId);
  if (!name) return { success: false, error: "スタッフが見つかりません。お名前を選び直してください。" };

  const cfg = await getAttendanceConfig();
  const { iso, date, minutes } = jstNow();
  const isOvertime = minutes >= toMinutes(cfg.overtimeReasonAfter);

  // ── 退勤ゲート：当日の業務が全部「できた/できない」申告済みでないと退勤できない ──
  const { data: taskRows } = await db.from("staff_tasks")
    .select("outcome")
    .eq("clinic_id", PUBLIC_CLINIC_ID).eq("staff_id", staffId).eq("due_date", date).eq("approved", true);
  const tasksTotal = (taskRows ?? []).length;
  const unreported = (taskRows ?? []).filter((r: any) => r.outcome == null).length;
  if (unreported > 0) {
    return { success: false, requireTaskReport: true, remainingTasks: unreported };
  }
  const tasksDone = (taskRows ?? []).filter((r: any) => r.outcome === "done").length;

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
      tasks_total: tasksTotal,
      tasks_done: tasksDone,
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
    .eq("attendance_excluded", false)
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

// ── Phase 2/3: 無駄な被り判定＋コスト・折半計算 ──────────

/**
 * 残業の正当性判定。
 * - requested  : 院長の依頼（理由＝requested）
 * - reservation: 20:00超の予約の担当だった（予約表と突合）
 * - closing    : 締め担当が締め許容時刻内に締め作業（理由＝closing）
 * - valid      : 正当な理由（自己申告。owner確認用）
 * - wasteful   : 上記いずれでもない＝ムダな残業（折半の対象候補）
 */
export type AttendanceJudgment = "requested" | "reservation" | "closing" | "valid" | "wasteful";

// JUDGMENT_LABEL の値は "@/lib/attendance-constants" に分離。

export type AttendanceReportRecord = AttendanceRecord & {
  judgment: AttendanceJudgment | null; // null = 定時（残業ではない）
  overtimeMinutes: number;             // 退社目標を超えた分（残業のみ）
  hourlyWage: number | null;
  fullPayYen: number | null;           // wasteful の満額残業代相当（時給未設定なら null）
  splitPayYen: number | null;          // 折半後の支給額
};

export type AttendanceSummary = {
  recordDays: number;
  overtimeCount: number;
  wastefulCount: number;
  overlapDays: number;        // 2人以上が残業退社した日
  wastefulFullYen: number;    // ムダな残業代（満額）合計
  wastefulSplitYen: number;   // 折半後の合計
  savedYen: number;           // 折半で抑えられる額（満額 - 折半後）
  wageMissing: boolean;       // 時給未設定の wasteful がある（金額が過小評価の可能性）
};

/** timestamptz を JST の {勤務日, 0時からの分数} に変換 */
function jstPartsOf(iso: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: hour * 60 + parseInt(get("minute"), 10) };
}

/**
 * オーナー：指定月の勤怠レポート（一覧＋判定＋コスト）。owner専用。
 * 予約表（appointments）と突合して「ムダな被り」を自動判定し、時給からコスト・折半額を計算する。
 */
export async function getAttendanceReport(
  month: string,
): Promise<{ success: boolean; records?: AttendanceReportRecord[]; summary?: AttendanceSummary; error?: string }> {
  const { clinicId } = await requireRole(["owner"]);
  if (!/^\d{4}-\d{2}$/.test(month)) return { success: false, error: "月の指定が不正です" };
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const [yy, mm] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(new Date(yy, mm, 0).getDate()).padStart(2, "0")}`;

  const [{ data: settings }, { data: staffRows }, attendanceRes, apptRes] = await Promise.all([
    supabase.from("clinic_settings")
      .select("work_end_target, overtime_reason_after, closing_allowance_until, closing_staff_id")
      .eq("id", clinicId).maybeSingle(),
    supabase.from("reservation_staff").select("id, display_color, hourly_wage").eq("clinic_id", clinicId),
    supabase.from("staff_attendance")
      .select("id, staff_id, staff_name, work_date, clock_in_at, clock_out_at, is_overtime, overtime_reason_type, overtime_reason_note")
      .eq("clinic_id", clinicId)
      .gte("work_date", monthStart).lte("work_date", monthEnd)
      .order("work_date", { ascending: false }).order("clock_out_at", { ascending: true }),
    // 20:00超まで続く予約の担当を割り出すため、月内に終わる非キャンセル予約を取得
    supabase.from("appointments")
      .select("end_time, staff_id, additional_staff")
      .eq("clinic_id", clinicId)
      .neq("status", "cancelled")
      .gte("end_time", `${monthStart}T00:00:00+09:00`)
      .lte("end_time", `${monthEnd}T23:59:59+09:00`),
  ]);
  if (attendanceRes.error) return { success: false, error: attendanceRes.error.message };

  const workEndMin = toMinutes(hhmm(settings?.work_end_target as string | null, "20:00"));
  const closingUntilMin = toMinutes(hhmm(settings?.closing_allowance_until as string | null, "20:30"));
  const closingStaffId = (settings?.closing_staff_id as string | null) ?? null;

  const colorOf = new Map<string, string | null>();
  const wageOf = new Map<string, number | null>();
  for (const s of staffRows ?? []) {
    colorOf.set(s.id as string, (s.display_color as string | null) ?? null);
    wageOf.set(s.id as string, (s.hourly_wage as number | null) ?? null);
  }

  // 予約表突合: 日付 → 20:00超まで担当していた staff_id 集合
  const justifiedByReservation = new Map<string, Set<string>>();
  for (const a of apptRes.data ?? []) {
    const end = a.end_time as string | null;
    if (!end) continue;
    const { date, minutes } = jstPartsOf(end);
    if (minutes <= workEndMin) continue; // 20:00 までに終わる予約は対象外
    const set = justifiedByReservation.get(date) ?? new Set<string>();
    if (a.staff_id) set.add(a.staff_id as string);
    for (const ex of (a.additional_staff as { staff_id: string }[] | null) ?? []) {
      if (ex?.staff_id) set.add(ex.staff_id);
    }
    justifiedByReservation.set(date, set);
  }

  const overtimeByDate = new Map<string, number>();
  const records: AttendanceReportRecord[] = (attendanceRes.data ?? []).map((r) => {
    const staffId = r.staff_id as string;
    const isOvertime = !!r.is_overtime;
    const reasonType = (r.overtime_reason_type as OvertimeReasonType | null) ?? null;
    const clockOutAt = (r.clock_out_at as string | null) ?? null;
    const workDate = r.work_date as string;
    const wage = wageOf.get(staffId) ?? null;

    let judgment: AttendanceJudgment | null = null;
    let overtimeMinutes = 0;
    let fullPayYen: number | null = null;
    let splitPayYen: number | null = null;

    if (isOvertime) {
      overtimeByDate.set(workDate, (overtimeByDate.get(workDate) ?? 0) + 1);
      const coMin = clockOutAt ? jstPartsOf(clockOutAt).minutes : workEndMin;
      overtimeMinutes = Math.max(0, coMin - workEndMin);

      const hasLateReservation = justifiedByReservation.get(workDate)?.has(staffId) ?? false;
      if (reasonType === "requested") judgment = "requested";
      else if (hasLateReservation) judgment = "reservation";
      else if (reasonType === "closing" && closingStaffId === staffId && coMin <= closingUntilMin) judgment = "closing";
      else if (reasonType === "valid") judgment = "valid";
      else judgment = "wasteful";

      if (judgment === "wasteful" && wage != null) {
        fullPayYen = Math.round((wage * overtimeMinutes) / 60);
        splitPayYen = Math.round(fullPayYen / 2);
      }
    }

    return {
      id: r.id as string,
      staffId,
      staffName: r.staff_name as string,
      displayColor: colorOf.get(staffId) ?? null,
      workDate,
      clockInAt: (r.clock_in_at as string | null) ?? null,
      clockOutAt,
      isOvertime,
      reasonType,
      reasonNote: (r.overtime_reason_note as string | null) ?? null,
      judgment,
      overtimeMinutes,
      hourlyWage: wage,
      fullPayYen,
      splitPayYen,
    };
  });

  const wasteful = records.filter((r) => r.judgment === "wasteful");
  const summary: AttendanceSummary = {
    recordDays: new Set(records.map((r) => r.workDate)).size,
    overtimeCount: records.filter((r) => r.isOvertime).length,
    wastefulCount: wasteful.length,
    overlapDays: [...overtimeByDate.values()].filter((n) => n >= 2).length,
    wastefulFullYen: wasteful.reduce((s, r) => s + (r.fullPayYen ?? 0), 0),
    wastefulSplitYen: wasteful.reduce((s, r) => s + (r.splitPayYen ?? 0), 0),
    savedYen: wasteful.reduce((s, r) => s + ((r.fullPayYen ?? 0) - (r.splitPayYen ?? 0)), 0),
    wageMissing: wasteful.some((r) => r.hourlyWage == null),
  };

  return { success: true, records, summary };
}
