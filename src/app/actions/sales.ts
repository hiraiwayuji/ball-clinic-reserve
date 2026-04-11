"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/app/actions/auth";
import { revalidatePath } from "next/cache";

async function getSupabase() {
  return await createClient();
}


// --- Cash Sales Actions ---

export async function addCashSale(formData: FormData) {
  const { clinicId } = await checkAdminAuth();
  try {
    const saleDate = formData.get("sale_date") as string;
    const customerName = formData.get("customer_name") as string;
    const treatmentFee = parseInt(formData.get("treatment_fee") as string, 10);
    const memo = formData.get("memo") as string || "";
    const isFirstVisit = formData.get("is_first_visit") === "true";

    if (!saleDate || !customerName || isNaN(treatmentFee)) {
      return { success: false, error: "必須項目を入力してください" };
    }

    const supabase = await getSupabase();
    const saleData: any = {
      sale_date: saleDate,
      customer_name: customerName,
      treatment_fee: treatmentFee,
      memo,
      is_first_visit: isFirstVisit,
      clinic_id: clinicId
    };

    const { error } = await supabase
      .from("cash_sales")
      .insert([saleData]);

    if (error) throw error;

    revalidatePath("/admin/sales");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error adding cash sale:", error);
    return { success: false, error: "保存に失敗しました" };
  }
}

export async function getCashSales(dateStr: string) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    // Migration完了につき clinic_id フィルタを有効化
    let query = supabase
      .from("cash_sales")
      .select("*")
      .eq("sale_date", dateStr)
      .eq("clinic_id", clinicId);

    const { data, error } = await query
      .order("created_at", { ascending: true });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error fetching cash sales:", error);
    return { success: false, error: "取得に失敗しました", data: [] };
  }
}

export async function deleteCashSale(id: string) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("cash_sales")
      .delete()
      .eq("id", id);

    if (error) throw error;

    revalidatePath("/admin/sales");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error deleting cash sale:", error);
    return { success: false, error: "削除に失敗しました" };
  }
}

// --- Insurance Payment Actions ---

export async function addInsurancePayment(formData: FormData) {
  const { clinicId } = await checkAdminAuth();
  try {
    const paymentMonth = formData.get("payment_month") as string; // "YYYY-MM-01"
    const insuranceName = formData.get("insurance_name") as string;
    const amount = parseInt(formData.get("amount") as string, 10);
    const paymentDate = (formData.get("payment_date") as string) || null;
    const imageUrl = (formData.get("image_url") as string) || null;
    const notes = (formData.get("notes") as string) || null;

    if (!paymentMonth || !insuranceName || isNaN(amount)) {
      return { success: false, error: "必須項目を入力してください" };
    }

    const supabase = await getSupabase();
    const { error } = await supabase
      .from("insurance_payments")
      .insert([{
        payment_month: paymentMonth,
        insurance_name: insuranceName,
        amount,
        payment_date: paymentDate,
        image_url: imageUrl,
        notes,
        clinic_id: clinicId
      }]);

    if (error) throw error;

    revalidatePath("/admin/insurance");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error adding insurance payment:", error);
    return { success: false, error: "保存に失敗しました" };
  }
}

export async function getInsurancePayments(monthStr: string) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("insurance_payments")
      .select("*")
      .eq("payment_month", monthStr)
      .eq("clinic_id", clinicId)
      .order("payment_date", { ascending: true });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error fetching insurance payments:", error);
    return { success: false, error: "取得に失敗しました", data: [] };
  }
}

export async function updateInsurancePayment(id: string, data: {
  insurance_name: string;
  amount: number;
  payment_date: string | null;
  notes: string | null;
}) {
  await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("insurance_payments")
      .update({
        insurance_name: data.insurance_name,
        amount: data.amount,
        payment_date: data.payment_date || null,
        notes: data.notes || null,
      })
      .eq("id", id);

    if (error) throw error;
    revalidatePath("/admin/insurance");
    return { success: true };
  } catch (error) {
    console.error("Error updating insurance payment:", error);
    return { success: false, error: "更新に失敗しました" };
  }
}

export async function updateInsurancePassbookCheck(id: string, checked: boolean) {
  await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("insurance_payments")
      .update({ passbook_checked: checked })
      .eq("id", id);

    if (error) throw error;
    revalidatePath("/admin/insurance");
    return { success: true };
  } catch (error) {
    console.error("Error updating passbook check:", error);
    return { success: false, error: "更新に失敗しました" };
  }
}

export async function deleteInsurancePayment(id: string) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("insurance_payments")
      .delete()
      .eq("id", id);

    if (error) throw error;

    revalidatePath("/admin/insurance");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error deleting insurance payment:", error);
    return { success: false, error: "削除に失敗しました" };
  }
}

// --- Revenue Statistics ---

export async function getMonthlyTotalRevenue(year: number, month: number) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
    const startOfMonth = `${monthStr}-01`;
    const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

    // Get Cash Sales
    const { data: cashData, error: cashErr } = await supabase
      .from("cash_sales")
      .select("treatment_fee")
      .eq("clinic_id", clinicId)
      .gte("sale_date", startOfMonth)
      .lte("sale_date", endOfMonth);

    if (cashErr) throw cashErr;

    // Get Insurance Payments
    const { data: insuranceData, error: insErr } = await supabase
      .from("insurance_payments")
      .select("amount")
      .eq("clinic_id", clinicId)
      .eq("payment_month", startOfMonth);

    if (insErr) throw insErr;

    const cashTotal = (cashData || []).reduce((sum, item) => sum + item.treatment_fee, 0);
    const insuranceTotal = (insuranceData || []).reduce((sum, item) => sum + item.amount, 0);

    return {
      success: true,
      data: {
        cash: cashTotal,
        insurance: insuranceTotal,
        total: cashTotal + insuranceTotal
      }
    };
  } catch (error) {
    console.error("Error calculating monthly revenue:", error);
    return { success: false, error: "計算に失敗しました", data: { cash: 0, insurance: 0, total: 0 } };
  }
}

export async function getDailySalesSummary(dateStr: string) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("cash_sales")
      .select("treatment_fee")
      .eq("clinic_id", clinicId)
      .eq("sale_date", dateStr);

    if (error) throw error;
    const total = (data || []).reduce((sum, item) => sum + item.treatment_fee, 0);
    return { success: true, total };
  } catch (error) {
    return { success: false, total: 0 };
  }
}

// --- Expense Actions ---

export async function addExpense(formData: FormData) {
  const { clinicId } = await checkAdminAuth();
  try {
    const expenseDate = formData.get("expense_date") as string;
    const category = formData.get("category") as string;
    const description = formData.get("description") as string || "";
    const amount = parseInt(formData.get("amount") as string, 10);
    const memo = formData.get("memo") as string || "";
    const imageUrl = formData.get("image_url") as string || "";

    if (!expenseDate || !category || isNaN(amount)) {
      return { success: false, error: "必須項目を入力してください" };
    }

    const supabase = await getSupabase();
    const { error } = await supabase
      .from("clinic_expenses")
      .insert([{ 
        expense_date: expenseDate, 
        category, 
        description, 
        amount, 
        memo,
        image_url: imageUrl,
        clinic_id: clinicId
      }]);

    if (error) throw error;

    revalidatePath("/admin/expenses");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error adding expense:", error);
    return { success: false, error: "保存に失敗しました" };
  }
}

export async function getExpenses(dateStr: string) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("clinic_expenses")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("expense_date", dateStr)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error fetching expenses:", error);
    return { success: false, error: "取得に失敗しました", data: [] };
  }
}

export async function getMonthDetailedExpenses(year: number, month: number) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
    const startOfMonth = `${monthStr}-01`;
    const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

    const { data, error } = await supabase
      .from("clinic_expenses")
      .select("*")
      .eq("clinic_id", clinicId)
      .gte("expense_date", startOfMonth)
      .lte("expense_date", endOfMonth)
      .order("expense_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error fetching monthly detailed expenses:", error);
    return { success: false, error: "取得に失敗しました", data: [] };
  }
}

export async function updateExpense(id: string, data: {
  expense_date?: string;
  category?: string;
  description?: string;
  amount?: number;
  memo?: string;
}) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("clinic_expenses")
      .update(data)
      .eq("id", id)
      .eq("clinic_id", clinicId);

    if (error) throw error;

    revalidatePath("/admin/expenses");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error updating expense:", error);
    return { success: false, error: "更新に失敗しました" };
  }
}

export async function deleteExpense(id: string) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("clinic_expenses")
      .delete()
      .eq("id", id);

    if (error) throw error;

    revalidatePath("/admin/expenses");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error deleting expense:", error);
    return { success: false, error: "削除に失敗しました" };
  }
}

export async function getMonthlyExpenses(year: number, month: number) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
    const startOfMonth = `${monthStr}-01`;
    const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

    const { data, error } = await supabase
      .from("clinic_expenses")
      .select("amount, category")
      .eq("clinic_id", clinicId)
      .gte("expense_date", startOfMonth)
      .lte("expense_date", endOfMonth);

    if (error) throw error;
    const total = (data || []).reduce((sum, item) => sum + item.amount, 0);
    const byCategory: Record<string, number> = {};
    (data || []).forEach(item => {
      byCategory[item.category] = (byCategory[item.category] || 0) + item.amount;
    });

    return { success: true, data: { total, byCategory } };
  } catch (error) {
    console.error("Error calculating monthly expenses:", error);
    return { success: false, data: { total: 0, byCategory: {} } };
  }
}

// --- Business Context for AI Chat ---

export async function getBusinessContext() {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const now = new Date();
    const jstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const dateStr = jstNow.toISOString().split('T')[0];
    const year = jstNow.getUTCFullYear();
    const month = jstNow.getUTCMonth() + 1;
    const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
    const startOfMonth = `${monthStr}-01`;
    const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

    // 1. Monthly Revenue
    const revenueRes = await getMonthlyTotalRevenue(year, month);

    // 2. Monthly Expenses
    const expenseRes = await getMonthlyExpenses(year, month);

    // 3. Today's Sales
    const todaySales = await getDailySalesSummary(dateStr);

    // 4. Today's Appointments
    const startOfDay = `${dateStr}T00:00:00+09:00`;
    const endOfDay = `${dateStr}T23:59:59+09:00`;
    let todayAppts: any[] = [];
    try {
      const { data } = await supabase
        .from("appointments")
        .select("id, start_time, status, is_first_visit, customers(name)")
        .eq("clinic_id", clinicId)
        .gte("start_time", startOfDay)
        .lte("start_time", endOfDay)
        .neq("status", "cancelled");
      todayAppts = data || [];
    } catch (e) {
      console.error("[AI_CONTEXT_LOG] Error fetching today's appointments:", e);
    }

    // 5. This month's total appointments
    let monthAppts: any[] = [];
    try {
      const { data } = await supabase
        .from("appointments")
        .select("id, is_first_visit")
        .eq("clinic_id", clinicId)
        .gte("start_time", `${startOfMonth}T00:00:00+09:00`)
        .lte("start_time", `${endOfMonth}T23:59:59+09:00`)
        .neq("status", "cancelled");
      monthAppts = data || [];
    } catch (e) {
      console.error("[AI_CONTEXT_LOG] Error fetching month's appointments:", e);
    }

    // 6. Monthly Target
    let targetData: any = null;
    try {
      const { data } = await supabase
        .from("clinic_targets")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("month", startOfMonth)
        .maybeSingle();
      targetData = data;
    } catch (e) {
      console.error("[AI_CONTEXT_LOG] Error fetching target:", e);
    }

    // 7. Total customers
    let totalCustomers = 0;
    try {
      const { count } = await supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId);
      totalCustomers = count || 0;
    } catch (e) {
      console.error("[AI_CONTEXT_LOG] Error fetching customers count:", e);
    }

    const targetIncome = targetData?.target_income || 1500000;
    const monthlyRevenue = revenueRes.data?.total || 0;
    const monthlyExpense = expenseRes.data?.total || 0;
    const daysInMonth = new Date(year, month, 0).getDate();
    const dayOfMonth = jstNow.getUTCDate();
    const remainingDays = daysInMonth - dayOfMonth;
    const monthlyProfit = monthlyRevenue - monthlyExpense;

    return {
      success: true,
      context: `
【本日の日付】${dateStr}（${month}月${dayOfMonth}日）

【今月の売上目標】¥${targetIncome.toLocaleString()}
【今月の売上実績（自費+保険）】¥${monthlyRevenue.toLocaleString()}（達成率: ${Math.round((monthlyRevenue / targetIncome) * 100)}%）
  - 自費売上: ¥${(revenueRes.data?.cash || 0).toLocaleString()}
  - 保険入金: ¥${(revenueRes.data?.insurance || 0).toLocaleString()}
【目標までの不足額】¥${Math.max(0, targetIncome - monthlyRevenue).toLocaleString()}
【残り日数】${remainingDays}日（1日あたり必要額: ¥${remainingDays > 0 ? Math.ceil(Math.max(0, targetIncome - monthlyRevenue) / remainingDays).toLocaleString() : '---'}）

【今月の経費合計】¥${monthlyExpense.toLocaleString()}
【今月の利益（売上-経費）】¥${monthlyProfit.toLocaleString()}
${Object.entries(expenseRes.data?.byCategory || {}).map(([cat, amt]) => `  - ${cat}: ¥${(amt as number).toLocaleString()}`).join('\n')}

【本日の予約数】${todayAppts.length}件
  - 初診: ${todayAppts.filter(a => a.is_first_visit).length}件
  - 再診: ${todayAppts.filter(a => !a.is_first_visit).length}件
【本日の売上】¥${(todaySales.total || 0).toLocaleString()}

【今月の延べ来院数】${monthAppts.length}件
  - 新規: ${monthAppts.filter(a => a.is_first_visit).length}件
  - 再診: ${monthAppts.filter(a => !a.is_first_visit).length}件
【登録患者総数】${totalCustomers}名
`.trim()
    };
  } catch (error) {
    console.error("Error gathering business context:", error);
    return { success: false, context: "ビジネスデータの取得に失敗しました。" };
  }
}

export async function getTodayDashboardData() {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    // Get JST today
    const now = new Date();
    const jstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const dateStr = jstNow.toISOString().split('T')[0];
    const year = jstNow.getUTCFullYear();
    const month = jstNow.getUTCMonth() + 1;

    console.log(`[DASHBOARD_LOG] Fetching data for ${dateStr}`);

    // 1. Monthly Revenue
    let revenueRes;
    try {
      revenueRes = await getMonthlyTotalRevenue(year, month);
    } catch (e) {
      console.error("[DASHBOARD_LOG] Error in getMonthlyTotalRevenue:", e);
      revenueRes = { success: false, data: { cash: 0, insurance: 0, total: 0 } };
    }
    
    // 2. Today's Cash Sales
    let todaySales;
    try {
      todaySales = await getDailySalesSummary(dateStr);
    } catch (e) {
      console.error("[DASHBOARD_LOG] Error in getDailySalesSummary:", e);
      todaySales = { success: false, total: 0 };
    }

    // 3. Today's Appointments (Detailed)
    const startOfDay = `${dateStr}T00:00:00+09:00`;
    const endOfDay = `${dateStr}T23:59:59+09:00`;

    let appointments: any[] = [];
    try {
      const { data, error: aptErr } = await supabase
        .from("appointments")
        .select(`
          id,
          start_time,
          status,
          is_first_visit,
          customer_id,
          customers (
            name,
            phone
          )
        `)
        .eq("clinic_id", clinicId)
        .gte("start_time", startOfDay)
        .lte("start_time", endOfDay)
        .neq("status", "cancelled")
        .order("start_time", { ascending: true });
      
      if (aptErr) throw aptErr;
      appointments = data || [];
    } catch (e) {
      console.error("[DASHBOARD_LOG] Error fetching appointments:", e);
    }

    // 4. Monthly Target
    let targetIncome = 1500000;
    let targetSnsTasks = 0;
    try {
      const { data: target } = await supabase
        .from("clinic_targets")
        .select("target_income, target_sns_tasks")
        .eq("clinic_id", clinicId)
        .eq("month", `${year}-${month.toString().padStart(2, '0')}-01`)
        .maybeSingle();
      if (target?.target_income) targetIncome = target.target_income;
      if (target?.target_sns_tasks) targetSnsTasks = target.target_sns_tasks;
    } catch (e) {
      console.error("[DASHBOARD_LOG] Error fetching target:", e);
    }

    // 4b. Monthly SNS Tasks (completed this month)
    let monthlySnsDone = 0;
    try {
      const firstDay = `${year}-${month.toString().padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const lastDayStr = `${year}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
      const { data: snsDone } = await supabase
        .from("daily_tasks")
        .select("id", { count: "exact" })
        .gte("task_date", firstDay)
        .lte("task_date", lastDayStr)
        .eq("status", "completed");
      monthlySnsDone = snsDone?.length ?? 0;
    } catch (e) {
      console.error("[DASHBOARD_LOG] Error fetching SNS tasks:", e);
    }

    // 5. Monthly Expenses
    let monthlyExpenses = 0;
    try {
      const expenseRes = await getMonthlyExpenses(year, month);
      monthlyExpenses = expenseRes.data?.total || 0;
    } catch (e) {
      console.error("[DASHBOARD_LOG] Error fetching expenses:", e);
    }

    // 6. AI Suggestions from Monthly Evaluations
    let aiSuggestions = null;
    try {
      const { data: evalData } = await supabase
        .from("monthly_evaluations")
        .select("ai_suggestions")
        .eq("clinic_id", clinicId)
        .eq("month", `${year}-${month.toString().padStart(2, '0')}-01`)
        .maybeSingle();
      aiSuggestions = evalData?.ai_suggestions || null;
    } catch (e) {
      console.error("[DASHBOARD_LOG] Error fetching evaluations:", e);
    }

    // 7. Daily tasks
    let dailyTasks = [];
    try {
      const { data } = await supabase
        .from("daily_tasks")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("task_date", dateStr)
        .order("created_at", { ascending: true });
      dailyTasks = data || [];
    } catch (e) {
      console.error("[DASHBOARD_LOG] Error fetching tasks:", e);
    }

    return {
      success: true,
      data: {
        dateStr,
        monthlyRevenue: revenueRes.data,
        monthlyExpenses,
        todaySales: todaySales.total,
        appointments: appointments.map((a: any) => ({
          time: new Date(a.start_time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }),
          name: (a.customers as any)?.name || "不明",
          phone: (a.customers as any)?.phone || "",
          customer_id: a.customer_id || null,
          type: a.is_first_visit ? "初診" : "再診",
          status: a.status
        })),
        targetIncome,
        targetSnsTasks,
        monthlySnsDone,
        aiSuggestions,
        dailyTasks
      }
    };
  } catch (error) {
    console.error("[DASHBOARD_LOG] Critical Dashboard data fetch error:", error);
    return { success: false, error: "ダッシュボードデータの取得中に深刻なエラーが発生しました。" };
  }
}

// --- Cash Sales Bulk Import ---

export interface ImportCashSaleRow {
  sale_date: string;
  customer_name: string;
  treatment_fee: number;
  memo?: string | null;
  is_first_visit?: boolean;
}

export async function bulkImportCashSales(rows: ImportCashSaleRow[]): Promise<{
  success: boolean;
  inserted: number;
  skipped: number;
  errors: { row: number; name: string; reason: string }[];
}> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await getSupabase();

  let inserted = 0;
  let skipped = 0;
  const errors: { row: number; name: string; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed, header is row 1

    // バリデーション
    if (!row.sale_date) {
      errors.push({ row: rowNum, name: row.customer_name, reason: "日付が未入力です" });
      skipped++;
      continue;
    }
    if (!row.customer_name) {
      errors.push({ row: rowNum, name: "（空欄）", reason: "お名前が未入力です" });
      skipped++;
      continue;
    }
    if (!row.treatment_fee || isNaN(row.treatment_fee) || row.treatment_fee <= 0) {
      errors.push({ row: rowNum, name: row.customer_name, reason: "金額が無効です" });
      skipped++;
      continue;
    }

    try {
      const { error } = await supabase.from("cash_sales").insert([{
        sale_date: row.sale_date,
        customer_name: row.customer_name,
        treatment_fee: row.treatment_fee,
        memo: row.memo || null,
        is_first_visit: row.is_first_visit ?? false,
        clinic_id: clinicId,
      }]);
      if (error) throw error;
      inserted++;
    } catch (e: any) {
      errors.push({ row: rowNum, name: row.customer_name, reason: e.message || "登録エラー" });
      skipped++;
    }
  }

  revalidatePath("/admin/sales");
  revalidatePath("/admin/dashboard");
  return { success: true, inserted, skipped, errors };
}

// --- Pending Expenses (Triage Flow) ---

export async function addPendingExpense(imageUrl: string | null, triageData: any = {}) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("pending_expenses")
      .insert([{
        image_url: imageUrl,
        status: 'unprocessed',
        ...triageData
      }])
      .select()
      .single();

    if (error) throw error;
    revalidatePath("/admin/expenses/triage");
    return { success: true, data };
  } catch (error) {
    console.error("Error adding pending expense:", error);
    return { success: false, error: "一時保存に失敗しました" };
  }
}

export async function getPendingExpenses(statusFilter?: string) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    let query = supabase.from("pending_expenses").select("*");
    
    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error fetching pending expenses:", error);
    return { success: false, error: "取得に失敗しました", data: [] };
  }
}

export async function updatePendingExpense(id: string, updates: any) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("pending_expenses")
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) throw error;
    revalidatePath("/admin/expenses/triage");
    return { success: true };
  } catch (error) {
    console.error("Error updating pending expense:", error);
    return { success: false, error: "更新に失敗しました" };
  }
}

export async function finalizePendingExpense(id: string, finalData: any) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    
    // 0. 元の保留データから画像URLを特定
    const { data: pending } = await supabase
      .from("pending_expenses")
      .select("image_url")
      .eq("id", id)
      .single();
    
    // finalDataに新しいURLがある場合はそちらを優先
    const imageUrl = finalData.image_url || pending?.image_url || "";

    // 1. Insert into formal clinic_expenses
    const { error: insertErr } = await supabase
      .from("clinic_expenses")
      .insert([{
        expense_date: finalData.expense_date,
        category: finalData.category,
        description: finalData.description,
        amount: finalData.amount,
        memo: finalData.memo,
        image_url: imageUrl,
        clinic_id: clinicId
      }]);

    if (insertErr) throw insertErr;

    // 2. Delete from pending_expenses
    const { error: deleteErr } = await supabase
      .from("pending_expenses")
      .delete()
      .eq("id", id);

    if (deleteErr) throw deleteErr;

    revalidatePath("/admin/expenses");
    revalidatePath("/admin/expenses/triage");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error finalizing expense:", error);
    return { success: false, error: "正式登録に失敗しました" };
  }
}
