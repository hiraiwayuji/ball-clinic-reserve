"use server";

// Phase 1: Security & Governance 専用 Server Actions
// - 設定画面パスコードの解錠 / 変更
// - 監査ログ閲覧 / 承認待ちキューの取得・承認・却下

import { revalidatePath } from "next/cache";
import { checkAdminAuth, requireRole } from "./auth";
import { hashPasscode, verifyPasscode } from "@/lib/passcode";
import { setSettingsUnlocked, clearSettingsUnlocked, isSettingsUnlocked } from "@/lib/settings-lock";
import { writeAudit, notifyOwnerOfStaffAction } from "@/lib/audit";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key);
}

// ───────── 設定画面パスコード ─────────

/** パスコードを入力して設定画面のロックを解除する */
export async function unlockSettingsAction(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const auth = await checkAdminAuth();
  const passcode = (formData.get("passcode") as string) ?? "";

  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー（service role key 未設定）" };

  const { data } = await sb
    .from("clinic_settings")
    .select("settings_passcode_hash")
    .eq("id", auth.clinicId)
    .maybeSingle();

  const ok = await verifyPasscode(passcode, data?.settings_passcode_hash);
  if (!ok) {
    await writeAudit({
      clinicId: auth.clinicId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      actionType: "passcode.unlock_failed",
      targetTable: "clinic_settings",
      targetId: auth.clinicId,
    });
    return { success: false, error: "パスコードが違います" };
  }

  await setSettingsUnlocked(auth.clinicId);
  await writeAudit({
    clinicId: auth.clinicId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    actionType: "passcode.unlock",
    targetTable: "clinic_settings",
    targetId: auth.clinicId,
  });
  return { success: true };
}

/** ログアウトせず明示的に再ロックする */
export async function lockSettingsAction(): Promise<{ success: boolean }> {
  await clearSettingsUnlocked();
  return { success: true };
}

/** 設定パスコードを変更する（owner のみ） */
export async function updateSettingsPasscodeAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireRole(["owner"]);
  const current = (formData.get("currentPasscode") as string) ?? "";
  const next = (formData.get("newPasscode") as string) ?? "";
  const cleaned = next.replace(/\D/g, "");
  if (cleaned.length < 4 || cleaned.length > 6) {
    return { success: false, error: "新しいパスコードは数字 4〜6 桁で入力してください" };
  }

  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { data } = await sb
    .from("clinic_settings")
    .select("settings_passcode_hash")
    .eq("id", auth.clinicId)
    .maybeSingle();

  const ok = await verifyPasscode(current, data?.settings_passcode_hash);
  if (!ok) return { success: false, error: "現在のパスコードが違います" };

  const newHash = await hashPasscode(cleaned);
  const { error } = await sb
    .from("clinic_settings")
    .update({ settings_passcode_hash: newHash })
    .eq("id", auth.clinicId);
  if (error) return { success: false, error: "保存に失敗しました: " + error.message };

  await writeAudit({
    clinicId: auth.clinicId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    actionType: "passcode.update",
    targetTable: "clinic_settings",
    targetId: auth.clinicId,
  });
  // 変更後はいったん再ロックして再入力を促す
  await clearSettingsUnlocked();
  revalidatePath("/admin/settings");
  return { success: true };
}

// ───────── 監査ログ ─────────

export type AuditLogRow = {
  id: string;
  created_at: string;
  actor_email: string | null;
  actor_role: string;
  action_type: string;
  target_table: string | null;
  target_id: string | null;
  before_data: unknown;
  after_data: unknown;
  diff: unknown;
};

export async function listAuditLogs(limit: number = 100): Promise<AuditLogRow[]> {
  const auth = await requireRole(["owner", "admin"]);
  const sb = getServiceClient();
  if (!sb) return [];
  const { data } = await sb
    .from("audit_log")
    .select("id, created_at, actor_email, actor_role, action_type, target_table, target_id, before_data, after_data, diff")
    .eq("clinic_id", auth.clinicId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as AuditLogRow[];
}

// ───────── 承認待ちキュー ─────────

export type PendingChangeRow = {
  id: string;
  clinic_id: string;
  requested_by: string | null;
  requested_email: string | null;
  requested_role: string;
  target_table: string;
  payload: Record<string, unknown>;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_note: string | null;
  created_at: string;
};

export async function listPendingChanges(): Promise<PendingChangeRow[]> {
  const auth = await requireRole(["owner", "admin"]);
  const sb = getServiceClient();
  if (!sb) return [];
  const { data } = await sb
    .from("pending_settings_changes")
    .select("*")
    .eq("clinic_id", auth.clinicId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  return (data ?? []) as PendingChangeRow[];
}

export async function approvePendingChange(id: string, note?: string): Promise<{ success: boolean; error?: string }> {
  const auth = await requireRole(["owner"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { data: row, error: fetchErr } = await sb
    .from("pending_settings_changes")
    .select("*")
    .eq("id", id)
    .eq("clinic_id", auth.clinicId)
    .eq("status", "pending")
    .maybeSingle();
  if (fetchErr || !row) return { success: false, error: "対象の変更申請が見つかりません" };

  // payload を実際に upsert する
  if (row.target_table === "clinic_settings") {
    const { error } = await sb.from("clinic_settings").update(row.payload).eq("id", auth.clinicId);
    if (error) return { success: false, error: "適用に失敗しました: " + error.message };
  } else if (row.target_table === "clinic_targets") {
    const month = (row.payload?.month as string) ?? "";
    if (!month) return { success: false, error: "month が指定されていません" };
    const { error } = await sb
      .from("clinic_targets")
      .upsert({ clinic_id: auth.clinicId, ...row.payload }, { onConflict: "clinic_id,month" });
    if (error) return { success: false, error: "適用に失敗しました: " + error.message };
  } else {
    return { success: false, error: `未対応の target_table: ${row.target_table}` };
  }

  await sb
    .from("pending_settings_changes")
    .update({
      status: "approved",
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
      reviewer_note: note ?? null,
    })
    .eq("id", id);

  await writeAudit({
    clinicId: auth.clinicId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    actionType: "pending_change.approve",
    targetTable: row.target_table,
    targetId: id,
    after: row.payload,
  });

  revalidatePath("/admin/approvals");
  revalidatePath("/admin/settings");
  return { success: true };
}

export async function rejectPendingChange(id: string, note?: string): Promise<{ success: boolean; error?: string }> {
  const auth = await requireRole(["owner"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { error } = await sb
    .from("pending_settings_changes")
    .update({
      status: "rejected",
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
      reviewer_note: note ?? null,
    })
    .eq("id", id)
    .eq("clinic_id", auth.clinicId);
  if (error) return { success: false, error: error.message };

  await writeAudit({
    clinicId: auth.clinicId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    actionType: "pending_change.reject",
    targetTable: "pending_settings_changes",
    targetId: id,
  });

  revalidatePath("/admin/approvals");
  return { success: true };
}

/** クライアントから現在のロック状態を読むためのラッパー */
export async function getSettingsLockStatus(): Promise<{ unlocked: boolean }> {
  const auth = await checkAdminAuth();
  return { unlocked: await isSettingsUnlocked(auth.clinicId) };
}

// ───────── 通知先管理（admin_notification_targets） ─────────

export type NotificationTargetRow = {
  id: string;
  label: string;
  line_user_id: string | null;
  email: string | null;
  enabled: boolean;
  created_at: string;
};

export async function listNotificationTargets(): Promise<NotificationTargetRow[]> {
  const auth = await requireRole(["owner"]);
  const sb = getServiceClient();
  if (!sb) return [];
  const { data } = await sb
    .from("admin_notification_targets")
    .select("id, label, line_user_id, email, enabled, created_at")
    .eq("clinic_id", auth.clinicId)
    .order("created_at", { ascending: true });
  return (data ?? []) as NotificationTargetRow[];
}

export async function addNotificationTarget(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const auth = await requireRole(["owner"]);
  const label = ((formData.get("label") as string) ?? "").trim();
  const lineUserId = ((formData.get("line_user_id") as string) ?? "").trim() || null;
  const email = ((formData.get("email") as string) ?? "").trim() || null;
  if (!label) return { success: false, error: "ラベルを入力してください" };
  if (!lineUserId && !email) return { success: false, error: "LINE user_id またはメールアドレスのいずれかを入力してください" };

  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };
  const { error } = await sb.from("admin_notification_targets").insert({
    clinic_id: auth.clinicId,
    label,
    line_user_id: lineUserId,
    email,
    enabled: true,
    user_id: auth.userId,
  });
  if (error) return { success: false, error: error.message };

  await writeAudit({
    clinicId: auth.clinicId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    actionType: "notification_target.add",
    targetTable: "admin_notification_targets",
    after: { label, line_user_id: lineUserId, email },
  });
  revalidatePath("/admin/settings");
  return { success: true };
}

export async function deleteNotificationTarget(id: string): Promise<{ success: boolean; error?: string }> {
  const auth = await requireRole(["owner"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };
  const { error } = await sb
    .from("admin_notification_targets")
    .delete()
    .eq("id", id)
    .eq("clinic_id", auth.clinicId);
  if (error) return { success: false, error: error.message };

  await writeAudit({
    clinicId: auth.clinicId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    actionType: "notification_target.delete",
    targetTable: "admin_notification_targets",
    targetId: id,
  });
  revalidatePath("/admin/settings");
  return { success: true };
}

export async function toggleNotificationTarget(
  id: string,
  enabled: boolean,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireRole(["owner"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };
  const { error } = await sb
    .from("admin_notification_targets")
    .update({ enabled })
    .eq("id", id)
    .eq("clinic_id", auth.clinicId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings");
  return { success: true };
}

// ───────── Phase 4: ゲーミフィケーション ─────────

export type LeaderboardRow = {
  user_id: string;
  user_email: string | null;
  total_points: number;
  entry_count: number;
  last_earned_at: string | null;
  rank: number;
};

export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const auth = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return [];
  const { data } = await sb
    .from("staff_points_summary")
    .select("user_id, user_email, total_points, entry_count, last_earned_at")
    .eq("clinic_id", auth.clinicId)
    .order("total_points", { ascending: false });
  return (data ?? []).map((r: any, i: number) => ({ ...r, rank: i + 1 })) as LeaderboardRow[];
}

export async function getMyPointsToday(): Promise<{ today: number; thisWeek: number; total: number }> {
  const auth = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { today: 0, thisWeek: 0, total: 0 };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [todayRes, weekRes, totalRes] = await Promise.all([
    sb
      .from("staff_points")
      .select("points")
      .eq("clinic_id", auth.clinicId)
      .eq("user_id", auth.userId)
      .gte("created_at", todayStart.toISOString()),
    sb
      .from("staff_points")
      .select("points")
      .eq("clinic_id", auth.clinicId)
      .eq("user_id", auth.userId)
      .gte("created_at", weekStart.toISOString()),
    sb
      .from("staff_points")
      .select("points")
      .eq("clinic_id", auth.clinicId)
      .eq("user_id", auth.userId),
  ]);

  const sum = (r: { points: number }[] | null) => (r ?? []).reduce((s, x) => s + (x.points ?? 0), 0);
  return {
    today: sum(todayRes.data),
    thisWeek: sum(weekRes.data),
    total: sum(totalRes.data),
  };
}
