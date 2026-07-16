"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/app/actions/auth";
import { unstable_noStore as noStore } from "next/cache";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";
import type { SpecialDay } from "@/lib/time-slots";

async function getSupabase() {
  return await createClient();
}

const DEFAULT_CLINIC_ID = PUBLIC_CLINIC_ID;

/** DB行 → SpecialDay に正規化（時刻は "HH:MM"）。 */
function toSpecialDay(r: any): SpecialDay {
  const hhmm = (v: string | null | undefined): string | null =>
    !v ? null : v.length >= 5 ? v.slice(0, 5) : v;
  return {
    date: r.date,
    closed: !!r.closed,
    openTime: hhmm(r.open_time),
    closeTime: hhmm(r.close_time),
    blockSameDay: !!r.block_same_day,
    note: r.note ?? null,
  };
}

/** "HH:MM"（00:00〜23:59）検証 */
function isValidHHMM(v: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(v)) return false;
  const [h, m] = v.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}
function toMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/** 管理・患者共通：自院の臨時営業日を全件取得（テーブルは小さいので全件でOK）。 */
export async function getSpecialDays(clinicId: string = DEFAULT_CLINIC_ID): Promise<SpecialDay[]> {
  noStore();
  const supabase = await getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("clinic_special_days")
    .select("date, closed, open_time, close_time, block_same_day, note")
    .eq("clinic_id", clinicId)
    .order("date", { ascending: true });
  if (error) {
    console.error("Failed to fetch special days:", error);
    return [];
  }
  return (data ?? []).map(toSpecialDay);
}

/** 患者Web予約・サーバ検証用：指定日の臨時営業日を1件取得（匿名可・固定 clinic_id）。 */
export async function getSpecialDayForDate(
  dateStr: string,
  clinicId: string = DEFAULT_CLINIC_ID,
): Promise<SpecialDay | null> {
  noStore();
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("clinic_special_days")
    .select("date, closed, open_time, close_time, block_same_day, note")
    .eq("clinic_id", clinicId)
    .eq("date", dateStr)
    .maybeSingle();
  if (error) {
    console.error("Failed to fetch special day for date:", error);
    return null;
  }
  return data ? toSpecialDay(data) : null;
}

export type UpsertSpecialDayInput = {
  date: string;
  closed?: boolean;
  openTime?: string | null;
  closeTime?: string | null;
  blockSameDay?: boolean;
  note?: string | null;
};

/** 臨時営業日を追加・更新（自院のみ／1日1レコード upsert）。 */
export async function upsertSpecialDay(
  input: UpsertSpecialDayInput,
): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await getSupabase();
  if (!supabase) return { success: false, error: "Database not configured" };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { success: false, error: "日付の形式が正しくありません。" };
  }
  const open = input.openTime && input.openTime.trim() ? input.openTime.trim() : null;
  const close = input.closeTime && input.closeTime.trim() ? input.closeTime.trim() : null;
  if (open && !isValidHHMM(open)) return { success: false, error: "開始時刻の形式が正しくありません。" };
  if (close && !isValidHHMM(close)) return { success: false, error: "終了時刻の形式が正しくありません。" };
  if (open && close && toMin(close) <= toMin(open)) {
    return { success: false, error: "終了時刻は開始時刻より後にしてください。" };
  }

  try {
    const { error } = await supabase
      .from("clinic_special_days")
      .upsert(
        {
          clinic_id: clinicId,
          date: input.date,
          closed: !!input.closed,
          open_time: open,
          close_time: close,
          block_same_day: !!input.blockSameDay,
          note: (input.note && input.note.trim()) || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "clinic_id,date" },
      );
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error("Upsert special day error:", error);
    return { success: false, error: error.message || "臨時営業日の保存に失敗しました。" };
  }
}

/** 臨時営業日を削除（自院のみ・日付指定）。 */
export async function deleteSpecialDay(dateStr: string): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await getSupabase();
  if (!supabase) return { success: false, error: "Database not configured" };
  try {
    const { error } = await supabase
      .from("clinic_special_days")
      .delete()
      .eq("clinic_id", clinicId)
      .eq("date", dateStr);
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error("Delete special day error:", error);
    return { success: false, error: error.message || "臨時営業日の削除に失敗しました。" };
  }
}
