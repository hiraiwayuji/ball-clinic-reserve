"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/app/actions/auth";
import { revalidatePath } from "next/cache";
import { getMonthlyTotalRevenue } from "./sales";
import { getSalesInputMode } from "./tally";

async function getSupabase() {
  return await createClient();
}

// ===== 来院数の内訳（保険・自費）集計 =====

export type VisitCategoryCount = { id: string; label: string; count: number };
export type VisitBreakdown = {
  grossVisits: number;   // 全体の来院数（のべ・記帳行ベース＝従来の来院数）
  totalVisits: number;   // 実来院数（患者×日で1来院）
  newVisits: number;     // 新規（初診）の来院
  hokenVisits: number;   // 保険を使った来院
  jihiVisits: number;    // 自費（実費）を使った来院
  bothVisits: number;    // 保険と自費を併用した来院
  byCategory: VisitCategoryCount[]; // 区分ごとの来院数（併用は各区分に計上）
};

// 表示順とラベル（全院共通の標準区分）
const VISIT_CATEGORY_ORDER = ["hoken", "jihi", "jibaiseki", "hagukumi", "kankeisha", "other"] as const;
const VISIT_CATEGORY_LABEL: Record<string, string> = {
  hoken: "保険",
  jihi: "自費（実費）",
  jibaiseki: "自賠責・労災",
  hagukumi: "医療助成",
  kankeisha: "関係者",
  other: "その他",
};

// cash_sales の支払区分キー → 標準区分へ正規化。
// 窓口日計表モードでは "tally:<列キー>" で保存され、保険列以外は基本的に自費（実費）。
function normalizeVisitCategory(rawKey: string, isTally: boolean): string {
  let key = (rawKey || "").trim();
  if (key.startsWith("tally:")) key = key.slice("tally:".length);
  if (key === "hoken") return "hoken";
  if (key === "jihi") return "jihi";
  if (key === "jibaiseki" || key === "rosai" || key === "jibai") return "jibaiseki";
  if (key === "hagukumi") return "hagukumi";
  if (key === "kankeisha") return "kankeisha";
  if (key === "other" || key === "") return "other";
  // 未知キー: 日計表の自費メニュー(鍼灸/整体/物販 等)は実費扱い、個別入力の独自区分はその他
  return isTally ? "jihi" : "other";
}

function buildVisitBreakdown(
  rows: Array<{ customer_name?: string | null; sale_date?: string | null; is_first_visit?: boolean | null; payment_type?: string | null; payment_types?: string[] | null }>,
  isTally: boolean,
): VisitBreakdown {
  // 患者名×日付で1来院にまとめる（日計表は1患者が複数行になるため）
  const groups = new Map<string, { buckets: Set<string>; isNew: boolean }>();
  for (const r of rows) {
    const name = String(r.customer_name ?? "").trim();
    if (!name) continue;
    const day = String(r.sale_date ?? "");
    const gk = `${day}__${name}`;
    const g = groups.get(gk) ?? { buckets: new Set<string>(), isNew: false };
    const keys: string[] = Array.isArray(r.payment_types) && r.payment_types.length
      ? r.payment_types
      : (r.payment_type ? [r.payment_type] : [""]);
    for (const k of keys) g.buckets.add(normalizeVisitCategory(String(k), isTally));
    if (r.is_first_visit) g.isNew = true;
    groups.set(gk, g);
  }

  const catCount = new Map<string, number>();
  let totalVisits = 0, newVisits = 0, hokenVisits = 0, jihiVisits = 0, bothVisits = 0;
  for (const g of groups.values()) {
    totalVisits++;
    if (g.isNew) newVisits++;
    const hasHoken = g.buckets.has("hoken");
    const hasJihi = g.buckets.has("jihi");
    if (hasHoken) hokenVisits++;
    if (hasJihi) jihiVisits++;
    if (hasHoken && hasJihi) bothVisits++;
    for (const b of g.buckets) catCount.set(b, (catCount.get(b) ?? 0) + 1);
  }

  const byCategory: VisitCategoryCount[] = VISIT_CATEGORY_ORDER
    .filter((id) => (catCount.get(id) ?? 0) > 0)
    .map((id) => ({ id, label: VISIT_CATEGORY_LABEL[id], count: catCount.get(id)! }));

  // 全体の来院数（のべ）は記帳行ベース（従来の来院数と同じ）
  const grossVisits = rows.length;

  return { grossVisits, totalVisits, newVisits, hokenVisits, jihiVisits, bothVisits, byCategory };
}

/**
 * Ensures a clinic_targets and monthly_evaluations record exists for the given month.
 * If not, creates them with default values.
 * Returns both records and the calculated actuals.
 */
export async function getMonthlyEvaluation(year: number, month: number) {
  const { clinicId } = await requireRole(["owner"]);
  try {
    const supabase = await getSupabase();
    const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
    const firstDayStr = `${monthStr}-01`;
    
    // 1. Get or create targets
    let { data: targets, error: targetErr } = await supabase
      .from("clinic_targets")
      .select("*")
      .eq("clinic_id", clinicId)
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
      .eq("clinic_id", clinicId)
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

    // 来院数・新患数は自費売上（cash_sales）から集計
    const lastDay = new Date(year, month, 0).getDate();
    const endDateStr = `${monthStr}-${lastDay.toString().padStart(2, '0')}`;

    const { data: allSales } = await supabase
      .from("cash_sales")
      .select("id, is_first_visit, customer_name, sale_date, payment_type, payment_types")
      .eq("clinic_id", clinicId)
      .gte("sale_date", firstDayStr)
      .lte("sale_date", endDateStr);

    // 売上記帳モード（窓口日計表は1患者→複数行になるため、患者×日でまとめる）
    const isTally = (await getSalesInputMode()) === "tally";
    const visitBreakdown = buildVisitBreakdown(allSales ?? [], isTally);
    // 「来院数」指標（と1日平均来院数）は従来どおり記帳ベースの「のべ来院数」を使用。
    // 「実来院数（患者×日）」は内訳カードで別表示する（数字を変えない）。
    const actualPatients = visitBreakdown.grossVisits;
    const actualNewPatients = allSales ? allSales.filter((s: any) => s.is_first_visit).length : 0;

    // Actual SNS Tasks (Count completed daily_tasks for the month)
    const { data: snsTasks } = await supabase
      .from("daily_tasks")
      .select("id")
      .eq("clinic_id", clinicId)
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
        actualNewPatients,
        visitBreakdown
      }
    };
  } catch (error) {
    console.error("Error getting monthly evaluation:", error);
    return { success: false, error: "データの取得に失敗しました。" };
  }
}

export async function saveEvaluationTargets(formData: FormData) {
  const { clinicId } = await requireRole(["owner"]);
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

// --- 明細データ取得・修正 ---

export type DailySaleRow = {
  id: string;
  sale_date: string;
  customer_name: string;
  treatment_fee: number;
  memo: string;
  is_first_visit?: boolean;
};

export type InsuranceRow = {
  id: string;
  payment_month: string;
  insurance_name: string;
  amount: number;
};

export type AppointmentRow = {
  id: string;
  start_time: string;
  customer_name: string;
  customer_id: string | null;
  is_first_visit: boolean;
  status: string;
};

export type MonthDetailedBreakdown = {
  cashSales: DailySaleRow[];
  insurancePayments: InsuranceRow[];
  appointments: AppointmentRow[];
  cashTotal: number;
  insuranceTotal: number;
};

export async function getMonthDetailedBreakdown(year: number, month: number): Promise<{ success: boolean; data?: MonthDetailedBreakdown; error?: string }> {
  const { clinicId } = await requireRole(["owner"]);
  try {
    const supabase = await getSupabase();
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const startDate = `${monthStr}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const endDate = `${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

    const [cashRes, insRes, apptRes] = await Promise.all([
      supabase
        .from("cash_sales")
        .select("id, sale_date, customer_name, treatment_fee, memo, is_first_visit")
        .eq("clinic_id", clinicId)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate)
        .order("sale_date", { ascending: true }),
      supabase
        .from("insurance_payments")
        .select("id, payment_month, insurance_name, amount")
        .eq("clinic_id", clinicId)
        .eq("payment_month", startDate)
        .order("insurance_name", { ascending: true }),
      supabase
        .from("appointments")
        .select("id, start_time, is_first_visit, status, customer_id, customers(name)")
        .eq("clinic_id", clinicId)
        .gte("start_time", `${startDate}T00:00:00+09:00`)
        .lte("start_time", `${endDate}T23:59:59+09:00`)
        .neq("status", "cancelled")
        .order("start_time", { ascending: true }),
    ]);

    const cashSales: DailySaleRow[] = (cashRes.data ?? []).map((r: any) => ({
      id: r.id,
      sale_date: r.sale_date,
      customer_name: r.customer_name,
      treatment_fee: r.treatment_fee,
      memo: r.memo ?? "",
      is_first_visit: r.is_first_visit ?? false,
    }));

    const insurancePayments: InsuranceRow[] = (insRes.data ?? []).map((r: any) => ({
      id: r.id,
      payment_month: r.payment_month,
      insurance_name: r.insurance_name,
      amount: r.amount,
    }));

    const appointments: AppointmentRow[] = (apptRes.data ?? []).map((r: any) => ({
      id: r.id,
      start_time: r.start_time,
      customer_name: (r.customers as any)?.name ?? "不明",
      customer_id: r.customer_id ?? null,
      is_first_visit: r.is_first_visit,
      status: r.status,
    }));

    return {
      success: true,
      data: {
        cashSales,
        insurancePayments,
        appointments,
        cashTotal: cashSales.reduce((s, r) => s + r.treatment_fee, 0),
        insuranceTotal: insurancePayments.reduce((s, r) => s + r.amount, 0),
      },
    };
  } catch (err) {
    console.error("getMonthDetailedBreakdown error:", err);
    return { success: false, error: "明細取得に失敗しました" };
  }
}

export async function updateCashSale(id: string, patch: { customer_name?: string; treatment_fee?: number; memo?: string; is_first_visit?: boolean }) {
  const { clinicId } = await requireRole(["owner"]);
  const supabase = await getSupabase();
  const { error } = await supabase.from("cash_sales").update(patch).eq("id", id).eq("clinic_id", clinicId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/evaluation");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function deleteCashSaleRecord(id: string) {
  const { clinicId } = await requireRole(["owner"]);
  const supabase = await getSupabase();
  const { error } = await supabase.from("cash_sales").delete().eq("id", id).eq("clinic_id", clinicId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/evaluation");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

// ===== 月次レポート出力用データ取得 =====

import type { MonthlyReportData } from "@/lib/monthly-report";

export async function getMonthlyReportData(
  year: number,
  month: number,
): Promise<{ success: boolean; data?: MonthlyReportData; error?: string }> {
  const { clinicId } = await requireRole(["owner"]);
  try {
    const supabase = await getSupabase();
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const startDate = `${monthStr}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const endDate = `${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

    // 並列でデータ取得
    const [evalRes, breakdownRes, settingsRes] = await Promise.all([
      getMonthlyEvaluation(year, month),
      getMonthDetailedBreakdown(year, month),
      // clinic_settings は id がclinic_id を兼ねる（clinic_id カラムは無い・name カラムも無い）
      supabase.from("clinic_settings").select("clinic_name").eq("id", clinicId).maybeSingle(),
    ]);

    if (!evalRes.success || !evalRes.data) return { success: false, error: evalRes.error };
    if (!breakdownRes.success || !breakdownRes.data) return { success: false, error: breakdownRes.error };

    const evalData = evalRes.data;
    const bd = breakdownRes.data;
    const clinicName = (settingsRes.data as any)?.clinic_name ?? "クリニック";

    const data: MonthlyReportData = {
      year,
      month,
      clinicName,
      summary: {
        targetIncome: evalData.targets?.target_income ?? 0,
        actualIncome: evalData.actualIncome,
        cashIncome: bd.cashTotal,
        insuranceIncome: bd.insuranceTotal,
        targetPatients: evalData.targets?.target_patients ?? 0,
        actualPatients: evalData.actualPatients,
        targetNewPatients: evalData.targets?.target_new_patients ?? 0,
        actualNewPatients: evalData.actualNewPatients,
        targetSnsTasks: evalData.targets?.target_sns_tasks ?? 0,
        actualSnsTasks: evalData.actualSnsTasks,
        googleReviewCount: evalData.evalData?.google_review_count ?? 0,
        googleRating: evalData.evalData?.google_rating ?? 0,
        selfEvaluation: evalData.evalData?.self_evaluation ?? "",
        aiSuggestions: evalData.evalData?.ai_suggestions ?? "",
      },
      cashSales: bd.cashSales.map(r => ({
        date: r.sale_date,
        name: r.customer_name,
        amount: r.treatment_fee,
        isFirstVisit: r.is_first_visit ?? false,
        memo: r.memo,
      })),
      insurancePayments: bd.insurancePayments.map(r => ({
        name: r.insurance_name,
        amount: r.amount,
      })),
      appointments: bd.appointments.map(r => {
        const dt = new Date(r.start_time);
        const jst = new Date(dt.getTime() + 9 * 60 * 60 * 1000);
        const dateStr = `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}(${["日","月","火","水","木","金","土"][jst.getUTCDay()]}) ${String(jst.getUTCHours()).padStart(2,"0")}:${String(jst.getUTCMinutes()).padStart(2,"0")}`;
        return {
          datetime: dateStr,
          name: r.customer_name,
          type: r.is_first_visit ? "初診" : "再診",
          status: r.status === "confirmed" ? "確定" : r.status === "pending" ? "確認待ち" : r.status,
        };
      }),
    };

    return { success: true, data };
  } catch (err) {
    console.error("getMonthlyReportData error:", err);
    return { success: false, error: "レポートデータの取得に失敗しました" };
  }
}

export async function toggleFirstVisit(id: string, isFirstVisit: boolean) {
  const { clinicId } = await requireRole(["owner"]);
  const supabase = await getSupabase();
  const { error } = await supabase.from("appointments").update({ is_first_visit: isFirstVisit }).eq("id", id).eq("clinic_id", clinicId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/evaluation");
  return { success: true };
}

export async function updateCustomerName(customerId: string, name: string) {
  const { clinicId } = await requireRole(["owner"]);
  const supabase = await getSupabase();
  const { error } = await supabase.from("customers").update({ name }).eq("id", customerId).eq("clinic_id", clinicId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/evaluation");
  return { success: true };
}

// Ensure the evaluation metric exists and set AI suggestion text.
// We call the generic /api/chat or Gemini API inside the client or a separate utility, 
// then save the text via this action.
export async function saveAiSuggestion(month: string, suggestionText: string) {
  const { clinicId } = await requireRole(["owner"]);
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
