"use server";

import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { type SlotMinutes, type Schedule, buildSchedule } from "@/lib/time-slots";

export type ClinicViewType = "list" | "timeline";
export type AiSecretaryMode = "global" | "admin_only";

/**
 * 現在のクリニックの予約枠サイズ（分）を取得。
 * client component が初期化時に呼ぶ用途。anon でも読める clinic_settings 前提。
 * NEXT_PUBLIC_CLINIC_ID（≒ PUBLIC_CLINIC_ID）の clinic を見る。
 */
export async function getCurrentSlotDuration(): Promise<SlotMinutes> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return 30;
  }
  const sb = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const { data } = await sb
    .from("clinic_settings")
    .select("slot_duration_minutes")
    .eq("id", PUBLIC_CLINIC_ID)
    .maybeSingle();
  const v = data?.slot_duration_minutes;
  if (v === 15 || v === 20 || v === 30) return v;
  return 30;
}

/**
 * ダッシュボードの予約ビュー形式（'list' / 'timeline'）。
 * 院ごとに設定（clinic_settings.view_type）。
 *
 * Fail-safe: Supabase 取得失敗時は "list" を返す。
 * dashboard server component から await されるため、
 * ここで例外を投げると /admin/dashboard が 500 になり
 * ログイン後の遷移先が落ちる事故を起こす（2026-05-21 実例）。
 */
/**
 * 院ごとの営業時間スケジュール（曜日別営業時間 + 休診曜日）を取得。
 * 失敗時は DEFAULT_SCHEDULE（ボール接骨院互換）を返す。
 */
export async function getCurrentSchedule(): Promise<Schedule> {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return buildSchedule(null);
    }
    const sb = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } },
    );
    const { data } = await sb
      .from("clinic_settings")
      .select("business_open_weekday, business_close_weekday, business_open_saturday, business_close_saturday, business_break_start_weekday, business_break_end_weekday, business_break_start_saturday, business_break_end_saturday, closed_weekdays")
      .eq("id", PUBLIC_CLINIC_ID)
      .maybeSingle();
    return buildSchedule(data);
  } catch (e: any) {
    console.error("[getCurrentSchedule] fallback to default:", e?.message ?? e);
    return buildSchedule(null);
  }
}

export async function getCurrentViewType(): Promise<ClinicViewType> {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return "list";
    }
    const sb = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } },
    );
    const { data, error } = await sb
      .from("clinic_settings")
      .select("view_type")
      .eq("id", PUBLIC_CLINIC_ID)
      .maybeSingle();
    if (error) {
      console.error("[getCurrentViewType] supabase error, fallback to 'list':", error.message);
      return "list";
    }
    const v = data?.view_type;
    return v === "timeline" ? "timeline" : "list";
  } catch (e: any) {
    console.error("[getCurrentViewType] unexpected error, fallback to 'list':", e?.message ?? e);
    return "list";
  }
}

/**
 * AI秘書 の表示範囲（'global' / 'admin_only'）。
 * 院ごとに設定（clinic_settings.ai_secretary_mode）。
 *
 * Fail-safe: Supabase 取得失敗時は "global" を返す（破壊的変更を避ける）。
 */
export async function getCurrentAiSecretaryMode(): Promise<AiSecretaryMode> {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return "global";
    }
    const sb = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } },
    );
    const { data, error } = await sb
      .from("clinic_settings")
      .select("ai_secretary_mode")
      .eq("id", PUBLIC_CLINIC_ID)
      .maybeSingle();
    if (error) {
      console.error("[getCurrentAiSecretaryMode] supabase error, fallback to 'global':", error.message);
      return "global";
    }
    const v = data?.ai_secretary_mode;
    return v === "admin_only" ? "admin_only" : "global";
  } catch (e: any) {
    console.error("[getCurrentAiSecretaryMode] unexpected error, fallback to 'global':", e?.message ?? e);
    return "global";
  }
}

/**
 * 経費管理をオーナー専用にするかどうか（clinic_settings.expense_owner_only）。
 * true の院では、role = 'owner' 以外のユーザーから経費関連 UI / ページを
 * 一切表示しない（ダッシュボードショートカット、/admin/expenses 等）。
 *
 * Fail-safe: Supabase 取得失敗時は false を返す（既存運用維持）。
 */
export async function getCurrentExpenseOwnerOnly(): Promise<boolean> {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return false;
    }
    const sb = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } },
    );
    const { data, error } = await sb
      .from("clinic_settings")
      .select("expense_owner_only")
      .eq("id", PUBLIC_CLINIC_ID)
      .maybeSingle();
    if (error) {
      console.error("[getCurrentExpenseOwnerOnly] supabase error, fallback to false:", error.message);
      return false;
    }
    return data?.expense_owner_only === true;
  } catch (e: any) {
    console.error("[getCurrentExpenseOwnerOnly] unexpected error, fallback to false:", e?.message ?? e);
    return false;
  }
}
