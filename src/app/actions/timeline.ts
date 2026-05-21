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
  course_name: string | null;
  staff_id: string | null;
  staff_name: string | null;
  room_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
};

export type TimelineData = {
  staff: TimelineStaff[];
  appointments: TimelineAppointment[];
  slotMinutes: number;
  scheduleStartHour: number;
  scheduleEndHour: number;
};

const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 20;

export async function getTimelineForDate(dateStr: string): Promise<{ success: boolean; data?: TimelineData; error?: string }> {
  try {
    const { clinicId } = await checkAdminAuth();
    const sb = getAdminSupabase();
    if (!sb) return { success: false, error: "service role unavailable" };

    const dayStart = `${dateStr}T00:00:00+09:00`;
    const dayEnd = `${dateStr}T23:59:59+09:00`;

    const [staffRes, aptRes, settingsRes] = await Promise.all([
      sb.from("reservation_staff")
        .select("id, name, sort_order")
        .eq("clinic_id", clinicId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      sb.from("appointments")
        .select("id, start_time, end_time, status, checkin_status, is_first_visit, memo, course_name, staff_id, staff_name, room_name, customer_id, customers(name)")
        .eq("clinic_id", clinicId)
        .neq("status", "cancelled")
        .gte("start_time", dayStart)
        .lte("start_time", dayEnd)
        .order("start_time", { ascending: true }),
      sb.from("clinic_settings")
        .select("slot_duration_minutes")
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
        course_name: a.course_name ?? null,
        staff_id: a.staff_id ?? null,
        staff_name: a.staff_name ?? null,
        room_name: a.room_name ?? null,
        customer_id: a.customer_id ?? null,
        customer_name: cust?.name ?? null,
      };
    });

    const slotV = settingsRes.data?.slot_duration_minutes;
    const slotMinutes = (slotV === 15 || slotV === 20 || slotV === 30) ? slotV : 30;

    return {
      success: true,
      data: {
        staff,
        appointments,
        slotMinutes,
        scheduleStartHour: DEFAULT_START_HOUR,
        scheduleEndHour: DEFAULT_END_HOUR,
      },
    };
  } catch (err: any) {
    console.error("getTimelineForDate error:", err);
    return { success: false, error: err?.message ?? "unknown" };
  }
}
