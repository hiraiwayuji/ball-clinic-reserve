"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "./auth";

/**
 * 近日中（今週・今月）に誕生日を迎える患者リストを取得
 */
export async function getUpcomingBirthdays() {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  // 1. まず全顧客を取得（フィルタリングはJSで行う。個数が膨大な場合はSQLを工夫する必要があるが、現状はこれで十分）
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, name, birth_date, birth_month, city_name, line_user_id")
    .eq("clinic_id", clinicId);

  if (error) throw new Error("誕生日データの取得に失敗しました");

  // 誕生日が設定されている人を抽出
  const withBirthdays = (customers || []).filter(c => c.birth_date || c.birth_month);

  const upcoming = withBirthdays.map(c => {
    let month = c.birth_month;
    let day = null;

    if (c.birth_date) {
      const d = new Date(c.birth_date);
      month = d.getMonth() + 1;
      day = d.getDate();
    }

    return { ...c, month, day };
  }).filter(c => c.month === currentMonth)
    .sort((a, b) => (a.day || 0) - (b.day || 0));

  // 「今日」と「近日（7日以内）」で分類
  const today = upcoming.filter(c => c.day === currentDay);
  const thisWeek = upcoming.filter(c => c.day && c.day > currentDay && c.day <= currentDay + 7);
  const laterThisMonth = upcoming.filter(c => !c.day || c.day > currentDay + 7);

  return {
    today,
    thisWeek,
    laterThisMonth,
    totalThisMonth: upcoming.length
  };
}
