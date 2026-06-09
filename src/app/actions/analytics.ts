"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/app/actions/auth";
import { COURSE_CATEGORIES, type CourseCategory } from "@/lib/course-categories";

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
  revenue: { cash: number; insurance: number; other: number; total: number };
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

// スタッフごとの当月施術実績 / 目標 / 達成率（合計版・後方互換）
export type StaffTargetProgress = {
  staff_id: string;
  staff_name: string;
  monthly_visit_target: number | null;
  monthly_count: number;
  achievement_pct: number | null;  // 目標未設定なら null
};

// スタッフ × カテゴリ別の月間実績・目標・達成率
export type StaffCategoryProgress = {
  staff_id: string;
  staff_name: string;
  by_category: Record<CourseCategory, {
    count: number;
    target: number | null;
    pct: number | null;  // 目標未設定なら null
  }>;
  uncategorized_count: number;  // category=NULL のコース分（参考）
  total_count: number;          // 全カテゴリ合計（uncategorized 含む）
  total_target: number;         // 3 カテゴリの目標合計
};

export type CategoryProgressData = {
  monthLabel: string;
  rows: StaffCategoryProgress[];
  // 全員の合計（スプレッドシートの「全員の合計」行）
  totals: {
    by_category: Record<CourseCategory, { count: number; target: number }>;
    total_count: number;
    total_target: number;
  };
};

export async function getStaffCategoryProgress(): Promise<{
  success: boolean;
  data?: CategoryProgressData;
  error?: string;
}> {
  try {
    const { clinicId } = await checkAdminAuth();
    const supabase = await createClient();

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const startTs = `${monthStr}-01T00:00:00+09:00`;
    const lastDay = new Date(year, month, 0).getDate();
    const endTs = `${monthStr}-${String(lastDay).padStart(2, "0")}T23:59:59+09:00`;

    const [staffRes, courseRes, aptRes] = await Promise.all([
      supabase
        .from("reservation_staff")
        .select("id, name, target_jusei, target_shinkyu, target_seitai, sort_order")
        .eq("clinic_id", clinicId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("reservation_courses")
        .select("id, category")
        .eq("clinic_id", clinicId),
      supabase
        .from("appointments")
        .select("staff_id, course_id, additional_staff, additional_courses")
        .eq("clinic_id", clinicId)
        .neq("status", "cancelled")
        .gte("start_time", startTs)
        .lte("start_time", endTs),
    ]);

    if (staffRes.error) return { success: false, error: staffRes.error.message };
    if (courseRes.error) return { success: false, error: courseRes.error.message };
    if (aptRes.error) return { success: false, error: aptRes.error.message };

    // course_id → category マッピング
    const courseCategory = new Map<string, CourseCategory | null>();
    (courseRes.data ?? []).forEach((c: any) => {
      const cat = c.category as string | null;
      courseCategory.set(c.id, (cat === "jusei" || cat === "shinkyu" || cat === "seitai") ? cat : null);
    });

    // スタッフ ID → カテゴリ別件数
    const tally = new Map<string, {
      by: Record<CourseCategory, number>;
      uncat: number;
      total: number;
    }>();
    const ensure = (id: string) => {
      let t = tally.get(id);
      if (!t) {
        t = { by: { jusei: 0, shinkyu: 0, seitai: 0 }, uncat: 0, total: 0 };
        tally.set(id, t);
      }
      return t;
    };

    (aptRes.data ?? []).forEach((row: any) => {
      // 対象スタッフ集合（メイン + additional_staff）
      const staffIds = new Set<string>();
      if (row.staff_id) staffIds.add(row.staff_id);
      const addStaff = row.additional_staff;
      if (Array.isArray(addStaff)) {
        for (const s of addStaff) {
          if (s?.staff_id) staffIds.add(s.staff_id);
        }
      }
      // 対象コース集合（メイン + additional_courses）
      const courseIds = new Set<string>();
      if (row.course_id) courseIds.add(row.course_id);
      const addCourses = row.additional_courses;
      if (Array.isArray(addCourses)) {
        for (const c of addCourses) {
          if (c?.course_id) courseIds.add(c.course_id);
        }
      }
      // 各スタッフ × 各コースでカウント
      // （複数担当・複数コースの予約は、それぞれの組み合わせで +1。スプレッド
      //  シートの「件数」もメニュー数で集計するため、これで自然な数値になる）
      for (const sid of staffIds) {
        const t = ensure(sid);
        if (courseIds.size === 0) {
          // コース未指定はカウント不能 → uncategorized
          t.uncat += 1;
          t.total += 1;
        } else {
          for (const cid of courseIds) {
            const cat = courseCategory.get(cid) ?? null;
            if (cat) {
              t.by[cat] += 1;
            } else {
              t.uncat += 1;
            }
            t.total += 1;
          }
        }
      }
    });

    const rows: StaffCategoryProgress[] = (staffRes.data ?? []).map((s: any) => {
      const t = tally.get(s.id) ?? { by: { jusei: 0, shinkyu: 0, seitai: 0 }, uncat: 0, total: 0 };
      const tj = s.target_jusei ?? null;
      const ts = s.target_shinkyu ?? null;
      const ts2 = s.target_seitai ?? null;
      const totalTarget = (tj ?? 0) + (ts ?? 0) + (ts2 ?? 0);
      return {
        staff_id: s.id,
        staff_name: s.name,
        by_category: {
          jusei:   { count: t.by.jusei,   target: tj,  pct: tj  && tj  > 0 ? Math.round((t.by.jusei   / tj ) * 100) : null },
          shinkyu: { count: t.by.shinkyu, target: ts,  pct: ts  && ts  > 0 ? Math.round((t.by.shinkyu / ts ) * 100) : null },
          seitai:  { count: t.by.seitai,  target: ts2, pct: ts2 && ts2 > 0 ? Math.round((t.by.seitai  / ts2) * 100) : null },
        },
        uncategorized_count: t.uncat,
        total_count: t.total,
        total_target: totalTarget,
      };
    });

    // 全員の合計
    const totals: CategoryProgressData["totals"] = {
      by_category: {
        jusei:   { count: 0, target: 0 },
        shinkyu: { count: 0, target: 0 },
        seitai:  { count: 0, target: 0 },
      },
      total_count: 0,
      total_target: 0,
    };
    rows.forEach((r) => {
      for (const cat of COURSE_CATEGORIES) {
        totals.by_category[cat].count  += r.by_category[cat].count;
        totals.by_category[cat].target += r.by_category[cat].target ?? 0;
      }
      totals.total_count  += r.total_count;
      totals.total_target += r.total_target;
    });

    return {
      success: true,
      data: { monthLabel: `${month}月`, rows, totals },
    };
  } catch (error) {
    console.error("getStaffCategoryProgress error:", error);
    return { success: false, error: "取得に失敗しました" };
  }
}

export async function getStaffTargetsProgress(): Promise<{
  success: boolean;
  rows?: StaffTargetProgress[];
  monthLabel?: string;
  error?: string;
}> {
  try {
    const { clinicId } = await checkAdminAuth();
    const supabase = await createClient();

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const startTs = `${monthStr}-01T00:00:00+09:00`;
    const lastDay = new Date(year, month, 0).getDate();
    const endTs = `${monthStr}-${String(lastDay).padStart(2, "0")}T23:59:59+09:00`;

    const [staffRes, aptRes] = await Promise.all([
      supabase
        .from("reservation_staff")
        .select("id, name, monthly_visit_target, sort_order")
        .eq("clinic_id", clinicId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("appointments")
        .select("staff_id, additional_staff")
        .eq("clinic_id", clinicId)
        .neq("status", "cancelled")
        .gte("start_time", startTs)
        .lte("start_time", endTs),
    ]);

    if (staffRes.error) return { success: false, error: staffRes.error.message };
    if (aptRes.error) return { success: false, error: aptRes.error.message };

    // メイン担当 + 追加担当（additional_staff）で各スタッフに +1
    const counts: Record<string, number> = {};
    (aptRes.data ?? []).forEach((row: any) => {
      const ids = new Set<string>();
      if (row.staff_id) ids.add(row.staff_id);
      const add = row.additional_staff;
      if (Array.isArray(add)) {
        for (const s of add) {
          if (s?.staff_id) ids.add(s.staff_id);
        }
      }
      for (const id of ids) {
        counts[id] = (counts[id] ?? 0) + 1;
      }
    });

    const rows: StaffTargetProgress[] = (staffRes.data ?? []).map((s: any) => {
      const target = s.monthly_visit_target ?? null;
      const count = counts[s.id] ?? 0;
      const pct = target && target > 0 ? Math.round((count / target) * 100) : null;
      return {
        staff_id: s.id,
        staff_name: s.name,
        monthly_visit_target: target,
        monthly_count: count,
        achievement_pct: pct,
      };
    });

    return { success: true, rows, monthLabel: `${month}月` };
  } catch (error) {
    console.error("getStaffTargetsProgress error:", error);
    return { success: false, error: "取得に失敗しました" };
  }
}

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

  // 経費記帳（支出・収入）。entry_type で支出と収入を分けて集計する。
  // 収入（その他収入）は売上側へ、支出だけを経費合計に入れる。
  const { data: ledgerRows } = await supabase
    .from("clinic_expenses")
    .select("amount, category, entry_type")
    .eq("clinic_id", clinicId)
    .gte("expense_date", startDate)
    .lte("expense_date", endDate);
  const expRows = (ledgerRows ?? []).filter((r) => r.entry_type !== "income");
  const otherIncome = (ledgerRows ?? [])
    .filter((r) => r.entry_type === "income")
    .reduce((s, r) => s + r.amount, 0);
  const expTotal = expRows.reduce((s, r) => s + r.amount, 0);
  const byCategory: Record<string, number> = {};
  expRows.forEach((r) => {
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

  const totalRevenue = cash + insurance + otherIncome;
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
    revenue: { cash, insurance, other: otherIncome, total: totalRevenue },
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

// ── メニュー別の予約数・概算売上（その月） ──
// 予約のメイン course_name ＋ additional_courses を集計。概算売上はコース単価×件数。
export type MenuBreakdownRow = { courseName: string; count: number; estRevenue: number | null };

export async function getMenuBreakdown(year: number, month: number): Promise<MenuBreakdownRow[]> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const startTs = `${monthStr}-01T00:00:00+09:00`;
  const endTs = `${monthStr}-${String(daysInMonth).padStart(2, "0")}T23:59:59+09:00`;

  const { data: rows } = await supabase
    .from("appointments")
    .select("course_name, additional_courses")
    .eq("clinic_id", clinicId)
    .gte("start_time", startTs)
    .lte("start_time", endTs)
    .neq("status", "cancelled");

  const counts = new Map<string, number>();
  for (const r of rows ?? []) {
    if (r.course_name) counts.set(r.course_name, (counts.get(r.course_name) ?? 0) + 1);
    const adds = (r.additional_courses as { course_name?: string }[] | null) ?? [];
    for (const ac of adds) {
      if (ac?.course_name) counts.set(ac.course_name, (counts.get(ac.course_name) ?? 0) + 1);
    }
  }

  const names = Array.from(counts.keys());
  const priceByName = new Map<string, number | null>();
  if (names.length > 0) {
    const { data: courses } = await supabase
      .from("reservation_courses")
      .select("name, price")
      .eq("clinic_id", clinicId)
      .in("name", names);
    for (const c of courses ?? []) priceByName.set(c.name as string, (c.price as number | null) ?? null);
  }

  return names
    .map((n) => {
      const count = counts.get(n)!;
      const price = priceByName.get(n);
      return { courseName: n, count, estRevenue: price != null ? price * count : null };
    })
    .sort((a, b) => b.count - a.count);
}
