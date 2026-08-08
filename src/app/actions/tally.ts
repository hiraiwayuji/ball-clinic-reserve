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
  // 種別を持つ列で選ばれた種別（colKey -> 種別名。例: { shinkyu: "小児鍼" }）
  variants?: Record<string, string>;
  // 受付カウンターとの連動・次回予約のための予約紐付け（保存対象外、表示用）
  appointment_id?: string | null;
  customer_id?: string | null;
  customer_phone?: string;
  checkin_status?: string | null; // null|"arrived"|"in_treatment"|"done"
};

export type TallySheetData = {
  columns: TallyColumn[];
  staff: TallyStaff[];
  rows: TallyRow[];
  isOwner: boolean;
  isToday: boolean;
};

const TALLY_PREFIX = "tally:";

/**
 * 同一人物の判定キー。
 * 「布川紗帆」と「布川　紗帆」のような空白ゆれを同じ人として扱う。
 */
function nameKey(name: string): string {
  return (name ?? "").replace(/[\s　]/g, "");
}

/** 受付ステータスの進み具合（小さいほど手前）。複数施術がある人は一番手前の状態を採用する */
const CHECKIN_ORDER: (string | null)[] = [null, "arrived", "in_treatment", "done"];
function earlierCheckin(a: string | null, b: string | null): string | null {
  return CHECKIN_ORDER.indexOf(a) <= CHECKIN_ORDER.indexOf(b) ? a : b;
}

/** memo(JSON) から日計表メタ情報を取り出す */
function parseTallyMemo(memo: string | null): { mrn: string; minutes: string; variant: string } {
  if (!memo) return { mrn: "", minutes: "", variant: "" };
  try {
    const d = JSON.parse(memo);
    return {
      mrn: d?.medicalRecordNumber ? String(d.medicalRecordNumber) : "",
      minutes: d?.minutes != null ? String(d.minutes) : "",
      variant: d?.variant ? String(d.variant) : "",
    };
  } catch {
    return { mrn: "", minutes: "", variant: "" };
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
    .select(`id, start_time, end_time, is_first_visit, staff_id, checkin_status,
      customers(id, name, phone, medical_record_number)`)
    .eq("clinic_id", clinicId)
    .neq("status", "cancelled")
    .gte("start_time", dayStart)
    .lte("start_time", dayEnd)
    .order("start_time", { ascending: true });

  // その日のキャンセル分（名前だけ）。
  // 受付でキャンセルにしたのに、保存済みの0円行が「飛び込み」として復活し、
  // 来院人数に数えられてしまう事故を防ぐために使う（2026-08-07 藤川先生の指摘）。
  const { data: cancelledAppts } = await sb
    .from("appointments")
    .select("customers(name)")
    .eq("clinic_id", clinicId)
    .eq("status", "cancelled")
    .gte("start_time", dayStart)
    .lte("start_time", dayEnd);
  const cancelledNames = new Set<string>(
    (cancelledAppts ?? [])
      .map((a: any) => {
        const cust = Array.isArray(a.customers) ? a.customers[0] : a.customers;
        return nameKey((cust?.name ?? "").trim());
      })
      .filter(Boolean),
  );

  // 保存済みの日計表行（tally:）を顧客名でまとめてプリフィル
  const { data: savedRows } = await sb
    .from("cash_sales")
    .select("customer_name, treatment_fee, payment_type, memo, staff_id, is_first_visit")
    .eq("clinic_id", clinicId)
    .eq("sale_date", dateStr)
    .like("payment_type", `${TALLY_PREFIX}%`);

  // 同一人物（空白ゆれを含む）ごとに集約
  type Agg = { name: string; amounts: Record<string, number>; variants: Record<string, string>; staff_id: string | null; mrn: string; minutes: string; is_first_visit: boolean };
  const saved = new Map<string, Agg>();
  (savedRows ?? []).forEach((r: any) => {
    const name = String(r.customer_name ?? "").trim();
    const key = nameKey(name);
    if (!key) return;
    const colKey = String(r.payment_type ?? "").slice(TALLY_PREFIX.length);
    const meta = parseTallyMemo(r.memo);
    const prev = saved.get(key) ?? { name, amounts: {}, variants: {}, staff_id: null, mrn: "", minutes: "", is_first_visit: false };
    prev.amounts[colKey] = (prev.amounts[colKey] ?? 0) + (Number(r.treatment_fee) || 0);
    if (meta.variant) prev.variants[colKey] = meta.variant;
    prev.staff_id = prev.staff_id ?? r.staff_id ?? null;
    prev.mrn = prev.mrn || meta.mrn;
    prev.minutes = prev.minutes || meta.minutes;
    prev.is_first_visit = prev.is_first_visit || !!r.is_first_visit;
    saved.set(key, prev);
  });

  // 同じ人が同じ日に複数予約（保険→鍼灸で担当が違う等）でも記帳は1行。
  // 予約ごとに行を作ると、保存済み金額が各行にプリフィルされて保存のたび金額が倍になる。
  type ApptGroup = { name: string; mrn: string; minutes: number; staff_id: string | null; is_first_visit: boolean; appointment_id: string | null; customer_id: string | null; phone: string; checkin_status: string | null };
  const apptGroups = new Map<string, ApptGroup>();
  (appts ?? []).forEach((a: any) => {
    const cust = Array.isArray(a.customers) ? a.customers[0] : a.customers;
    const name = (cust?.name ?? "").trim();
    const key = nameKey(name);
    if (!key) return;
    let mins = 0;
    try {
      const m = Math.round((new Date(a.end_time).getTime() - new Date(a.start_time).getTime()) / 60000);
      if (m > 0 && m < 600) mins = m;
    } catch {}
    const prev = apptGroups.get(key);
    if (!prev) {
      apptGroups.set(key, {
        name,
        mrn: cust?.medical_record_number ?? "",
        minutes: mins,
        staff_id: a.staff_id ?? null,
        is_first_visit: !!a.is_first_visit,
        appointment_id: a.id ?? null,
        customer_id: cust?.id ?? null,
        phone: cust?.phone ?? "",
        checkin_status: a.checkin_status ?? null,
      });
      return;
    }
    // 施術時間は合算（40分＋20分＝60分）、受付状態は一番手前のものを残す
    prev.minutes += mins;
    prev.is_first_visit = prev.is_first_visit || !!a.is_first_visit;
    prev.staff_id = prev.staff_id ?? a.staff_id ?? null;
    prev.mrn = prev.mrn || (cust?.medical_record_number ?? "");
    prev.checkin_status = earlierCheckin(prev.checkin_status, a.checkin_status ?? null);
  });

  const usedNames = new Set<string>();
  const rows: TallyRow[] = [];

  // 予約ベースの行
  apptGroups.forEach((g, key) => {
    const s = saved.get(key);
    rows.push({
      customer_name: g.name,
      medical_record_number: s?.mrn || g.mrn || "",
      minutes: s?.minutes || (g.minutes > 0 ? String(g.minutes) : ""),
      staff_id: s?.staff_id ?? g.staff_id,
      is_first_visit: s?.is_first_visit ?? g.is_first_visit,
      amounts: s?.amounts ?? {},
      variants: s?.variants ?? {},
      appointment_id: g.appointment_id,
      customer_id: g.customer_id,
      customer_phone: g.phone,
      checkin_status: g.checkin_status,
    });
    usedNames.add(key);
  });

  // 予約に無い保存済み患者（飛び込み）も行として追加
  saved.forEach((agg, name) => {
    if (usedNames.has(name)) return;
    // その日の予約が全部キャンセルになっていて、金額も入っていない行は出さない。
    // （受付でキャンセルにした人が0円のまま残り、来院人数に1名として数えられていた）
    // お金が入っている行は「実際に来て会計した」ので必ず残す。
    if (cancelledNames.has(name)) {
      const total = Object.values(agg.amounts).reduce((s, v) => s + (Number(v) || 0), 0);
      if (total === 0) return;
    }
    rows.push({
      customer_name: agg.name,
      medical_record_number: agg.mrn,
      minutes: agg.minutes,
      staff_id: agg.staff_id,
      is_first_visit: agg.is_first_visit,
      amounts: agg.amounts,
      variants: agg.variants,
      appointment_id: null,
      customer_id: null,
      customer_phone: "",
      checkin_status: null,
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

  // 同じ人の行が2つ届いた場合の取り扱い。
  // 中身が同じなら「画面の重複表示」なので1つに畳む（そのまま入れると金額が倍になる）。
  // 中身が違うなら別会計なので列ごとに合算する。
  const mergedRows: TallyRow[] = [];
  const rowByName = new Map<string, TallyRow>();
  for (const r of rows) {
    const name = (r.customer_name ?? "").trim();
    if (!name) continue;
    const key = nameKey(name);
    const prev = rowByName.get(key);
    if (!prev) {
      const copy: TallyRow = { ...r, customer_name: name, amounts: { ...r.amounts }, variants: { ...(r.variants ?? {}) } };
      rowByName.set(key, copy);
      mergedRows.push(copy);
      continue;
    }
    if (JSON.stringify(prev.amounts) === JSON.stringify(r.amounts)) continue;
    for (const [col, val] of Object.entries(r.amounts ?? {})) {
      prev.amounts[col] = (prev.amounts[col] ?? 0) + (Number(val) || 0);
    }
    for (const [col, v] of Object.entries(r.variants ?? {})) {
      if (!prev.variants![col]) prev.variants![col] = v;
    }
    prev.is_first_visit = prev.is_first_visit || r.is_first_visit;
    prev.medical_record_number = prev.medical_record_number || r.medical_record_number;
    prev.staff_id = prev.staff_id ?? r.staff_id;
  }

  // 空データが送られてきた場合（画面ロード失敗・通信の巻き戻し等）に
  // その日の記帳を全消去してしまう事故を防ぐ。何も送られなければ何もしない。
  if (mergedRows.length === 0) {
    return { success: true, saved: 0 };
  }

  // 既存の tally 行を「今回送信された患者の分だけ」削除して入れ替える。
  // 個別入力の cash_sales（payment_type が tally: 以外）は触らない。
  // 「布川紗帆」と「布川　紗帆」のような空白ゆれも同じ人として消す（残すと重複行が復活する）。
  const submittedKeys = new Set(mergedRows.map((r) => nameKey(r.customer_name)));
  const { data: existingTallyRows, error: fetchErr } = await supabase
    .from("cash_sales")
    .select("id, customer_name")
    .eq("clinic_id", clinicId)
    .eq("sale_date", dateStr)
    .like("payment_type", `${TALLY_PREFIX}%`);
  if (fetchErr) {
    console.error("saveTallySheet fetch error:", fetchErr);
    return { success: false, error: "保存準備に失敗しました: " + fetchErr.message };
  }
  const deleteIds = (existingTallyRows ?? [])
    .filter((r: any) => submittedKeys.has(nameKey(String(r.customer_name ?? ""))))
    .map((r: any) => r.id as string);
  if (deleteIds.length > 0) {
    const { error: delErr } = await supabase
      .from("cash_sales")
      .delete()
      .eq("clinic_id", clinicId)
      .in("id", deleteIds);
    if (delErr) {
      console.error("saveTallySheet delete error:", delErr);
      return { success: false, error: "保存準備に失敗しました: " + delErr.message };
    }
  }

  // 列ごとの種別候補（種別の正当性チェック用）
  const variantsByKey = new Map<string, Set<string>>(
    columns.map((c) => [c.key, new Set((c.variants ?? []).map((v) => v.trim()).filter(Boolean))]),
  );

  // 各行 → 金額のある列ごとに 1 行へ展開
  const insertRows: any[] = [];
  for (const row of mergedRows) {
    const name = (row.customer_name ?? "").trim();
    if (!name) continue;
    const mrn = (row.medical_record_number ?? "").trim();
    const minutes = (row.minutes ?? "").toString().trim();
    const staffId = row.staff_id || null;

    let firstLine = true;
    for (const col of columns) {
      if (!colKeys.has(col.key)) continue;
      const raw = row.amounts?.[col.key];
      // 未入力(undefined/null)はスキップ。明示的に入力された 0（自賠責など窓口0円）は計上する。
      if (raw == null) continue;
      const amount = Math.round(Number(raw));
      if (!Number.isFinite(amount)) continue;
      // 種別（その列に定義された候補にあるものだけ採用）
      const variant = (row.variants?.[col.key] ?? "").trim();
      const validVariant = variant && variantsByKey.get(col.key)?.has(variant) ? variant : "";
      // memo は列ごと（種別が列で異なるため行共通にしない）
      const memo = JSON.stringify({
        ...(mrn ? { medicalRecordNumber: mrn } : {}),
        ...(minutes ? { minutes } : {}),
        ...(validVariant ? { variant: validVariant } : {}),
      });
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
