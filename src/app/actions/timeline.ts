"use server";

import { checkAdminAuth } from "./auth";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}

export type TimelineStaff = {
  id: string;
  name: string;
  sort_order: number;
};

export type TimelineAppointment = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string;
  checkin_status: string | null;
  is_first_visit: boolean;
  memo: string | null;
  course_id: string | null;
  course_name: string | null;
  staff_id: string | null;
  staff_name: string | null;
  room_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  additional_courses: { course_id: string; course_name: string }[] | null;
  additional_staff: { staff_id: string; staff_name: string }[] | null;
};

export type TimelineData = {
  staff: TimelineStaff[];
  appointments: TimelineAppointment[];
  slotMinutes: number;
  scheduleStartHour: number;
  scheduleEndHour: number;
  /** 当月の予約件数（status != cancelled）を staff_id 別に集計。未指定分は __unassigned__ キー */
  staffMonthCounts: Record<string, number>;
  monthLabel: string; // "5月" など
};

const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 20;

// "HH:MM" → 時間（端数は切り上げ）
function parseHourCeil(timeStr: string | null | undefined, fallback: number): number {
  if (!timeStr) return fallback;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  return Math.min(24, h + (min > 0 ? 1 : 0));
}

// "HH:MM" → 時間（端数は切り捨て）
function parseHourFloor(timeStr: string | null | undefined, fallback: number): number {
  if (!timeStr) return fallback;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  return parseInt(m[1], 10);
}

export async function getTimelineForDate(dateStr: string): Promise<{ success: boolean; data?: TimelineData; error?: string }> {
  try {
    const { clinicId } = await checkAdminAuth();
    const sb = getAdminSupabase();
    if (!sb) return { success: false, error: "service role unavailable" };

    const dayStart = `${dateStr}T00:00:00+09:00`;
    const dayEnd = `${dateStr}T23:59:59+09:00`;

    // 対象日の年月を計算（当月の合計件数取得用）
    const [y, m] = dateStr.split("-").map((s) => parseInt(s, 10));
    const monthStart = `${y}-${String(m).padStart(2, "0")}-01T00:00:00+09:00`;
    const lastDay = new Date(y, m, 0).getDate();
    const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59:59+09:00`;

    // 曜日判定（土曜は別の営業時間設定を使う）
    const targetDay = new Date(`${dateStr}T12:00:00+09:00`);
    const isSaturday = targetDay.getDay() === 6;

    const [staffRes, aptRes, monthAptRes, settingsRes] = await Promise.all([
      sb.from("reservation_staff")
        .select("id, name, sort_order")
        .eq("clinic_id", clinicId)
        .eq("is_active", true)
        .eq("show_in_timeline", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      sb.from("appointments")
        .select("id, start_time, end_time, status, checkin_status, is_first_visit, memo, course_id, course_name, staff_id, staff_name, room_name, customer_id, additional_courses, additional_staff, customers(name)")
        .eq("clinic_id", clinicId)
        .neq("status", "cancelled")
        .gte("start_time", dayStart)
        .lte("start_time", dayEnd)
        .order("start_time", { ascending: true }),
      // 当月の予約（件数集計のため staff_id だけ取得して件数カウント）
      sb.from("appointments")
        .select("staff_id")
        .eq("clinic_id", clinicId)
        .neq("status", "cancelled")
        .gte("start_time", monthStart)
        .lte("start_time", monthEnd),
      sb.from("clinic_settings")
        .select("slot_duration_minutes, business_open_weekday, business_close_weekday, business_open_saturday, business_close_saturday, admin_timeline_open_weekday, admin_timeline_close_weekday, admin_timeline_open_saturday, admin_timeline_close_saturday")
        .eq("id", clinicId)
        .maybeSingle(),
    ]);

    if (staffRes.error) return { success: false, error: staffRes.error.message };
    if (aptRes.error) return { success: false, error: aptRes.error.message };

    const staff: TimelineStaff[] = (staffRes.data ?? []).map(s => ({
      id: s.id,
      name: s.name,
      sort_order: s.sort_order ?? 0,
    }));

    const appointments: TimelineAppointment[] = (aptRes.data ?? []).map(a => {
      const cust = Array.isArray(a.customers) ? a.customers[0] : (a.customers as any);
      return {
        id: a.id,
        start_time: a.start_time,
        end_time: a.end_time ?? null,
        status: a.status,
        checkin_status: a.checkin_status ?? null,
        is_first_visit: !!a.is_first_visit,
        memo: a.memo ?? null,
        course_id: a.course_id ?? null,
        course_name: a.course_name ?? null,
        staff_id: a.staff_id ?? null,
        staff_name: a.staff_name ?? null,
        room_name: a.room_name ?? null,
        customer_id: a.customer_id ?? null,
        customer_name: cust?.name ?? null,
        additional_courses: (a.additional_courses ?? null) as { course_id: string; course_name: string }[] | null,
        additional_staff:   (a.additional_staff   ?? null) as { staff_id:  string; staff_name:  string }[] | null,
      };
    });

    const slotV = settingsRes.data?.slot_duration_minutes;
    const slotMinutes = (slotV === 15 || slotV === 20 || slotV === 30) ? slotV : 30;

    // 表示範囲は「管理画面タイムテーブル専用設定 (admin_timeline_*)」を最優先、
    // 設定が無ければ患者LP用の営業時間 (business_*) にフォールバック。
    // 土曜は別設定を持つ（admin_timeline_*_saturday → business_*_saturday の順）
    const openStr = isSaturday
      ? (settingsRes.data?.admin_timeline_open_saturday ?? settingsRes.data?.business_open_saturday)
      : (settingsRes.data?.admin_timeline_open_weekday ?? settingsRes.data?.business_open_weekday);
    const closeStr = isSaturday
      ? (settingsRes.data?.admin_timeline_close_saturday ?? settingsRes.data?.business_close_saturday)
      : (settingsRes.data?.admin_timeline_close_weekday ?? settingsRes.data?.business_close_weekday);
    const scheduleStartHour = parseHourFloor(openStr, DEFAULT_START_HOUR);
    const scheduleEndHour = parseHourCeil(closeStr, DEFAULT_END_HOUR);

    // 当月件数を staff_id 別に集計
    const staffMonthCounts: Record<string, number> = {};
    (monthAptRes.data ?? []).forEach((row: any) => {
      const key = row.staff_id ?? "__unassigned__";
      staffMonthCounts[key] = (staffMonthCounts[key] ?? 0) + 1;
    });

    return {
      success: true,
      data: {
        staff,
        appointments,
        slotMinutes,
        scheduleStartHour,
        scheduleEndHour,
        staffMonthCounts,
        monthLabel: `${m}月`,
      },
    };
  } catch (err: any) {
    console.error("getTimelineForDate error:", err);
    return { success: false, error: err?.message ?? "unknown" };
  }
}
