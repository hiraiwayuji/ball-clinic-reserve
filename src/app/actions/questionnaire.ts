"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";

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
  // 追加収集（2026-06）: 市町村・学校/クラブ・生年月日。
  // 市町村＋年齢で子ども医療費助成の窓口負担(0/600円)を会計画面で色分けするのに使う。
  city_name?: string | null;
  school_club?: string | null;
  birth_date?: string | null; // "YYYY-MM-DD"（任意）
};

export async function submitQuestionnaire(data: QuestionnaireData): Promise<{ success: boolean; error?: string; alreadyRegistered?: boolean }> {
  const { name, guardian_name, phone, birth_month, gender, age_group, city_name, school_club, birth_date } = data;

  if (!name?.trim() || !phone?.trim()) {
    return { success: false, error: "お名前と電話番号は必須です" };
  }

  // 生年月日が入っていれば誕生月もそこから補完する。
  let effectiveBirthMonth = birth_month;
  if (birth_date && /^\d{4}-\d{2}-\d{2}$/.test(birth_date)) {
    const m = parseInt(birth_date.split("-")[1], 10);
    if (m >= 1 && m <= 12) effectiveBirthMonth = m;
  }

  const db = getAdminSupabase();
  const DEFAULT_CLINIC_ID = PUBLIC_CLINIC_ID;

  // 電話番号で既存顧客を照合（同一院内のみ）
  const { data: existing } = await db
    .from("customers")
    .select("id, name, line_user_id")
    .eq("clinic_id", DEFAULT_CLINIC_ID)
    .eq("phone", phone.trim())
    .maybeSingle();

  if (existing) {
    // 既存顧客: プロフィールを更新
    const patch: Record<string, any> = { name: name.trim() };
    if (effectiveBirthMonth) patch.birth_month = effectiveBirthMonth;
    if (gender) patch.gender = gender;
    if (age_group) { try { patch.age_group = age_group; } catch {} }
    if (guardian_name) { try { patch.guardian_name = guardian_name; } catch {} }
    if (city_name?.trim()) patch.city_name = city_name.trim();
    if (school_club?.trim()) patch.school_club = school_club.trim();
    if (birth_date) patch.birth_date = birth_date;
    await db.from("customers").update(patch).eq("id", existing.id).eq("clinic_id", DEFAULT_CLINIC_ID);

    return { success: true, alreadyRegistered: !!existing.line_user_id };
  }

  // 新規顧客として登録
  const insertData: Record<string, any> = {
    name: name.trim(),
    phone: phone.trim(),
    clinic_id: DEFAULT_CLINIC_ID,
  };
  if (effectiveBirthMonth) insertData.birth_month = effectiveBirthMonth;
  if (gender) insertData.gender = gender;
  if (age_group) { try { insertData.age_group = age_group; } catch {} }
  if (guardian_name) { try { insertData.guardian_name = guardian_name; } catch {} }
  if (city_name?.trim()) insertData.city_name = city_name.trim();
  if (school_club?.trim()) insertData.school_club = school_club.trim();
  if (birth_date) insertData.birth_date = birth_date;

  // tenant-isolation-ignore: insertData.clinic_id を L56 で設定済み
  const { error } = await db.from("customers").insert([insertData]);
  if (error) {
    console.error("questionnaire insert error:", error);
    return { success: false, error: "登録に失敗しました。しばらくしてからお試しください。" };
  }

  revalidatePath("/admin/customers");
  return { success: true, alreadyRegistered: false };
}
