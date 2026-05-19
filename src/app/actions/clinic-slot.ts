"use server";

import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SlotMinutes } from "@/lib/time-slots";

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
