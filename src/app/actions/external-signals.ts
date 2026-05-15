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

export type SignalType =
  | "weather_today"
  | "weather_forecast"
  | "influenza_weekly"
  | "pollen"
  | "heatstroke_alert"
  | "manual";

export type ExternalSignal = {
  id: string;
  prefecture: string;
  signal_type: SignalType;
  observed_for: string;     // YYYY-MM-DD
  summary: string | null;
  payload: Record<string, unknown>;
  source: string;
  fetched_at: string;
};

/**
 * 自院の都道府県（clinic_settings.prefecture）に対応する最新シグナルを取得。
 * 各 signal_type につき最新 1 件を返す。
 * AI 秘書のプロンプトに渡しやすい配列形式。
 */
export async function getLatestSignalsForClinic(): Promise<ExternalSignal[]> {
  const auth = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return [];

  const { data: settings } = await sb
    .from("clinic_settings")
    .select("prefecture")
    .eq("id", auth.clinicId)
    .maybeSingle();
  const prefecture: string = settings?.prefecture ?? "徳島";

  const { data } = await sb
    .from("external_health_signals")
    .select("id, prefecture, signal_type, observed_for, summary, payload, source, fetched_at")
    .eq("prefecture", prefecture)
    .order("observed_for", { ascending: false })
    .limit(50);

  // signal_type ごとに最新 1 件だけ抽出
  const byType = new Map<string, ExternalSignal>();
  for (const r of (data ?? []) as any[]) {
    if (!byType.has(r.signal_type)) byType.set(r.signal_type, r as ExternalSignal);
  }
  return Array.from(byType.values());
}

export async function listSignalsForAdmin(): Promise<{ success: boolean; rows?: ExternalSignal[]; prefecture?: string; error?: string }> {
  const auth = await requireRole(["owner", "admin"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { data: settings } = await sb
    .from("clinic_settings")
    .select("prefecture")
    .eq("id", auth.clinicId)
    .maybeSingle();
  const prefecture: string = settings?.prefecture ?? "徳島";

  const { data, error } = await sb
    .from("external_health_signals")
    .select("id, prefecture, signal_type, observed_for, summary, payload, source, fetched_at")
    .eq("prefecture", prefecture)
    .order("observed_for", { ascending: false })
    .limit(50);

  if (error) return { success: false, error: error.message };
  return { success: true, rows: (data ?? []) as ExternalSignal[], prefecture };
}

export async function upsertManualSignal(input: {
  signal_type: "influenza_weekly" | "pollen" | "manual";
  observed_for: string;            // YYYY-MM-DD
  summary: string;
  payload?: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string }> {
  const auth = await requireRole(["owner", "admin"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { data: settings } = await sb
    .from("clinic_settings")
    .select("prefecture")
    .eq("id", auth.clinicId)
    .maybeSingle();
  const prefecture: string = settings?.prefecture ?? "徳島";

  if (!input.summary?.trim()) return { success: false, error: "サマリを入力してください" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.observed_for)) return { success: false, error: "対象日は YYYY-MM-DD 形式で" };

  const { error } = await sb
    .from("external_health_signals")
    .upsert(
      {
        prefecture,
        signal_type: input.signal_type,
        observed_for: input.observed_for,
        summary: input.summary.trim(),
        payload: input.payload ?? {},
        source: "manual",
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "prefecture,signal_type,observed_for" }
    );

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings/external-signals");
  return { success: true };
}

export async function deleteSignal(id: string): Promise<{ success: boolean; error?: string }> {
  await requireRole(["owner", "admin"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };
  const { error } = await sb.from("external_health_signals").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings/external-signals");
  return { success: true };
}
