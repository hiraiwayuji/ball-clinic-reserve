"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

// 公開アクション（認証不要）
function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabaseClient(url, key);
}

export type QuestionnaireData = {
  name: string;
  guardian_name?: string | null;
  phone: string;
  birth_month: number | null;
  gender: "male" | "female" | "other" | null;
  age_group: string | null;
};

export async function submitQuestionnaire(data: QuestionnaireData): Promise<{ success: boolean; error?: string; alreadyRegistered?: boolean }> {
  const { name, guardian_name, phone, birth_month, gender, age_group } = data;

  if (!name?.trim() || !phone?.trim()) {
    return { success: false, error: "お名前と電話番号は必須です" };
  }

  const db = getAdminSupabase();
  const DEFAULT_CLINIC_ID = "00000000-0000-0000-0000-000000000001";

  // 電話番号で既存顧客を照合
  const { data: existing } = await db
    .from("customers")
    .select("id, name, line_user_id")
    .eq("phone", phone.trim())
    .maybeSingle();

  if (existing) {
    // 既存顧客: プロフィールを更新
    const patch: Record<string, any> = { name: name.trim() };
    if (birth_month) patch.birth_month = birth_month;
    if (gender) patch.gender = gender;
    if (age_group) { try { patch.age_group = age_group; } catch {} }
    if (guardian_name) { try { patch.guardian_name = guardian_name; } catch {} }
    await db.from("customers").update(patch).eq("id", existing.id);

    return { success: true, alreadyRegistered: !!existing.line_user_id };
  }

  // 新規顧客として登録
  const insertData: Record<string, any> = {
    name: name.trim(),
    phone: phone.trim(),
    clinic_id: DEFAULT_CLINIC_ID,
  };
  if (birth_month) insertData.birth_month = birth_month;
  if (gender) insertData.gender = gender;
  if (age_group) { try { insertData.age_group = age_group; } catch {} }
  if (guardian_name) { try { insertData.guardian_name = guardian_name; } catch {} }

  const { error } = await db.from("customers").insert([insertData]);
  if (error) {
    console.error("questionnaire insert error:", error);
    return { success: false, error: "登録に失敗しました。しばらくしてからお試しください。" };
  }

  revalidatePath("/admin/customers");
  return { success: true, alreadyRegistered: false };
}
