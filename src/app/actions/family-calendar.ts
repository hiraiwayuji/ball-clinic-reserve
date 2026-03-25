"use server";

import { createClient } from "@/lib/supabase/server";

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

export async function ensureCalendarExists(
  id: string,
  name: string = "ファミリーカレンダー"
): Promise<{ id: string; name: string } | null> {
  const supabase = await getSupabase();
  const { data: existing } = await supabase.from("calendars").select("*").eq("id", id).single();
  if (existing) return existing;
  const { data, error } = await supabase.from("calendars").insert([{ id, name }]).select().single();
  if (error) { console.error("ensureCalendarExists error:", error); return null; }
  return data;
}

export async function getEvents(calendarId: string, start: string, end: string): Promise<CalendarEvent[]> {
  const supabase = await getSupabase();
  if (!calendarId) return [];
  try {
    const { data, error } = await supabase.from("calendar_events").select("*").eq("calendar_id", calendarId).lte("start_time", end).gte("end_time", start).order("start_time", { ascending: true });
    if (error) { console.error("getEvents error:", error); return []; }
    return data || [];
  } catch (e) { console.error("getEvents exception:", e); return []; }
}

export async function createEvent(calendarId: string, event: Omit<CalendarEvent, "id" | "calendar_id" | "created_at">): Promise<{ success: boolean; event?: CalendarEvent; error?: string }> {
  const supabase = await getSupabase();
  try {
    const { data, error } = await supabase.from("calendar_events").insert([{ ...event, calendar_id: calendarId }]).select().single();
    if (error) return { success: false, error: error.message };
    return { success: true, event: data };
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : "Unknown error" }; }
}

export async function updateEvent(id: string, event: Partial<Omit<CalendarEvent, "id" | "calendar_id" | "created_at">>): Promise<{ success: boolean; error?: string }> {
  const supabase = await getSupabase();
  try {
    const { error } = await supabase.from("calendar_events").update(event).eq("id", id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : "Unknown error" }; }
}

export async function deleteEvent(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await getSupabase();
  try {
    const { error } = await supabase.from("calendar_events").delete().eq("id", id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : "Unknown error" }; }
}
