"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { checkAdminAuth } from "./auth";
import { addWeeks } from "date-fns";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createAdminClient(url, key);
}

// IDで患者を取得
export async function getPatientById(id: string) {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("id, name, phone, line_user_id")
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .single();
  return data;
}

// 患者名で検索
export async function searchPatients(name: string) {
  const { clinicId } = await checkAdminAuth();
  if (!name.trim()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("id, name, phone, line_user_id")
    .eq("clinic_id", clinicId)
    .ilike("name", `%${name.trim()}%`)
    .limit(10);
  return data || [];
}

// 予約追加用: 患者名で検索して最終来院日も返す
export type PatientSuggestion = {
  id: string;
  name: string;
  phone: string;
  medicalRecordNumber: string | null;
  lastVisitDate: string | null; // "yyyy-MM-dd"
  daysSinceLastVisit: number | null;
  totalVisits: number;
  // 前回（直近の過去来院）の施術内容。受付→売上の元データである過去予約から拾う。
  // 予約追加時に「前回同様」をプリフィルするために使う。
  lastCourseId: string | null;
  lastCourseName: string | null;
  lastStaffId: string | null;
  lastStaffName: string | null;
};

export async function searchPatientsForBooking(query: string): Promise<PatientSuggestion[]> {
  const { clinicId } = await checkAdminAuth();
  const q = query.trim();
  if (!q) return [];
  const supabase = await createClient();

  // 名前 OR カルテ番号 で部分一致検索（親子の同電話番号問題への対策として、カルテ番号でも引けるように）
  // medical_record_number カラム未作成の旧環境でもクラッシュしないよう、エラー時は name のみで再クエリ
  let customers: { id: string; name: string; phone: string; medical_record_number: string | null }[] = [];
  const { data: byOr, error: orError } = await supabase
    .from("customers")
    .select("id, name, phone, medical_record_number")
    .eq("clinic_id", clinicId)
    .or(`name.ilike.%${q}%,medical_record_number.ilike.%${q}%`)
    .limit(8);
  if (orError) {
    const { data: byName } = await supabase
      .from("customers")
      .select("id, name, phone")
      .eq("clinic_id", clinicId)
      .ilike("name", `%${q}%`)
      .limit(8);
    customers = (byName ?? []).map((c) => ({ ...c, medical_record_number: null }));
  } else {
    customers = byOr ?? [];
  }

  if (!customers || customers.length === 0) return [];

  // 各顧客の最終来院日と来院回数を取得
  const results: PatientSuggestion[] = await Promise.all(
    customers.map(async (c: { id: string; name: string; phone: string; medical_record_number: string | null }) => {
      const { data: apts } = await supabase
        .from("appointments")
        .select("start_time, course_id, course_name, staff_id, staff_name")
        .eq("customer_id", c.id)
        .eq("clinic_id", clinicId)
        .neq("status", "cancelled")
        .lt("start_time", new Date().toISOString())
        .order("start_time", { ascending: false })
        .limit(5);

      const { count } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", c.id)
        .eq("clinic_id", clinicId)
        .neq("status", "cancelled");

      const lastApt = apts?.[0];
      let lastVisitDate: string | null = null;
      let daysSinceLastVisit: number | null = null;
      if (lastApt) {
        const d = new Date(lastApt.start_time);
        lastVisitDate = d.toISOString().slice(0, 10);
        daysSinceLastVisit = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
      }

      // 「前回同様の施術内容」のプリフィル元。
      // 直近の過去来院は「指定なし」で受付されていることもあるので、
      // course_id が入っている一番新しい予約を採用する（直近5件から探す）。
      const lastTreated = (apts ?? []).find((a) => a.course_id) ?? null;

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        medicalRecordNumber: c.medical_record_number ?? null,
        lastVisitDate,
        daysSinceLastVisit,
        totalVisits: count ?? 0,
        lastCourseId: lastTreated?.course_id ?? null,
        lastCourseName: lastTreated?.course_name ?? null,
        lastStaffId: lastTreated?.staff_id ?? null,
        lastStaffName: lastTreated?.staff_name ?? null,
      };
    })
  );

  // 最終来院日が新しい順にソート
  return results.sort((a, b) => {
    if (!a.lastVisitDate) return 1;
    if (!b.lastVisitDate) return -1;
    return b.lastVisitDate.localeCompare(a.lastVisitDate);
  });
}

// 患者の予約一覧（過去＋今後）
export async function getPatientAppointments(customerId: string) {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();
  const { data } = await supabase
    .from("appointments")
    .select("id, start_time, end_time, status, is_first_visit, memo")
    .eq("customer_id", customerId)
    .eq("clinic_id", clinicId)
    .neq("status", "cancelled")
    .order("start_time", { ascending: true });
  return data || [];
}

// 予約を N 週間後の同じ曜日・時刻で複製
export async function cloneAppointmentWeeksLater(appointmentId: string, weeks: number) {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();

  const { data: apt } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .eq("clinic_id", clinicId)
    .single();

  if (!apt) throw new Error("予約が見つかりません");

  const newStart = addWeeks(new Date(apt.start_time), weeks);
  const newEnd = apt.end_time
    ? addWeeks(new Date(apt.end_time), weeks)
    : null;

  const admin = getAdminClient();
  const { error } = await admin.from("appointments").insert([{
    clinic_id: clinicId,
    customer_id: apt.customer_id,
    start_time: newStart.toISOString(),
    end_time: newEnd?.toISOString() ?? null,
    status: "confirmed",
    is_first_visit: false,
    memo: apt.memo ?? null,
  }]);

  if (error) throw new Error(error.message);
  return { success: true, newDate: newStart.toISOString() };
}

// 過去の予約から来院パターンを分析して予測提案を生成
export async function predictNextVisit(customerId: string): Promise<string> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await createClient();

  const { data: past } = await supabase
    .from("appointments")
    .select("start_time")
    .eq("clinic_id", clinicId)
    .eq("customer_id", customerId)
    .neq("status", "cancelled")
    .order("start_time", { ascending: false })
    .limit(20);

  if (!past || past.length < 2) {
    return "データが少ないため予測できません。もう数回ご来院いただくと予測精度が上がります。";
  }

  // 曜日・時刻の頻度を集計
  const dayCount: Record<number, number> = {};
  const hourCount: Record<number, number> = {};
  const intervals: number[] = [];

  const dates = past.map(p => new Date(p.start_time));
  dates.forEach(d => {
    const dow = d.getDay(); // 0=日, 1=月...
    const h = d.getHours();
    dayCount[dow] = (dayCount[dow] || 0) + 1;
    hourCount[h] = (hourCount[h] || 0) + 1;
  });

  // 来院間隔を計算（日数）
  for (let i = 0; i < dates.length - 1; i++) {
    const diff = (dates[i].getTime() - dates[i + 1].getTime()) / (1000 * 60 * 60 * 24);
    if (diff > 0 && diff < 180) intervals.push(diff);
  }

  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  const topDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0];
  const topHour = Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0];
  const avgInterval = intervals.length > 0
    ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
    : null;

  // 最後の予約から次回予測日
  const lastVisit = dates[0];
  const now = new Date();

  let prediction = `過去${past.length}回の来院データから分析：\n`;
  prediction += `・よく来られる曜日：${dayNames[Number(topDay[0])]}曜日（${topDay[1]}回）\n`;
  prediction += `・よく来られる時間帯：${topHour[0]}時台\n`;

  if (avgInterval) {
    prediction += `・平均来院間隔：約${avgInterval}日\n`;
    const nextExpected = new Date(lastVisit.getTime() + avgInterval * 24 * 60 * 60 * 1000);
    if (nextExpected > now) {
      const daysUntil = Math.round((nextExpected.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      prediction += `\n💡 次回予測：約${daysUntil}日後（${dayNames[nextExpected.getDay()]}曜日）の${topHour[0]}時台`;
    } else {
      prediction += `\n💡 来院時期を過ぎています。ご連絡を検討ください。`;
    }
  }

  return prediction;
}
