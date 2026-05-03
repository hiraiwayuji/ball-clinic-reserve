"use server";

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { checkAdminAuth } from "./auth";

export type ReminderRow = {
  id: string;
  clinic_id: string;
  title: string;
  message: string | null;
  fire_at: string;          // ISO
  status: "pending" | "fired" | "done" | "snoozed" | "cancelled";
  snoozed_until: string | null;
  fired_at: string | null;
  done_at: string | null;
  created_by_email: string | null;
  created_at: string;
};

function getAdminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");
  return createAdminClient(url, key, { auth: { persistSession: false } });
}

/** 新しいリマインダーを作成。fireAt は ISO 文字列。 */
export async function createReminder(input: {
  title: string;
  message?: string | null;
  fireAt: string; // ISO
}) {
  const auth = await checkAdminAuth();
  if (!input.title?.trim()) return { ok: false, error: "タイトルを入力してください" };
  if (!input.fireAt) return { ok: false, error: "発火時刻を指定してください" };

  // 過去時刻は弾く（30 秒の余裕は許可）
  const fireMs = new Date(input.fireAt).getTime();
  if (!Number.isFinite(fireMs)) return { ok: false, error: "発火時刻が不正です" };
  if (fireMs < Date.now() - 30_000) {
    return { ok: false, error: "発火時刻は現在以降を指定してください" };
  }

  const db = getAdminDb();
  const { data, error } = await db
    .from("reminders")
    .insert({
      clinic_id: auth.clinicId,
      created_by: auth.userId,
      created_by_email: auth.email,
      title: input.title.trim(),
      message: input.message?.trim() || null,
      fire_at: input.fireAt,
      status: "pending",
    })
    .select()
    .single();
  if (error) {
    console.error("createReminder error:", error.message);
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin");
  return { ok: true, reminder: data as ReminderRow };
}

/**
 * 自院の発火対象リマインダーを取得。
 * - status pending かつ fire_at <= now()
 * - status snoozed かつ snoozed_until <= now()
 * クライアント側のポーリングから呼ばれる。
 */
export async function listFiredReminders(): Promise<ReminderRow[]> {
  const auth = await checkAdminAuth();
  const db = getAdminDb();
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("reminders")
    .select("*")
    .eq("clinic_id", auth.clinicId)
    .or(
      `and(status.eq.pending,fire_at.lte.${nowIso}),and(status.eq.snoozed,snoozed_until.lte.${nowIso})`,
    )
    .order("fire_at", { ascending: true })
    .limit(20);
  if (error) {
    console.error("listFiredReminders error:", error.message);
    return [];
  }
  return (data ?? []) as ReminderRow[];
}

/** 直近 24h 以内の自院アクティブ・リマインダー一覧（管理画面表示用） */
export async function listUpcomingReminders(): Promise<ReminderRow[]> {
  const auth = await checkAdminAuth();
  const db = getAdminDb();
  const nowIso = new Date().toISOString();
  const horizonIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("reminders")
    .select("*")
    .eq("clinic_id", auth.clinicId)
    .in("status", ["pending", "snoozed", "fired"])
    .gte("fire_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .lte("fire_at", horizonIso)
    .order("fire_at", { ascending: true });
  if (error) {
    console.error("listUpcomingReminders error:", error.message);
    return [];
  }
  // (auth used to ensure session valid; nowIso left for clarity)
  void nowIso;
  return (data ?? []) as ReminderRow[];
}

/** 完了押下: ステータスを done に */
export async function markReminderDone(id: string) {
  const auth = await checkAdminAuth();
  const db = getAdminDb();
  const { error } = await db
    .from("reminders")
    .update({ status: "done", done_at: new Date().toISOString(), done_by: auth.userId })
    .eq("id", id)
    .eq("clinic_id", auth.clinicId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/** スヌーズ: minutes 分後にもう一度発火 */
export async function snoozeReminder(id: string, minutes: number) {
  const auth = await checkAdminAuth();
  const db = getAdminDb();
  const next = new Date(Date.now() + minutes * 60_000).toISOString();
  const { error } = await db
    .from("reminders")
    .update({ status: "snoozed", snoozed_until: next })
    .eq("id", id)
    .eq("clinic_id", auth.clinicId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/** キャンセル */
export async function cancelReminder(id: string) {
  const auth = await checkAdminAuth();
  const db = getAdminDb();
  const { error } = await db
    .from("reminders")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("clinic_id", auth.clinicId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/** ポップアップ表示時に fire 状態へ移行（重複ポップアップ抑止用） */
export async function markReminderFired(id: string) {
  const auth = await checkAdminAuth();
  const db = getAdminDb();
  const { error } = await db
    .from("reminders")
    .update({ status: "fired", fired_at: new Date().toISOString() })
    .eq("id", id)
    .eq("clinic_id", auth.clinicId)
    .in("status", ["pending", "snoozed"]); // 重複しても他状態を上書きしない
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
