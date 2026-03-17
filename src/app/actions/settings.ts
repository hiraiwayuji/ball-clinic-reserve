"use server";

import { unstable_noStore as noStore, revalidatePath } from "next/cache";
import { checkAdminAuth } from "./auth";

export type ClinicSettings = {
  id: string;
  clinic_name: string;
  hero_title: string;
  primary_color: string;
  max_beds: number;
  // SNS URLs
  tiktok_url?: string;
  instagram_url?: string;
  youtube_url?: string;
  x_url?: string;
  // LINE
  line_official_account_url?: string;
  line_channel_access_token?: string;
  line_channel_secret?: string;
  // Context
  area_name?: string;
  target_persona?: string;
  video_tone?: string;
  analysis_keywords?: string[];
  // Goals (Joined from clinic_targets for current month)
  target_income?: number;
  target_patients?: number;
  target_new_patients?: number;
  target_sns_tasks?: number;
  target_repeat_rate?: number;
};

const DEFAULT_CLINIC_ID = '00000000-0000-0000-0000-000000000001';

export async function getClinicSettings(): Promise<ClinicSettings | null> {
  await checkAdminAuth();
  noStore();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  // 1. Fetch Basic Settings
  const { data: settings, error: settingsError } = await supabase
    .from("clinic_settings")
    .select("*")
    .eq("id", DEFAULT_CLINIC_ID)
    .maybeSingle();

  if (settingsError) {
    console.error("Failed to fetch settings:", settingsError);
    return null;
  }

  // 2. Fetch Current Month's Targets
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-01`;
  
  const { data: targets, error: targetError } = await supabase
    .from("clinic_targets")
    .select("*")
    .eq("clinic_id", DEFAULT_CLINIC_ID)
    .eq("month", monthStr)
    .maybeSingle();

  if (targetError) {
    console.error("Failed to fetch targets:", targetError);
  }

  return {
    ...settings,
    target_income: targets?.target_income || 0,
    target_patients: targets?.target_patients || 0,
    target_new_patients: targets?.target_new_patients || 0,
    target_sns_tasks: targets?.target_sns_tasks || 0,
    target_repeat_rate: targets?.target_repeat_rate || 0,
  };
}

export async function updateClinicSettings(settings: Partial<ClinicSettings>) {
  await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  
  console.log("Saving settings for clinic:", DEFAULT_CLINIC_ID, settings);

  // 1. Separate settings for clinic_settings and clinic_targets
  const settingsData = {
    clinic_name: settings.clinic_name,
    hero_title: settings.hero_title,
    tiktok_url: settings.tiktok_url,
    instagram_url: settings.instagram_url,
    youtube_url: settings.youtube_url,
    x_url: settings.x_url,
    line_official_account_url: settings.line_official_account_url,
    line_channel_access_token: settings.line_channel_access_token,
    line_channel_secret: settings.line_channel_secret,
    area_name: settings.area_name,
    target_persona: settings.target_persona,
    video_tone: settings.video_tone,
    analysis_keywords: settings.analysis_keywords,
    updated_at: new Date().toISOString()
  };

  const targetData = {
    target_income: settings.target_income,
    target_patients: settings.target_patients,
    target_new_patients: settings.target_new_patients,
    target_sns_tasks: settings.target_sns_tasks,
    target_repeat_rate: settings.target_repeat_rate,
  };

  // 2. Upsert clinic_settings
  const { error: settingsError } = await supabase
    .from("clinic_settings")
    .upsert({ 
      id: DEFAULT_CLINIC_ID,
      ...settingsData
    });

  if (settingsError) {
    console.error("Failed to update clinic_settings. Error details:", JSON.stringify(settingsError, null, 2));
    return { success: false, error: "基本設定の更新に失敗しました: " + settingsError.message };
  }

  // 3. Upsert clinic_targets for current month
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-01`;
  
  const { error: targetError } = await supabase
    .from("clinic_targets")
    .upsert({
      clinic_id: DEFAULT_CLINIC_ID,
      month: monthStr,
      ...targetData,
      updated_at: new Date().toISOString()
    }, { onConflict: 'clinic_id, month' });

  if (targetError) {
    console.error("Failed to update clinic_targets. Error details:", JSON.stringify(targetError, null, 2));
    return { success: false, error: "経営目標の更新に失敗しました: " + targetError.message };
  }

  // DB Reflection Log as requested
  const { data: reflectSettings } = await supabase.from("clinic_settings").select("*").eq("id", DEFAULT_CLINIC_ID).single();
  const { data: reflectTargets } = await supabase.from("clinic_targets").select("*").eq("clinic_id", DEFAULT_CLINIC_ID).eq("month", monthStr).single();
  console.log("DB Reflect - Settings:", reflectSettings);
  console.log("DB Reflect - Targets:", reflectTargets);

  revalidatePath("/admin/settings");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/evaluation");

  return { success: true };
}
