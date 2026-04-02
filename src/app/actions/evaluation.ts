"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/app/actions/auth";
import { revalidatePath } from "next/cache";
import { getMonthlyTotalRevenue } from "./sales";

async function getSupabase() {
  return await createClient();
}

/**
 * Ensures a clinic_targets and monthly_evaluations record exists for the given month.
 * If not, creates them with default values.
 * Returns both records and the calculated actuals.
 */
export async function getMonthlyEvaluation(year: number, month: number) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
    const firstDayStr = `${monthStr}-01`;
    
    // 1. Get or create targets
    let { data: targets, error: targetErr } = await supabase
      .from("clinic_targets")
      .select("*")
      .eq("month", firstDayStr)
      .maybeSingle();

    if (!targets && !targetErr) {
      const { data: newTargets, error: insertTargetErr } = await supabase
        .from("clinic_targets")
        .insert([{ 
          clinic_id: clinicId,
          month: firstDayStr, 
          target_patients: 200, 
          target_income: 1500000, 
          target_sns_tasks: 100, 
          target_new_patients: 20
        }])
        .select()
        .single();
      if (!insertTargetErr) targets = newTargets;
    }

    // 2. Get or create evaluations (manual metrics and AI text)
    let { data: evalData, error: evalErr } = await supabase
      .from("monthly_evaluations")
      .select("*")
      .eq("month", firstDayStr)
      .maybeSingle();

    if (!evalData && !evalErr) {
      const { data: newEval, error: insertEvalErr } = await supabase
        .from("monthly_evaluations")
        .insert([{ 
          clinic_id: clinicId,
          month: firstDayStr,
          google_review_count: 0,
          google_rating: 0,
          self_evaluation: ""
        }])
        .select()
        .single();
      if (!insertEvalErr) evalData = newEval;
    }

    // 3. Calculate actuals dynamically
    // Actual Income (Cash + Insurance)
    const revenueRes = await getMonthlyTotalRevenue(year, month);
    const actualIncome = revenueRes.success && revenueRes.data ? revenueRes.data.total : 0;

    // Actual Patients
    const startOfMonth = `${firstDayStr}T00:00:00+09:00`;
    const lastDay = new Date(year, month, 0).getDate();
    const endOfMonth = `${monthStr}-${lastDay.toString().padStart(2, '0')}T23:59:59+09:00`;

    const { data: appts } = await supabase
      .from("appointments")
      .select("id, is_first_visit")
      .gte("start_time", startOfMonth)
      .lte("start_time", endOfMonth)
      .neq("status", "cancelled");

    const actualPatients = appts ? appts.length : 0;
    const actualNewPatients = appts ? appts.filter((a) => a.is_first_visit).length : 0;

    // Actual SNS Tasks (Count completed daily_tasks for the month)
    const { data: snsTasks } = await supabase
      .from("daily_tasks")
      .select("id")
      .gte("task_date", `${firstDayStr}`)
      .lte("task_date", `${monthStr}-${lastDay.toString().padStart(2, '0')}`)
      .eq("status", "completed");
    
    const actualSnsTasks = snsTasks ? snsTasks.length : 0;

    // Calculate Scores (Min 0, Max 100)
    const calculateScore = (actual: number, target: number) => {
      if (target <= 0) return 0;
      return Math.min(100, Math.round((actual / target) * 100));
    };

    const metrics = [
      { name: "来院数", target: targets?.target_patients || 0, actual: actualPatients, unit: "人", score: calculateScore(actualPatients, targets?.target_patients || 0) },
      { name: "売上高", target: targets?.target_income || 0, actual: actualIncome, unit: "円", score: calculateScore(actualIncome, targets?.target_income || 0) },
      { name: "SNSタスク", target: targets?.target_sns_tasks || 0, actual: actualSnsTasks, unit: "件", score: calculateScore(actualSnsTasks, targets?.target_sns_tasks || 0) },
      { name: "新規患者数", target: targets?.target_new_patients || 0, actual: actualNewPatients, unit: "人", score: calculateScore(actualNewPatients, targets?.target_new_patients || 0) },
    ];

    return {
      success: true,
      data: {
        targets,
        evalData,
        metrics,
        actualIncome,
        actualPatients,
        actualSnsTasks,
        actualNewPatients
      }
    };
  } catch (error) {
    console.error("Error getting monthly evaluation:", error);
    return { success: false, error: "データの取得に失敗しました。" };
  }
}

export async function saveEvaluationTargets(formData: FormData) {
  const { clinicId } = await checkAdminAuth();
  try {
    const month = formData.get("month") as string; // "YYYY-MM-01"
    const targetPatients = parseInt(formData.get("target_patients") as string, 10);
    const targetIncome = parseInt(formData.get("target_income") as string, 10);
    const targetSnsTasks = parseInt(formData.get("target_sns_tasks") as string, 10);
    const targetNewPatients = parseInt(formData.get("target_new_patients") as string, 10);
    
    const googleReviewCount = parseInt(formData.get("google_review_count") as string, 10);
    const googleRating = parseFloat(formData.get("google_rating") as string);
    const selfEvaluation = formData.get("self_evaluation") as string || "";

    if (!month) return { success: false, error: "必須項目が不足しています" };

    const supabase = await getSupabase();

    // Upsert clinic_targets
    const { error: targetErr } = await supabase
      .from("clinic_targets")
      .upsert({
        clinic_id: clinicId,
        month,
        target_patients: isNaN(targetPatients) ? 0 : targetPatients,
        target_income: isNaN(targetIncome) ? 0 : targetIncome,
        target_sns_tasks: isNaN(targetSnsTasks) ? 0 : targetSnsTasks,
        target_new_patients: isNaN(targetNewPatients) ? 0 : targetNewPatients,
        updated_at: new Date().toISOString()
      }, { onConflict: 'clinic_id, month' });

    if (targetErr) throw targetErr;

    // Upsert monthly_evaluations
    const { error: evalErr } = await supabase
      .from("monthly_evaluations")
      .upsert({
        clinic_id: clinicId,
        month,
        google_review_count: isNaN(googleReviewCount) ? 0 : googleReviewCount,
        google_rating: isNaN(googleRating) ? 0 : googleRating,
        self_evaluation: selfEvaluation,
        updated_at: new Date().toISOString()
      }, { onConflict: 'clinic_id, month' });

    if (evalErr) throw evalErr;

    revalidatePath("/admin/evaluation");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error saving evaluation targets:", error);
    return { success: false, error: "保存に失敗しました" };
  }
}

// Ensure the evaluation metric exists and set AI suggestion text.
// We call the generic /api/chat or Gemini API inside the client or a separate utility, 
// then save the text via this action.
export async function saveAiSuggestion(month: string, suggestionText: string) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("monthly_evaluations")
      .upsert({
        clinic_id: clinicId,
        month,
        ai_suggestions: suggestionText,
        updated_at: new Date().toISOString()
      }, { onConflict: 'clinic_id, month' });

    if (error) throw error;
    revalidatePath("/admin/evaluation");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error saving AI suggestion:", error);
    return { success: false, error: "AI提案の保存に失敗しました" };
  }
}
