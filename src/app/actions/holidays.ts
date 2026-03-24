"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/app/actions/auth";
import { unstable_noStore as noStore } from "next/cache";

async function getSupabase() {
  return await createClient();
}

export type ClinicHoliday = {
  id: string;
  date: string; // YYYY-MM-DD
  description: string | null;
  created_at: string;
};

// 1. 休診日一覧を取得
export async function getClinicHolidays(): Promise<ClinicHoliday[]> {
  noStore();
  const supabase = await getSupabase();
  if (!supabase) return [];
  
  const { data, error } = await supabase
    .from("clinic_holidays")
    .select("*")
    .order("date", { ascending: true });
    
  if (error) {
    console.error("Failed to fetch holidays:", error);
    return [];
  }
  return data || [];
}

// 2. 指定した日付（複数）を休診日として追加・削除する (Toggle処理)
// ※ プロトタイプ用：単一日付を確実に追加/削除する
export async function toggleClinicHoliday(dateStr: string, isAdding: boolean, description?: string): Promise<{ success: boolean; error?: string }> {
  await checkAdminAuth();
  const supabase = await getSupabase();
  if (!supabase) return { success: false, error: "Database not configured" };

  try {
    if (isAdding) {
      const { error } = await supabase
        .from("clinic_holidays")
        .insert([{ 
          date: dateStr, 
          description: description || "休診日"
        }]);
        
      // UNIQUE制約違反の場合は既に登録済みとみなす
      if (error && error.code !== "23505") {
        throw error;
      }
    } else {
      const { error } = await supabase
        .from("clinic_holidays")
        .delete()
        .eq("date", dateStr);
        
      if (error) throw error;
    }
    return { success: true };
  } catch (error: any) {
    console.error("Toggle holiday error:", error);
    return { success: false, error: error.message || "Failed to toggle holiday" };
  }
}
