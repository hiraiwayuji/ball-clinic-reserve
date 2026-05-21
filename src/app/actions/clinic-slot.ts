"use server";

import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SlotMinutes } from "@/lib/time-slots";

export type ClinicViewType = "list" | "timeline";

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
