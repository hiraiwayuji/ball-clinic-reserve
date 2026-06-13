"use server";

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";
import { CLINIC_CONFIG } from "@/lib/clinic-config";
import { pushLineToOwners } from "@/lib/admin-notify";
import { checkAdminAuth } from "@/app/actions/auth";

/**
 * スタッフ月次出勤希望（休み希望アンケート）。
 * - スタッフ用フォームはログイン不要（共通リンク＋名前選択）→ service role でアクセスし PUBLIC_CLINIC_ID に限定。
 * - オーナー用一覧は checkAdminAuth（自院のみ）。
 */

export type ShiftDay = {
  available: boolean;       // true=出勤可能 / false=休み希望（明示）
  start?: string;           // "HH:mm"（出勤可能時のみ）
  end?: string;             // "HH:mm"
  note?: string;
};
export type ShiftDays = Record<string, ShiftDay>; // key = "YYYY-MM-DD"

export type ShiftStaff = { id: string; name: string; display_color: string | null };

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** フォームの名前選択用：自院のアクティブスタッフ一覧（ログイン不要） */
export async function listShiftStaff(): Promise<ShiftStaff[]> {
  const { data } = await admin()
    .from("reservation_staff")
    .select("id, name, display_color")
    .eq("clinic_id", PUBLIC_CLINIC_ID)
    .eq("is_active", true)
    .order("sort_order")
    .order("created_at");
  return (data ?? []) as ShiftStaff[];
}

/** クリニック名（フォーム見出し用） */
export async function getShiftClinicName(): Promise<string> {
  return CLINIC_CONFIG.name;
}

/** 指定スタッフ・月の既存希望を取得（プリフィル用・ログイン不要） */
export async function getShiftRequest(
  staffId: string,
  month: string,
): Promise<{ days: ShiftDays; note: string | null; submittedAt: string | null } | null> {
  if (!staffId || !/^\d{4}-\d{2}$/.test(month)) return null;
  const { data } = await admin()
    .from("staff_shift_requests")
    .select("days, note, submitted_at")
    .eq("clinic_id", PUBLIC_CLINIC_ID)
    .eq("staff_id", staffId)
    .eq("month", month)
    .maybeSingle();
  if (!data) return null;
  return {
    days: (data.days as ShiftDays) ?? {},
    note: (data.note as string | null) ?? null,
    submittedAt: (data.submitted_at as string | null) ?? null,
  };
}

/** 出勤希望を提出（upsert）→ 提出されたらオーナーへLINE通知。ログイン不要。 */
export async function submitShiftRequest(input: {
  staffId: string;
  month: string;
  days: ShiftDays;
  note?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { staffId, month, days, note } = input;
  if (!staffId || !/^\d{4}-\d{2}$/.test(month)) {
    return { success: false, error: "入力が不正です" };
  }
  const db = admin();

  // staffId が自院の実在アクティブスタッフかを検証（共通リンクの最低限の防御）
  const { data: staff } = await db
    .from("reservation_staff")
    .select("id, name")
    .eq("clinic_id", PUBLIC_CLINIC_ID)
    .eq("id", staffId)
    .eq("is_active", true)
    .maybeSingle();
  if (!staff) return { success: false, error: "スタッフが見つかりません。お名前を選び直してください。" };

  const nowIso = new Date().toISOString();
  const { error } = await db
    .from("staff_shift_requests")
    .upsert(
      {
        clinic_id: PUBLIC_CLINIC_ID,
        staff_id: staffId,
        month,
        days,
        note: note ?? null,
        submitted_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "clinic_id, staff_id, month" },
    );
  if (error) return { success: false, error: error.message };

  // オーナーへLINE（提出のたびに一人ずつ）
  const availableCount = Object.values(days).filter((d) => d?.available).length;
  const [y, m] = month.split("-");
  try {
    await pushLineToOwners(
      PUBLIC_CLINIC_ID,
      `🗓️ 出勤希望が届きました\n${staff.name}さん（${Number(y)}年${Number(m)}月）\n出勤可能：${availableCount}日\n管理画面の「出勤調整」でご確認ください。`,
    );
  } catch (e) {
    console.error("[shift-request] owner LINE notify failed:", e);
  }
  return { success: true };
}

// ── オーナー用（管理画面・自院のみ） ───────────────────────────────

export type ShiftSubmission = {
  staffId: string;
  staffName: string;
  displayColor: string | null;
  days: ShiftDays;
  note: string | null;
  submittedAt: string | null;
};

/** 自院の指定月の全提出＋未提出スタッフを返す（オーナー出勤調整ページ用） */
export async function listShiftCoordination(month: string): Promise<{
  success: boolean;
  submissions?: ShiftSubmission[];
  unsubmitted?: ShiftStaff[];
  error?: string;
}> {
  const { clinicId } = await checkAdminAuth();
  if (!/^\d{4}-\d{2}$/.test(month)) return { success: false, error: "月の指定が不正です" };
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data: staffRows } = await supabase
    .from("reservation_staff")
    .select("id, name, display_color")
    .eq("clinic_id", clinicId)
    .eq("is_active", true)
    .order("sort_order")
    .order("created_at");
  const staff = (staffRows ?? []) as ShiftStaff[];

  const { data: reqRows } = await supabase
    .from("staff_shift_requests")
    .select("staff_id, days, note, submitted_at")
    .eq("clinic_id", clinicId)
    .eq("month", month);
  const byStaff = new Map<string, { days: ShiftDays; note: string | null; submittedAt: string | null }>();
  for (const r of reqRows ?? []) {
    byStaff.set(r.staff_id as string, {
      days: (r.days as ShiftDays) ?? {},
      note: (r.note as string | null) ?? null,
      submittedAt: (r.submitted_at as string | null) ?? null,
    });
  }

  const submissions: ShiftSubmission[] = [];
  const unsubmitted: ShiftStaff[] = [];
  for (const s of staff) {
    const row = byStaff.get(s.id);
    if (row && row.submittedAt) {
      submissions.push({
        staffId: s.id,
        staffName: s.name,
        displayColor: s.display_color,
        days: row.days,
        note: row.note,
        submittedAt: row.submittedAt,
      });
    } else {
      unsubmitted.push(s);
    }
  }
  return { success: true, submissions, unsubmitted };
}

/** 自動運用（1ヶ月前送信・締切リマインド）のON/OFF状態 */
export async function getShiftAutoEnabled(): Promise<boolean> {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data } = await supabase
    .from("clinic_settings").select("shift_request_enabled").eq("id", clinicId).maybeSingle();
  return !!data?.shift_request_enabled;
}

/** 自動運用のON/OFF切替（オーナー） */
export async function setShiftAutoEnabled(enabled: boolean): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { error } = await supabase
    .from("clinic_settings").update({ shift_request_enabled: enabled }).eq("id", clinicId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
