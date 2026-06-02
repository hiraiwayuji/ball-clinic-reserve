"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { checkAdminAuth, requireRole } from "@/app/actions/auth";
import { getTallyColumns } from "@/app/actions/settings";
import type { TallyColumn } from "@/lib/tally-columns";
import { revalidatePath } from "next/cache";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}

/** Asia/Tokyo の今日 (yyyy-MM-dd) */
function todayJst(): string {
  const now = new Date();
  const jst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  return `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, "0")}-${String(jst.getDate()).padStart(2, "0")}`;
}

export type TallyStaff = { id: string; name: string };

export type TallyRow = {
  // 行の一時ID（クライアント側のkey用。保存時は使わない）
  customer_name: string;
  medical_record_number: string;
  minutes: string;            // 入力欄なので文字列で扱う
  staff_id: string | null;
  is_first_visit: boolean;
  amounts: Record<string, number>; // colKey -> 金額
};

export type TallySheetData = {
  columns: TallyColumn[];
  staff: TallyStaff[];
  rows: TallyRow[];
  isOwner: boolean;
  isToday: boolean;
};

const TALLY_PREFIX = "tally:";

/** memo(JSON) から日計表メタ情報を取り出す */
function parseTallyMemo(memo: string | null): { mrn: string; minutes: string } {
  if (!memo) return { mrn: "", minutes: "" };
  try {
    const d = JSON.parse(memo);
    return {
      mrn: d?.medicalRecordNumber ? String(d.medicalRecordNumber) : "",
      minutes: d?.minutes != null ? String(d.minutes) : "",
    };
  } catch {
    return { mrn: "", minutes: "" };
  }
}

/**
 * 窓口日計表の入力データを取得。
 * その日の予約・受付済み患者を行に自動展開し、保存済みの日計表(tally:行)があれば金額をプリフィル。
 */
export async function getTallySheet(dateStr: string): Promise<TallySheetData> {
  const auth = await checkAdminAuth();
  const { clinicId } = auth;
  const isOwner = auth.role === "owner";
  const isToday = dateStr === todayJst();

  const columns = await getTallyColumns();
  const sb = getAdminSupabase();
  if (!sb) {
    return { columns, staff: [], rows: [], isOwner, isToday };
  }

  // スタッフ（担当）一覧
  const { data: staffData } = await sb
    .from("reservation_staff")
    .select("id, name, is_active, sort_order")
    .eq("clinic_id", clinicId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  const staff: TallyStaff[] = (staffData ?? []).map((s: any) => ({ id: s.id, name: s.name }));

  // その日の予約・受付済み（キャンセル除く）
  const dayStart = `${dateStr}T00:00:00+09:00`;
  const dayEnd = `${dateStr}T23:59:59+09:00`;
  const { data: appts } = await sb
    .from("appointments")
    .select(`id, start_time, end_time, is_first_visit, staff_id,
      customers(name, medical_record_number)`)
    .eq("clinic_id", clinicId)
    .neq("status", "cancelled")
    .gte("start_time", dayStart)
    .lte("start_time", dayEnd)
    .order("start_time", { ascending: true });

  // 保存済みの日計表行（tally:）を顧客名でまとめてプリフィル
  const { data: savedRows } = await sb
    .from("cash_sales")
    .select("customer_name, treatment_fee, payment_type, memo, staff_id, is_first_visit")
    .eq("clinic_id", clinicId)
    .eq("sale_date", dateStr)
    .like("payment_type", `${TALLY_PREFIX}%`);

  // name -> 集約
  type Agg = { amounts: Record<string, number>; staff_id: string | null; mrn: string; minutes: string; is_first_visit: boolean };
  const saved = new Map<string, Agg>();
  (savedRows ?? []).forEach((r: any) => {
    const name = r.customer_name as string;
    const colKey = String(r.payment_type ?? "").slice(TALLY_PREFIX.length);
    const meta = parseTallyMemo(r.memo);
    const prev = saved.get(name) ?? { amounts: {}, staff_id: null, mrn: "", minutes: "", is_first_visit: false };
    prev.amounts[colKey] = (prev.amounts[colKey] ?? 0) + (Number(r.treatment_fee) || 0);
    prev.staff_id = prev.staff_id ?? r.staff_id ?? null;
    prev.mrn = prev.mrn || meta.mrn;
    prev.minutes = prev.minutes || meta.minutes;
    prev.is_first_visit = prev.is_first_visit || !!r.is_first_visit;
    saved.set(name, prev);
  });

  const usedNames = new Set<string>();
  const rows: TallyRow[] = [];

  // 予約ベースの行
  (appts ?? []).forEach((a: any) => {
    const cust = Array.isArray(a.customers) ? a.customers[0] : a.customers;
    const name = (cust?.name ?? "").trim();
    if (!name) return;
    const s = saved.get(name);
    let minutes = "";
    try {
      const mins = Math.round((new Date(a.end_time).getTime() - new Date(a.start_time).getTime()) / 60000);
      if (mins > 0 && mins < 600) minutes = String(mins);
    } catch {}
    rows.push({
      customer_name: name,
      medical_record_number: s?.mrn || (cust?.medical_record_number ?? "") || "",
      minutes: s?.minutes || minutes,
      staff_id: s?.staff_id ?? a.staff_id ?? null,
      is_first_visit: s?.is_first_visit ?? !!a.is_first_visit,
      amounts: s?.amounts ?? {},
    });
    usedNames.add(name);
  });

  // 予約に無い保存済み患者（飛び込み）も行として追加
  saved.forEach((agg, name) => {
    if (usedNames.has(name)) return;
    rows.push({
      customer_name: name,
      medical_record_number: agg.mrn,
      minutes: agg.minutes,
      staff_id: agg.staff_id,
      is_first_visit: agg.is_first_visit,
      amounts: agg.amounts,
    });
  });

  return { columns, staff, rows, isOwner, isToday };
}

/**
 * 窓口日計表を保存（その日の tally: 行を入れ替え）。
 * 当日入力は受付スタッフ可、過去日の編集はオーナー専用。
 */
export async function saveTallySheet(
  dateStr: string,
  rows: TallyRow[],
): Promise<{ success: boolean; error?: string; saved?: number }> {
  const auth = await checkAdminAuth();
  const { clinicId } = auth;

  if (!dateStr) return { success: false, error: "日付が不正です" };
  if (dateStr !== todayJst() && auth.role !== "owner") {
    return { success: false, error: "過去・未来日の記帳はオーナーのみ可能です" };
  }

  const columns = await getTallyColumns();
  const colKeys = new Set(columns.map((c) => c.key));

  const supabase = await createClient();

  // 既存の tally 行をその日だけ削除（個別入力の cash_sales は触らない）
  const { error: delErr } = await supabase
    .from("cash_sales")
    .delete()
    .eq("clinic_id", clinicId)
    .eq("sale_date", dateStr)
    .like("payment_type", `${TALLY_PREFIX}%`);
  if (delErr) {
    console.error("saveTallySheet delete error:", delErr);
    return { success: false, error: "保存準備に失敗しました: " + delErr.message };
  }

  // 各行 → 金額のある列ごとに 1 行へ展開
  const insertRows: any[] = [];
  for (const row of rows) {
    const name = (row.customer_name ?? "").trim();
    if (!name) continue;
    const mrn = (row.medical_record_number ?? "").trim();
    const minutes = (row.minutes ?? "").toString().trim();
    const memo = JSON.stringify({
      ...(mrn ? { medicalRecordNumber: mrn } : {}),
      ...(minutes ? { minutes } : {}),
    });
    const staffId = row.staff_id || null;

    let firstLine = true;
    for (const col of columns) {
      if (!colKeys.has(col.key)) continue;
      const raw = row.amounts?.[col.key];
      // 未入力(undefined/null)はスキップ。明示的に入力された 0（自賠責など窓口0円）は計上する。
      if (raw == null) continue;
      const amount = Math.round(Number(raw));
      if (!Number.isFinite(amount)) continue;
      insertRows.push({
        sale_date: dateStr,
        customer_name: name,
        treatment_fee: amount,
        memo,
        // 新患の多重カウント防止: 患者の先頭行だけ true
        is_first_visit: firstLine ? !!row.is_first_visit : false,
        payment_type: `${TALLY_PREFIX}${col.key}`,
        payment_types: [`${TALLY_PREFIX}${col.key}`],
        staff_id: staffId,
        clinic_id: clinicId,
      });
      firstLine = false;
    }
  }

  if (insertRows.length > 0) {
    // tenant-isolation-ignore: insertRows の各行に clinic_id: clinicId を設定済み
    const { error: insErr } = await supabase.from("cash_sales").insert(insertRows);
    if (insErr) {
      console.error("saveTallySheet insert error:", insErr);
      return { success: false, error: "保存に失敗しました: " + insErr.message };
    }
  }

  revalidatePath("/admin/sales");
  revalidatePath("/admin/dashboard");
  return { success: true, saved: insertRows.length };
}

// ───────────────────────── データ分析（オーナー専用） ─────────────────────────

export type CategoryBreakdownRow = { key: string; label: string; amount: number; ratio: number; count: number };
export type TrendPoint = { period: string; amount: number; count: number };
export type StaffBreakdownRow = { staff_id: string | null; name: string; amount: number; count: number };

async function fetchSalesRange(clinicId: string, from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_sales")
    .select("sale_date, treatment_fee, payment_type, staff_id, customer_name, is_first_visit")
    .eq("clinic_id", clinicId)
    .gte("sale_date", from)
    .lte("sale_date", to);
  if (error) throw error;
  return data ?? [];
}

/** カテゴリ別売上構成（tally 列ごと＋その他） */
export async function getTallyCategoryBreakdown(
  from: string,
  to: string,
): Promise<{ success: boolean; rows?: CategoryBreakdownRow[]; total?: number; error?: string }> {
  try {
    const { clinicId } = await requireRole(["owner"]);
    const columns = await getTallyColumns();
    const labelByKey = new Map(columns.map((c) => [c.key, c.label]));
    const data = await fetchSalesRange(clinicId, from, to);

    const sumByKey = new Map<string, { amount: number; count: number }>();
    for (const r of data as any[]) {
      const pt = String(r.payment_type ?? "");
      const key = pt.startsWith(TALLY_PREFIX) ? pt.slice(TALLY_PREFIX.length) : "__other__";
      const prev = sumByKey.get(key) ?? { amount: 0, count: 0 };
      prev.amount += Number(r.treatment_fee) || 0;
      prev.count += 1;
      sumByKey.set(key, prev);
    }
    const total = Array.from(sumByKey.values()).reduce((s, v) => s + v.amount, 0);

    // tally 列の順序で並べ、最後にその他
    const rows: CategoryBreakdownRow[] = [];
    for (const col of columns) {
      const v = sumByKey.get(col.key);
      if (!v) continue;
      rows.push({ key: col.key, label: col.label, amount: v.amount, count: v.count, ratio: total ? v.amount / total : 0 });
    }
    const other = sumByKey.get("__other__");
    if (other && other.amount !== 0) {
      rows.push({ key: "__other__", label: "その他（個別入力・旧データ）", amount: other.amount, count: other.count, ratio: total ? other.amount / total : 0 });
    }
    return { success: true, rows, total };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "取得に失敗しました" };
  }
}

/** 日別・月別の売上推移 */
export async function getSalesTrend(
  granularity: "day" | "month",
  from: string,
  to: string,
): Promise<{ success: boolean; points?: TrendPoint[]; error?: string }> {
  try {
    const { clinicId } = await requireRole(["owner"]);
    const data = await fetchSalesRange(clinicId, from, to);
    const byPeriod = new Map<string, { amount: number; count: number }>();
    for (const r of data as any[]) {
      const d = String(r.sale_date); // yyyy-MM-dd
      const period = granularity === "month" ? d.slice(0, 7) : d;
      const prev = byPeriod.get(period) ?? { amount: 0, count: 0 };
      prev.amount += Number(r.treatment_fee) || 0;
      prev.count += 1;
      byPeriod.set(period, prev);
    }
    const points: TrendPoint[] = Array.from(byPeriod.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([period, v]) => ({ period, amount: v.amount, count: v.count }));
    return { success: true, points };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "取得に失敗しました" };
  }
}

/** 担当（スタッフ）別売上 */
export async function getStaffSalesBreakdown(
  from: string,
  to: string,
): Promise<{ success: boolean; rows?: StaffBreakdownRow[]; error?: string }> {
  try {
    const { clinicId } = await requireRole(["owner"]);
    const data = await fetchSalesRange(clinicId, from, to);

    const byStaff = new Map<string, { amount: number; count: number }>();
    for (const r of data as any[]) {
      const sid = r.staff_id ?? "__none__";
      const prev = byStaff.get(sid) ?? { amount: 0, count: 0 };
      prev.amount += Number(r.treatment_fee) || 0;
      prev.count += 1;
      byStaff.set(sid, prev);
    }

    // スタッフ名解決
    const sb = getAdminSupabase();
    const nameById = new Map<string, string>();
    if (sb) {
      const { data: staff } = await sb
        .from("reservation_staff")
        .select("id, name")
        .eq("clinic_id", clinicId);
      (staff ?? []).forEach((s: any) => nameById.set(s.id, s.name));
    }

    const rows: StaffBreakdownRow[] = Array.from(byStaff.entries())
      .map(([sid, v]) => ({
        staff_id: sid === "__none__" ? null : sid,
        name: sid === "__none__" ? "未設定" : (nameById.get(sid) ?? "（不明な担当）"),
        amount: v.amount,
        count: v.count,
      }))
      .sort((a, b) => b.amount - a.amount);

    return { success: true, rows };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "取得に失敗しました" };
  }
}

/** 売上記帳モードだけを軽量取得（/admin/sales のモード分岐用） */
export async function getSalesInputMode(): Promise<"per_patient" | "tally"> {
  const { clinicId } = await checkAdminAuth();
  const sb = getAdminSupabase();
  if (!sb) return "per_patient";
  const { data } = await sb
    .from("clinic_settings")
    .select("sales_input_mode")
    .eq("id", clinicId)
    .maybeSingle();
  return data?.sales_input_mode === "tally" ? "tally" : "per_patient";
}
