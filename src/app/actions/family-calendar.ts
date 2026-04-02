"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

async function getSupabase() {
  return await createClient();
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key, {
    global: {
      fetch: (fetchUrl: RequestInfo | URL, options?: RequestInit) =>
        fetch(fetchUrl, { ...options, cache: "no-store" }),
    },
  });
}

export type CalendarMember = {
  name: string;
  color: string;
  bg: string;
  light: string;
  text: string;
  border?: string;
};

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

const DEFAULT_MEMBERS: CalendarMember[] = [
  { name: "パパ",    color: "#ef4444", bg: "bg-red-500",    light: "bg-red-100",    text: "text-red-700"    },
  { name: "ママ",    color: "#ec4899", bg: "bg-pink-500",   light: "bg-pink-100",   text: "text-pink-700"   },
  { name: "子ども1", color: "#3b82f6", bg: "bg-blue-500",   light: "bg-blue-100",   text: "text-blue-700"   },
  { name: "子ども2", color: "#22c55e", bg: "bg-green-500",  light: "bg-green-100",  text: "text-green-700"  },
  { name: "家族",    color: "#f59e0b", bg: "bg-amber-500",  light: "bg-amber-100",  text: "text-amber-700"  },
  { name: "試合",    color: "#dc2626", bg: "bg-red-600",    light: "bg-red-50",     text: "text-red-600", border: "border-red-600" },
  { name: "その他",  color: "#8b5cf6", bg: "bg-violet-500", light: "bg-violet-100", text: "text-violet-700" },
];

export async function ensureCalendarExists(
  id: string,
  name: string = "ファミリーカレンダー"
): Promise<{ id: string; name: string; members?: CalendarMember[] } | null> {
  const supabase = getAdminSupabase();
  if (!supabase) return null;
  const { data: existing } = await supabase.from("calendars").select("*").eq("id", id).single();
  if (existing) {
    if (!existing.members) {
      await supabase.from("calendars").update({ members: DEFAULT_MEMBERS }).eq("id", id);
      return { ...existing, members: DEFAULT_MEMBERS };
    }
    return existing;
  }
  const { data, error } = await supabase.from("calendars").insert([{ id, name, members: DEFAULT_MEMBERS }]).select().single();
  if (error) { console.error("ensureCalendarExists error:", error); return null; }
  return data;
}

export async function updateCalendarMembers(id: string, members: CalendarMember[]): Promise<{ success: boolean; error?: string }> {
  const supabase = getAdminSupabase();
  if (!supabase) return { success: false, error: "Admin client unavailable" };
  try {
    const { error } = await supabase.from("calendars").update({ members }).eq("id", id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : "Unknown error" }; }
}

// カレンダー内のイベントのメンバー名を一括変更
export async function bulkUpdateEventMemberName(
  calendarId: string,
  oldName: string,
  newName: string
): Promise<{ success: boolean; count?: number; error?: string }> {
  const supabase = getAdminSupabase();
  if (!supabase) return { success: false, error: "Admin client unavailable" };
  try {
    const { data, error } = await supabase
      .from("calendar_events")
      .update({ member_name: newName })
      .eq("calendar_id", calendarId)
      .eq("member_name", oldName)
      .select("id");
    if (error) return { success: false, error: error.message };
    return { success: true, count: data?.length ?? 0 };
  } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : "Unknown error" }; }
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

