"use server";

import { unstable_noStore as noStore, revalidatePath } from "next/cache";
import { checkAdminAuth } from "./auth";
import { writeAudit, notifyOwnerOfStaffAction } from "@/lib/audit";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export type ClinicSettings = {
  id: string;
  clinic_name: string;
  custom_expense_categories?: string[];
  hero_title: string;
  primary_color: string;
  max_beds: number;
  slot_duration_minutes: 15 | 20 | 30;
  view_type?: "list" | "timeline";
  // SNS URLs
  tiktok_url?: string;
  instagram_url?: string;
  youtube_url?: string;
  x_url?: string;
  // LINE
  line_official_account_url?: string;
  line_channel_access_token?: string;
  line_channel_secret?: string;
  // LINE ショップカード（来院スタンプ加算用 URL。LINE Manager の「ショップカード」設定画面で発行）
  // 設定済みの場合、会計完了時の患者向け LINE 通知にこの URL を含めて自動でスタンプ加算を促す
  line_stamp_card_url?: string | null;
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
  // New clinic info
  phone_number?: string;
  address?: string;
  market_area?: string;
  target_generation?: string;
  doctor_count?: number;
  staff_count?: number;
  branch_count?: number;
  hp_url?: string;
  // 営業時間（表示用テキスト）
  hours_lines?: string[];
  hours_closed?: string;
  // 営業時間（予約スロット生成用 = 患者LP・公開予約画面で使用）
  business_open_weekday?: string | null;
  business_close_weekday?: string | null;
  business_open_saturday?: string | null;
  business_close_saturday?: string | null;
  closed_weekdays?: string | null;
  // 院全体の休憩時間（昼休み等）。NULL なら休憩なし。患者LP のスロット計算で除外。
  business_break_start_weekday?: string | null;
  business_break_end_weekday?: string | null;
  business_break_start_saturday?: string | null;
  business_break_end_saturday?: string | null;
  // 管理画面タイムテーブル専用の表示時間（任意・NULL なら business_* にフォールバック）
  // 例：からだ＝公開は 10:00-20:00、管理画面では準備時間込みで 9:00-21:00
  admin_timeline_open_weekday?: string | null;
  admin_timeline_close_weekday?: string | null;
  admin_timeline_open_saturday?: string | null;
  admin_timeline_close_saturday?: string | null;
  // 患者向けLP（/reserve, /reserve/menu）用
  hero_subtitle?: string | null;
  hero_image_url?: string | null;
  hero_background_url?: string | null;
  lp_features?: { icon?: string; title: string; description?: string }[] | null;
  lp_target_problems?: string[] | null;
  lp_voice_quote?: string | null;
  lp_voice_author?: string | null;
  lp_cta_text?: string | null;
  theme_color?: string | null;
  // /admin/appointments のデフォルト表示モード
  // week=週グリッド, day=日, month=月, timetable=スタッフ別タイムテーブル
  default_appointments_view?: "week" | "day" | "month" | "timetable" | null;
  // 患者LP /reserve の予約フロー
  // datetime_first: 日時 → コース → 担当（既存）
  // menu_first    : コース → 担当 → 空き日時（治療院系UX）
  public_reserve_flow?: "datetime_first" | "menu_first" | null;
  // 経費管理をオーナー専用にする（true の院では role != 'owner' は経費 UI 不可視）
  expense_owner_only?: boolean | null;
  // 店舗の部門（例: ["サロン","カフェ"]）。経費・予約で共通利用。空配列なら部門UIを出さない＝従来通り。
  departments?: string[] | null;
  // 子ども医療費助成の市町村×学年ステージ別ルール（JSONB）。専用の getter/setter で更新するため
  // settingsData には載せない（updateClinicSettings 経由では更新しない）。NULL なら徳島デフォルト。
  medical_aid_rules?: import("@/lib/medical-aid").MedicalAidRules | null;
  // 医療費助成ルールの最終見直し日（年度替わりリマインド用）。
  medical_aid_reviewed_at?: string | null;
};


export async function getClinicSettings(): Promise<ClinicSettings | null> {
  const { clinicId } = await checkAdminAuth();
  noStore();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  // 1. Fetch Basic Settings
  const { data: settings, error: settingsError } = await supabase
    .from("clinic_settings")
    .select("*")
    .eq("id", clinicId)
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
    .eq("clinic_id", clinicId)
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

export async function updateClinicSettings(
  settings: Partial<ClinicSettings>,
): Promise<{ success: boolean; error?: string; pendingApproval?: boolean }> {
  const auth = await checkAdminAuth();
  const { clinicId } = auth;
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  console.log("Saving settings for clinic:", clinicId, settings);

  // ── owner 以外は承認待ちキューに登録（即時反映しない） ──
  if (auth.role !== "owner") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !srk) return { success: false, error: "サーバー設定エラー（service role 未設定）" };
    const sb = createSupabaseClient(url, srk);

    const { error: pendingErr } = await sb.from("pending_settings_changes").insert({
      clinic_id: clinicId,
      requested_by: auth.userId,
      requested_email: auth.email,
      requested_role: auth.role,
      target_table: "clinic_settings",
      payload: settings,
      reason: "管理画面からの設定変更",
      status: "pending",
    });
    if (pendingErr) return { success: false, error: "承認申請の登録に失敗: " + pendingErr.message };

    await writeAudit({
      clinicId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      actionType: "settings.request",
      targetTable: "clinic_settings",
      targetId: clinicId,
      after: settings,
    });
    await notifyOwnerOfStaffAction({
      clinicId,
      actorRole: auth.role,
      actorEmail: auth.email,
      actionType: "⚠️ 設定変更の申請（要承認）",
      summary: `スタッフが clinic_settings の変更を申請しました。\n/admin/approvals で内容を確認してください。`,
    });

    return { success: true, pendingApproval: true };
  }

  // 1. Separate settings for clinic_settings and clinic_targets
  const settingsData = {
    clinic_name: settings.clinic_name,
    slot_duration_minutes: settings.slot_duration_minutes,
    view_type: settings.view_type ?? "list",
    hero_title: settings.hero_title,
    tiktok_url: settings.tiktok_url,
    instagram_url: settings.instagram_url,
    youtube_url: settings.youtube_url,
    x_url: settings.x_url,
    line_official_account_url: settings.line_official_account_url,
    line_channel_access_token: settings.line_channel_access_token,
    line_channel_secret: settings.line_channel_secret,
    line_stamp_card_url: settings.line_stamp_card_url ?? null,
    area_name: settings.area_name,
    target_persona: settings.target_persona,
    video_tone: settings.video_tone,
    analysis_keywords: settings.analysis_keywords,
    phone_number: settings.phone_number,
    address: settings.address,
    market_area: settings.market_area,
    target_generation: settings.target_generation,
    doctor_count: settings.doctor_count,
    staff_count: settings.staff_count,
    branch_count: settings.branch_count,
    hp_url: settings.hp_url,
    hours_lines: settings.hours_lines,
    hours_closed: settings.hours_closed,
    business_open_weekday:   settings.business_open_weekday ?? null,
    business_close_weekday:  settings.business_close_weekday ?? null,
    business_open_saturday:  settings.business_open_saturday ?? null,
    business_close_saturday: settings.business_close_saturday ?? null,
    business_break_start_weekday:  settings.business_break_start_weekday ?? null,
    business_break_end_weekday:    settings.business_break_end_weekday ?? null,
    business_break_start_saturday: settings.business_break_start_saturday ?? null,
    business_break_end_saturday:   settings.business_break_end_saturday ?? null,
    closed_weekdays:         settings.closed_weekdays ?? null,
    admin_timeline_open_weekday:   settings.admin_timeline_open_weekday ?? null,
    admin_timeline_close_weekday:  settings.admin_timeline_close_weekday ?? null,
    admin_timeline_open_saturday:  settings.admin_timeline_open_saturday ?? null,
    admin_timeline_close_saturday: settings.admin_timeline_close_saturday ?? null,
    hero_subtitle: settings.hero_subtitle ?? null,
    hero_image_url: settings.hero_image_url ?? null,
    hero_background_url: settings.hero_background_url ?? null,
    lp_features: settings.lp_features ?? null,
    lp_target_problems: settings.lp_target_problems ?? null,
    lp_voice_quote: settings.lp_voice_quote ?? null,
    lp_voice_author: settings.lp_voice_author ?? null,
    lp_cta_text: settings.lp_cta_text ?? null,
    theme_color: settings.theme_color ?? null,
    default_appointments_view: settings.default_appointments_view ?? null,
    public_reserve_flow: settings.public_reserve_flow ?? null,
    expense_owner_only: settings.expense_owner_only ?? false,
    departments: settings.departments ?? [],
  };

  const targetData = {
    target_income: settings.target_income,
    target_patients: settings.target_patients,
    target_new_patients: settings.target_new_patients,
    target_sns_tasks: settings.target_sns_tasks,
    target_repeat_rate: settings.target_repeat_rate,
  };

  // 2. Upsert clinic_settings
  // tenant-isolation-ignore: clinic_settings は id 自体が clinic_id。upsert body の id: clinicId で特定
  const { error: settingsError } = await supabase
    .from("clinic_settings")
    .upsert({
      id: clinicId,
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
      clinic_id: clinicId,
      month: monthStr,
      ...targetData,
    }, { onConflict: 'clinic_id,month' });

  if (targetError) {
    console.error("Failed to update clinic_targets. Error details:", JSON.stringify(targetError, null, 2));
    return { success: false, error: "経営目標の更新に失敗しました: " + targetError.message };
  }

  // DB Reflection Log as requested
  const { data: reflectSettings } = await supabase.from("clinic_settings").select("*").eq("id", clinicId).single();
  const { data: reflectTargets } = await supabase.from("clinic_targets").select("*").eq("clinic_id", clinicId).eq("month", monthStr).single();
  console.log("DB Reflect - Settings:", reflectSettings);
  console.log("DB Reflect - Targets:", reflectTargets);

  // ── 監査ログ（owner 自身の操作も記録） ──
  await writeAudit({
    clinicId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    actionType: "settings.update",
    targetTable: "clinic_settings",
    targetId: clinicId,
    after: settings,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/evaluation");
  revalidatePath("/admin", "layout");

  return { success: true };
}

// --- 公開用クリニック情報（認証不要） ---

export type PublicClinicHours = {
  hours_lines: string[] | null;
  hours_closed: string | null;
};

export async function getPublicClinicHours(): Promise<PublicClinicHours> {
  noStore();
  const clinicId = process.env.NEXT_PUBLIC_CLINIC_ID;
  if (!clinicId) return { hours_lines: null, hours_closed: null };

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data } = await supabase
    .from("clinic_settings")
    .select("hours_lines, hours_closed")
    .eq("id", clinicId)
    .maybeSingle();

  return {
    hours_lines: data?.hours_lines ?? null,
    hours_closed: data?.hours_closed ?? null,
  };
}

// --- カスタム経費カテゴリ ---

export async function getCustomExpenseCategories(): Promise<string[]> {
  const { clinicId } = await checkAdminAuth();
  noStore();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data } = await supabase
    .from("clinic_settings")
    .select("custom_expense_categories")
    .eq("id", clinicId)
    .maybeSingle();

  return data?.custom_expense_categories ?? [];
}

export async function addCustomExpenseCategory(name: string): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  name = name.trim();
  if (!name) return { success: false, error: "カテゴリ名を入力してください" };

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  // 既存カテゴリ取得して重複チェック
  const { data } = await supabase
    .from("clinic_settings")
    .select("custom_expense_categories")
    .eq("id", clinicId)
    .maybeSingle();

  const current: string[] = data?.custom_expense_categories ?? [];
  if (current.includes(name)) return { success: false, error: "すでに同じカテゴリが存在します" };

  const { error } = await supabase
    .from("clinic_settings")
    .update({ custom_expense_categories: [...current, name] })
    .eq("id", clinicId);

  if (error) return { success: false, error: "保存に失敗しました: " + error.message };

  revalidatePath("/admin/expenses");
  revalidatePath("/admin/expenses/triage");
  return { success: true };
}

export async function deleteCustomExpenseCategory(name: string): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data } = await supabase
    .from("clinic_settings")
    .select("custom_expense_categories")
    .eq("id", clinicId)
    .maybeSingle();

  const current: string[] = data?.custom_expense_categories ?? [];
  const updated = current.filter(c => c !== name);

  const { error } = await supabase
    .from("clinic_settings")
    .update({ custom_expense_categories: updated })
    .eq("id", clinicId);

  if (error) return { success: false, error: "削除に失敗しました: " + error.message };

  revalidatePath("/admin/expenses");
  revalidatePath("/admin/expenses/triage");
  return { success: true };
}

// --- 子ども医療費助成ルール ---
// custom_expense_categories と同じく、専用カラムを直接 update する。
// （updateClinicSettings の settingsData 列挙には載せない＝二重列挙バグを回避）

import {
  DEFAULT_MEDICAL_AID_RULES,
  type MedicalAidRules,
} from "@/lib/medical-aid";

export type MedicalAidRulesState = {
  rules: MedicalAidRules;
  isDefault: boolean;       // まだ院独自設定が無く、徳島デフォルトを表示しているか
  reviewedAt: string | null; // 最終見直し日（YYYY-MM-DD）
};

export async function getMedicalAidRules(): Promise<MedicalAidRulesState> {
  const { clinicId } = await checkAdminAuth();
  noStore();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data } = await supabase
    .from("clinic_settings")
    .select("medical_aid_rules, medical_aid_reviewed_at")
    .eq("id", clinicId)
    .maybeSingle();

  const stored = data?.medical_aid_rules as MedicalAidRules | null | undefined;
  const hasCities = !!stored && Array.isArray(stored.cities) && stored.cities.length > 0;
  return {
    rules: hasCities ? (stored as MedicalAidRules) : DEFAULT_MEDICAL_AID_RULES,
    isDefault: !hasCities,
    reviewedAt: (data?.medical_aid_reviewed_at as string | null) ?? null,
  };
}

export async function updateMedicalAidRules(
  rules: MedicalAidRules,
): Promise<{ success: boolean; error?: string }> {
  // 売上・会計に直結する設定のため owner 専用。
  const auth = await checkAdminAuth();
  const { clinicId } = auth;
  if (auth.role !== "owner") {
    return { success: false, error: "この設定はオーナーのみ変更できます" };
  }

  // 軽いバリデーション（自己負担は 0 以上の整数のみ）
  if (!rules || !Array.isArray(rules.cities)) {
    return { success: false, error: "ルール形式が不正です" };
  }
  for (const c of rules.cities) {
    if (!c.city?.trim()) return { success: false, error: "市町村名が空の行があります" };
    for (const v of Object.values(c.burdens ?? {})) {
      if (typeof v === "number" && (v < 0 || !Number.isFinite(v))) {
        return { success: false, error: `${c.city} の自己負担額が不正です` };
      }
    }
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const today = new Date();
  const reviewedAt = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const { error } = await supabase
    .from("clinic_settings")
    .update({ medical_aid_rules: rules, medical_aid_reviewed_at: reviewedAt })
    .eq("id", clinicId);

  if (error) return { success: false, error: "保存に失敗しました: " + error.message };

  await writeAudit({
    clinicId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    actionType: "settings.update",
    targetTable: "clinic_settings",
    targetId: clinicId,
    after: { medical_aid_rules: rules },
  });

  revalidatePath("/admin/settings");
  return { success: true };
}

// 年度替わりに「医療費助成の見直し」を促すべきか判定する（AI秘書用）。
// 現在の年度（4月始まり）に一度も見直していなければ true。
export async function getMedicalAidReviewReminder(): Promise<{
  needsReview: boolean;
  fiscalYear: number;
  reviewedAt: string | null;
}> {
  const { reviewedAt } = await getMedicalAidRules();
  const now = new Date();
  const fiscalYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  const fyStart = new Date(fiscalYear, 3, 1); // 当年度の4/1
  const reviewed = reviewedAt ? new Date(reviewedAt) : null;
  const needsReview = !reviewed || reviewed.getTime() < fyStart.getTime();
  return { needsReview, fiscalYear, reviewedAt };
}

// AI秘書のリマインドから「確認した」を押したときに見直し日だけ更新する。
export async function markMedicalAidReviewed(): Promise<{ success: boolean }> {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const today = new Date();
  const reviewedAt = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const { error } = await supabase
    .from("clinic_settings")
    .update({ medical_aid_reviewed_at: reviewedAt })
    .eq("id", clinicId);
  revalidatePath("/admin/dashboard");
  return { success: !error };
}
