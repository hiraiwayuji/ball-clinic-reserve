"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/app/actions/auth";
import { unstable_noStore as noStore } from "next/cache";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";

async function getSupabase() {
  return await createClient();
}

const DEFAULT_CLINIC_ID = PUBLIC_CLINIC_ID;

export type BlockedSlot = {
  id: string;
  date: string;       // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string;   // HH:MM
  reason: string;
};

/** "HH:MM:SS" / "HH:MM" → "HH:MM" に正規化 */
function hhmm(v: string | null | undefined): string {
  if (!v) return "";
  return v.length >= 5 ? v.slice(0, 5) : v;
}

/** "HH:MM" → 分 */
function toMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/** 入力時刻が "HH:MM"（00:00〜23:59）かを検証 */
function isValidHHMM(v: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(v)) return false;
  const [h, m] = v.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/**
 * 管理カレンダー用：指定期間（from〜to, 両端含む）の休憩枠を取得。
 * 自院（ログイン中の clinic_id）のみ。
 */
export async function getBlockedSlots(fromDate: string, toDate: string): Promise<BlockedSlot[]> {
  noStore();
  const { clinicId } = await checkAdminAuth();
  const supabase = await getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("clinic_blocked_slots")
    .select("id, date, start_time, end_time, reason")
    .eq("clinic_id", clinicId)
    .gte("date", fromDate)
    .lte("date", toDate)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    console.error("Failed to fetch blocked slots:", error);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    id: r.id,
    date: r.date,
    start_time: hhmm(r.start_time),
    end_time: hhmm(r.end_time),
    reason: r.reason ?? "休憩",
  }));
}

/**
 * 患者Web予約の空き判定用：指定日の休憩枠を取得（匿名アクセス可・固定 clinic_id）。
 * RLS は read 全許可なので anon クライアントでも読める。
 */
export async function getBlockedSlotsForDate(
  dateStr: string,
  clinicId: string = DEFAULT_CLINIC_ID,
): Promise<BlockedSlot[]> {
  noStore();
  const supabase = await getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("clinic_blocked_slots")
    .select("id, date, start_time, end_time, reason")
    .eq("clinic_id", clinicId)
    .eq("date", dateStr)
    .order("start_time", { ascending: true });

  if (error) {
    console.error("Failed to fetch blocked slots for date:", error);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    id: r.id,
    date: r.date,
    start_time: hhmm(r.start_time),
    end_time: hhmm(r.end_time),
    reason: r.reason ?? "休憩",
  }));
}

/** 休憩枠を追加。date="YYYY-MM-DD", start/end="HH:MM"。 */
export async function createBlockedSlot(
  dateStr: string,
  startTime: string,
  endTime: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await getSupabase();
  if (!supabase) return { success: false, error: "Database not configured" };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { success: false, error: "日付の形式が正しくありません。" };
  }
  if (!isValidHHMM(startTime) || !isValidHHMM(endTime)) {
    return { success: false, error: "時刻の形式が正しくありません。" };
  }
  if (toMin(endTime) <= toMin(startTime)) {
    return { success: false, error: "終了時刻は開始時刻より後にしてください。" };
  }

  try {
    const { error } = await supabase
      .from("clinic_blocked_slots")
      .insert([{
        clinic_id: clinicId,
        date: dateStr,
        start_time: startTime,
        end_time: endTime,
        reason: (reason && reason.trim()) || "休憩",
      }]);

    // UNIQUE 制約違反（同じ開始時刻が既にある）は既登録とみなして成功扱い
    if (error && error.code !== "23505") {
      throw error;
    }
    return { success: true };
  } catch (error: any) {
    console.error("Create blocked slot error:", error);
    return { success: false, error: error.message || "休憩の追加に失敗しました。" };
  }
}

/** 休憩枠を削除（自院のみ）。 */
export async function deleteBlockedSlot(id: string): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await getSupabase();
  if (!supabase) return { success: false, error: "Database not configured" };

  try {
    const { error } = await supabase
      .from("clinic_blocked_slots")
      .delete()
      .eq("id", id)
      .eq("clinic_id", clinicId);
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error("Delete blocked slot error:", error);
    return { success: false, error: error.message || "休憩の削除に失敗しました。" };
  }
}
