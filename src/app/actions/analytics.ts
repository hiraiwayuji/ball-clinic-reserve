"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/app/actions/auth";

export type MonthAnalytics = {
  year: number;
  month: number;
  label: string;
  revenue: { cash: number; insurance: number; total: number };
  expenses: { total: number; byCategory: Record<string, number> };
  profit: number;
  visits: { total: number; newPatients: number; returning: number };
  avgSpend: number; // 客単価（自費売上 / 来院数）
};

export type ComparisonResult = {
  periodA: MonthAnalytics;
  periodB: MonthAnalytics;
  diff: {
    revenueTotal: number;
    revenuePct: number;
    cash: number;
    cashPct: number;
    insurance: number;
    insurancePct: number;
    expenses: number;
    expensesPct: number;
    profit: number;
    profitPct: number;
    visits: number;
    visitsPct: number;
    newPatients: number;
    newPatientsPct: number;
    avgSpend: number;
    avgSpendPct: number;
  };
};

export type YearlyTrendPoint = {
  month: string; // "1月" etc.
  revenue: number;
  cash: number;
  insurance: number;
  expenses: number;
  profit: number;
  visits: number;
  newPatients: number;
};

function pct(a: number, b: number) {
  if (b === 0) return a > 0 ? 100 : 0;
  return Math.round(((a - b) / b) * 100);
}

export async function getMonthAnalytics(year: number, month: number): Promise<MonthAnalytics> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const startDate = `${monthStr}-01`;
  // toISOString()はUTC変換でずれるためgetDate()で日数を取得
  const daysInMonth = new Date(year, month, 0).getDate();
  const endDate = `${monthStr}-${String(daysInMonth).padStart(2, "0")}`;
  const startTs = `${startDate}T00:00:00+09:00`;
  const endTs = `${endDate}T23:59:59+09:00`;

  // 自費売上
  const { data: cashRows } = await supabase
    .from("cash_sales")
    .select("treatment_fee")
    .eq("clinic_id", clinicId)
    .gte("sale_date", startDate)
    .lte("sale_date", endDate);
  const cash = (cashRows ?? []).reduce((s, r) => s + r.treatment_fee, 0);

  // 保険入金
  const { data: insRows } = await supabase
    .from("insurance_payments")
    .select("amount")
    .eq("clinic_id", clinicId)
    .eq("payment_month", startDate);
  const insurance = (insRows ?? []).reduce((s, r) => s + r.amount, 0);

  // 経費（カテゴリ別）
  const { data: expRows } = await supabase
    .from("clinic_expenses")
    .select("amount, category")
    .eq("clinic_id", clinicId)
    .gte("expense_date", startDate)
    .lte("expense_date", endDate);
  const expTotal = (expRows ?? []).reduce((s, r) => s + r.amount, 0);
  const byCategory: Record<string, number> = {};
  (expRows ?? []).forEach((r) => {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + r.amount;
  });

  // 来院数（予約ベース）
  const { data: apptRows } = await supabase
    .from("appointments")
    .select("is_first_visit")
    .eq("clinic_id", clinicId)
    .gte("start_time", startTs)
    .lte("start_time", endTs)
    .neq("status", "cancelled");
  const visits = apptRows ?? [];
  const newPatients = visits.filter((a) => a.is_first_visit).length;

  const totalRevenue = cash + insurance;
  const totalVisits = visits.length;
  const cashVisits = (cashRows ?? []).length;

  return {
    year,
    month,
    label: `${year}年${month}月`,
    revenue: { cash, insurance, total: totalRevenue },
    expenses: { total: expTotal, byCategory },
    profit: totalRevenue - expTotal,
    visits: { total: totalVisits, newPatients, returning: totalVisits - newPatients },
    avgSpend: cashVisits > 0 ? Math.round(cash / cashVisits) : 0,
  };
}

export async function getComparisonData(
  yearA: number, monthA: number,
  yearB: number, monthB: number
): Promise<ComparisonResult> {
  await checkAdminAuth();
  const [periodA, periodB] = await Promise.all([
    getMonthAnalytics(yearA, monthA),
    getMonthAnalytics(yearB, monthB),
  ]);

  return {
    periodA,
    periodB,
    diff: {
      revenueTotal: periodA.revenue.total - periodB.revenue.total,
      revenuePct: pct(periodA.revenue.total, periodB.revenue.total),
      cash: periodA.revenue.cash - periodB.revenue.cash,
      cashPct: pct(periodA.revenue.cash, periodB.revenue.cash),
      insurance: periodA.revenue.insurance - periodB.revenue.insurance,
      insurancePct: pct(periodA.revenue.insurance, periodB.revenue.insurance),
      expenses: periodA.expenses.total - periodB.expenses.total,
      expensesPct: pct(periodA.expenses.total, periodB.expenses.total),
      profit: periodA.profit - periodB.profit,
      profitPct: pct(periodA.profit, periodB.profit),
      visits: periodA.visits.total - periodB.visits.total,
      visitsPct: pct(periodA.visits.total, periodB.visits.total),
      newPatients: periodA.visits.newPatients - periodB.visits.newPatients,
      newPatientsPct: pct(periodA.visits.newPatients, periodB.visits.newPatients),
      avgSpend: periodA.avgSpend - periodB.avgSpend,
      avgSpendPct: pct(periodA.avgSpend, periodB.avgSpend),
    },
  };
}

export async function getYearlyTrend(year: number): Promise<YearlyTrendPoint[]> {
  await checkAdminAuth();
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const results = await Promise.all(months.map((m) => getMonthAnalytics(year, m)));
  return results.map((r, i) => ({
    month: `${i + 1}月`,
    revenue: r.revenue.total,
    cash: r.revenue.cash,
    insurance: r.revenue.insurance,
    expenses: r.expenses.total,
    profit: r.profit,
    visits: r.visits.total,
    newPatients: r.visits.newPatients,
  }));
}

export async function getWeekdayBreakdown(year: number, month: number) {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const startDate = `${monthStr}-01`;
  const endDate = new Date(year, month, 0).toISOString().split("T")[0];

  const { data } = await supabase
    .from("appointments")
    .select("start_time")
    .eq("clinic_id", clinicId)
    .gte("start_time", `${startDate}T00:00:00+09:00`)
    .lte("start_time", `${endDate}T23:59:59+09:00`)
    .neq("status", "cancelled");

  const days = ["日", "月", "火", "水", "木", "金", "土"];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  (data ?? []).forEach((r) => {
    const d = new Date(r.start_time);
    // JST
    const jstDay = new Date(d.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
    counts[jstDay]++;
  });
  return days.map((day, i) => ({ day, count: counts[i] }));
}
