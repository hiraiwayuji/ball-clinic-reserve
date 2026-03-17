"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "./auth";

async function getSupabase() {
  return await createClient();
}

export type CalendarEvent = {
  id: string;
  calendar_id: string;
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
  color: string;
  member_name?: string | null;
  is_recurring: boolean;
  recurrence_rule?: string | null;
  created_at: string;
};

// ========================
// カレンダー自体の操作
// ========================

export async function getCalendar(id: string): Promise<{ id: string; name: string } | null> {
  await checkAdminAuth();
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.from("calendars").select("*").eq("id", id).single();
  if (error || !data) return null;
  return data;
}

export async function ensureCalendarExists(id: string, name: string = "ファミカレ"): Promise<{ id: string; name: string } | null> {
  await checkAdminAuth();
  const supabase = await getSupabase();
  if (!supabase) return null;
  
  const { data: existing } = await supabase.from("calendars").select("*").eq("id", id).single();
  if (existing) return existing;
  
  const { data, error } = await supabase.from("calendars").insert([{ id, name }]).select().single();
  if (error) {
    console.error("ensureCalendarExists error:", error);
    return null;
  }
  return data;
}

export async function updateCalendarName(id: string, name: string): Promise<{ success: boolean; error?: string }> {
  await checkAdminAuth();
  const supabase = await getSupabase();
  if (!supabase) return { success: false, error: "DB not configured" };
  const { error } = await supabase.from("calendars").update({ name }).eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ========================
// イベントの操作
// ========================

// 指定カレンダーの期間内イベントを取得
export async function getEvents(
  calendarId: string,
  start: string,
  end: string
): Promise<CalendarEvent[]> {
  await checkAdminAuth();
  const supabase = await getSupabase();
  console.log("getEvents: params=", { calendarId, start, end });
  if (!supabase || !calendarId) return [];
  try {
    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("calendar_id", calendarId)
      .lte("start_time", end)
      .gte("end_time", start)
      .order("start_time", { ascending: true });

    if (error) { console.error("getEvents error:", error); return []; }
    console.log("getEvents result count:", data?.length);
    return data || [];
  } catch (e) {
    console.error("getEvents exception:", e);
    return [];
  }
}

// イベント作成
export async function createEvent(
  calendarId: string,
  event: Omit<CalendarEvent, "id" | "calendar_id" | "created_at">
): Promise<{ success: boolean; event?: CalendarEvent; error?: string }> {
  await checkAdminAuth();
  const supabase = await getSupabase();
  console.log("createEvent: params=", { calendarId, event });
  if (!supabase) return { success: false, error: "DB not configured" };
  try {
    const { data, error } = await supabase
      .from("calendar_events")
      .insert([{ ...event, calendar_id: calendarId }])
      .select()
      .single();
    if (error) {
      console.error("createEvent error:", error);
      return { success: false, error: error.message };
    }
    console.log("createEvent success:", data.id);
    return { success: true, event: data };
  } catch (e: unknown) {
    console.error("createEvent exception:", e);
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// イベント更新
export async function updateEvent(
  id: string,
  event: Partial<Omit<CalendarEvent, "id" | "calendar_id" | "created_at">>
): Promise<{ success: boolean; error?: string }> {
  await checkAdminAuth();
  const supabase = await getSupabase();
  if (!supabase) return { success: false, error: "DB not configured" };
  try {
    const { error } = await supabase
      .from("calendar_events")
      .update(event)
      .eq("id", id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// イベント削除
export async function deleteEvent(id: string): Promise<{ success: boolean; error?: string }> {
  await checkAdminAuth();
  const supabase = await getSupabase();
  if (!supabase) return { success: false, error: "DB not configured" };
  try {
    const { error } = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
