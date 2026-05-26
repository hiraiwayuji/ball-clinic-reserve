"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/app/actions/auth";

// 「営業日」を判定: closed_weekdays（NULL なら "0,3"）に含まれず、かつ
// clinic_holidays に登録されていない日。1日平均来院数の分母に使う。
async function countOpenDaysInMonth(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
  year: number,
  month: number,
): Promise<{ openDays: number; isCurrentMonth: boolean; isFutureMonth: boolean }> {
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const isFutureMonth =
    year > today.getFullYear() ||
    (year === today.getFullYear() && month > today.getMonth() + 1);

  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const { data: settings } = await supabase
    .from("clinic_settings")
    .select("closed_weekdays")
    .eq("id", clinicId)
    .maybeSingle();
  const closedWeekdays = ((settings?.closed_weekdays as string | null) ?? "0,3")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));

  const { data: holidays } = await supabase
    .from("clinic_holidays")
    .select("date")
    .eq("clinic_id", clinicId)
    .gte("date", `${monthStr}-01`)
    .lte("date", `${monthStr}-${String(daysInMonth).padStart(2, "0")}`);
  const holidaySet = new Set((holidays ?? []).map((h: any) => h.date as string));

  // 現在月は「今日まで」、それ以外は月末日まで集計
  const upperDay = isCurrentMonth ? today.getDate() : daysInMonth;

  let openDays = 0;
  for (let d = 1; d <= upperDay; d++) {
    const dateObj = new Date(year, month - 1, d);
    const weekday = dateObj.getDay();
    const dateStr = `${monthStr}-${String(d).padStart(2, "0")}`;
    if (closedWeekdays.includes(weekday)) continue;
    if (holidaySet.has(dateStr)) continue;
    openDays++;
  }
  return { openDays, isCurrentMonth, isFutureMonth };
}

export type MonthAnalytics = {
  year: number;
  month: number;
  label: string;
  revenue: { cash: number; insurance: number; total: number };
  expenses: { total: number; byCategory: Record<string, number> };
  profit: number;
  visits: { total: number; newPatients: number; returning: number };
  avgSpend: number; // 客単価（自費売上 / 来院数）
  avgVisitsPerDay: number; // 1日あたりの平均来院数（分母は対象期間の暦日数。今月の場合は今日まで）
  daysCounted: number; // 平均計算に使った日数（参考表示用）
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
    avgVisitsPerDay: number;
    avgVisitsPerDayPct: number;
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
export type CustomerAnalytics = {
  gender: Record<string, number>;
  ageGroups: Record<string, number>;
  cities: Record<string, number>;
  sources: Record<string, number>;
  total: number;
};

// 来院者属性（当月予約に紐づく customer の属性集計）
export type VisitorDemographics = {
  year: number;
  month: number;
  label: string;
  totalVisits: number;
  uniqueVisitors: number;
  ageGroups: Record<string, number>; // unique customer ベース
  cities: Record<string, number>;    // unique customer ベース
  gender: Record<string, number>;
};

export type VisitorDemographicsComparison = {
  periodA: VisitorDemographics;
  periodB: VisitorDemographics;
  ageGroupsDiff: Record<string, { a: number; b: number; diff: number; pct: number }>;
  citiesDiff: Record<string, { a: number; b: number; diff: number; pct: number }>;
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

  // 平均来院数の分母は「営業日数」: closed_weekdays に含まれず、
  // clinic_holidays にも登録されていない日のみカウント。
  // 現在月は今日まで、過去月は月末日まで（途中月でも直感的な "1日平均"）。
  const { openDays } = await countOpenDaysInMonth(supabase, clinicId, year, month);
  const daysCounted = openDays;
  const avgVisitsPerDay =
    daysCounted > 0 ? Math.round((totalVisits / daysCounted) * 10) / 10 : 0;

  return {
    year,
    month,
    label: `${year}年${month}月`,
    revenue: { cash, insurance, total: totalRevenue },
    expenses: { total: expTotal, byCategory },
    profit: totalRevenue - expTotal,
    visits: { total: totalVisits, newPatients, returning: totalVisits - newPatients },
    avgSpend: cashVisits > 0 ? Math.round(cash / cashVisits) : 0,
    avgVisitsPerDay,
    daysCounted,
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
      avgVisitsPerDay: Math.round((periodA.avgVisitsPerDay - periodB.avgVisitsPerDay) * 10) / 10,
      avgVisitsPerDayPct: pct(
        Math.round(periodA.avgVisitsPerDay * 10),
        Math.round(periodB.avgVisitsPerDay * 10),
      ),
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

// 年齢を年代キーに変換（要望: 「どの年齢層多いとか」）
function ageGroupOf(age: number | null): string {
  if (age === null) return "不明";
  if (age < 20) return "20歳未満";
  if (age < 30) return "20代";
  if (age < 40) return "30代";
  if (age < 50) return "40代";
  if (age < 60) return "50代";
  if (age < 70) return "60代";
  if (age < 80) return "70代";
  return "80歳以上";
}

function calcAge(birthDateStr: string | null | undefined): number | null {
  if (!birthDateStr) return null;
  const birth = new Date(birthDateStr);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// 住所文字列から市町村名を推定（city_name 未入力時のフォールバック）
function extractCityFromAddress(addr: string | null | undefined): string | null {
  if (!addr) return null;
  // 「徳島県板野郡藍住町〜」のような形式から 市/区/町/村 までを取り出す
  const m = addr.match(/(?:[^\s　県府都道]+?[県府都道])?([^\s　市区町村]+?[市区町村])/);
  return m ? m[1] : null;
}

// 当月の予約に紐づく customer 属性集計（来院者ベース）
export async function getVisitorDemographics(
  year: number,
  month: number,
): Promise<VisitorDemographics> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const startDate = `${monthStr}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const endDate = `${monthStr}-${String(daysInMonth).padStart(2, "0")}`;
  const startTs = `${startDate}T00:00:00+09:00`;
  const endTs = `${endDate}T23:59:59+09:00`;

  const { data: apptRows } = await supabase
    .from("appointments")
    .select("customer_id")
    .eq("clinic_id", clinicId)
    .gte("start_time", startTs)
    .lte("start_time", endTs)
    .neq("status", "cancelled");

  const totalVisits = (apptRows ?? []).length;
  const customerIds = Array.from(
    new Set(
      (apptRows ?? [])
        .map((a: any) => a.customer_id)
        .filter((v: any): v is string => typeof v === "string" && !!v),
    ),
  );

  const result: VisitorDemographics = {
    year,
    month,
    label: `${year}年${month}月`,
    totalVisits,
    uniqueVisitors: customerIds.length,
    ageGroups: {},
    cities: {},
    gender: {},
  };

  if (customerIds.length === 0) return result;

  const { data: customers } = await supabase
    .from("customers")
    .select("id, gender, birth_date, city_name, address")
    .eq("clinic_id", clinicId)
    .in("id", customerIds);

  (customers ?? []).forEach((c: any) => {
    const age = calcAge(c.birth_date);
    const ageKey = ageGroupOf(age);
    result.ageGroups[ageKey] = (result.ageGroups[ageKey] ?? 0) + 1;

    const cityKey = c.city_name || extractCityFromAddress(c.address) || "不明";
    result.cities[cityKey] = (result.cities[cityKey] ?? 0) + 1;

    const g = c.gender || "不明";
    result.gender[g] = (result.gender[g] ?? 0) + 1;
  });

  return result;
}

function buildDiffMap(
  a: Record<string, number>,
  b: Record<string, number>,
): Record<string, { a: number; b: number; diff: number; pct: number }> {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: Record<string, { a: number; b: number; diff: number; pct: number }> = {};
  keys.forEach((k) => {
    const av = a[k] ?? 0;
    const bv = b[k] ?? 0;
    out[k] = { a: av, b: bv, diff: av - bv, pct: pct(av, bv) };
  });
  return out;
}

export async function getVisitorComparison(
  yearA: number,
  monthA: number,
  yearB: number,
  monthB: number,
): Promise<VisitorDemographicsComparison> {
  await checkAdminAuth();
  const [periodA, periodB] = await Promise.all([
    getVisitorDemographics(yearA, monthA),
    getVisitorDemographics(yearB, monthB),
  ]);
  return {
    periodA,
    periodB,
    ageGroupsDiff: buildDiffMap(periodA.ageGroups, periodB.ageGroups),
    citiesDiff: buildDiffMap(periodA.cities, periodB.cities),
  };
}

export async function getCustomerAnalytics(year: number, month: number): Promise<CustomerAnalytics> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const startDate = `${monthStr}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const endDate = `${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

  // Fetch customers created in this month
  const { data: customers } = await supabase
    .from("customers")
    .select("gender, birth_date, city_name, referral_source")
    .eq("clinic_id", clinicId)
    .gte("created_at", `${startDate}T00:00:00+09:00`)
    .lte("created_at", `${endDate}T23:59:59+09:00`);

  const results: CustomerAnalytics = {
    gender: {},
    ageGroups: { "20歳未満": 0, "20-30代": 0, "40-50代": 0, "60歳以上": 0, "不明": 0 },
    cities: {},
    sources: {},
    total: customers?.length || 0
  };

  (customers ?? []).forEach(c => {
    // Gender
    const g = c.gender || "不明";
    results.gender[g] = (results.gender[g] ?? 0) + 1;

    // City
    const city = c.city_name || "その他/不明";
    results.cities[city] = (results.cities[city] ?? 0) + 1;

    // Referral Source
    const src = c.referral_source || "その他/不明";
    results.sources[src] = (results.sources[src] ?? 0) + 1;

    // Age calculation
    if (c.birth_date) {
      const birth = new Date(c.birth_date);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;

      if (age < 20) results.ageGroups["20歳未満"]++;
      else if (age < 40) results.ageGroups["20-30代"]++;
      else if (age < 60) results.ageGroups["40-50代"]++;
      else results.ageGroups["60歳以上"]++;
    } else {
      results.ageGroups["不明"]++;
    }
  });

  return results;
}
