"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { checkAdminAuth } from "./auth";
import { revalidatePath } from "next/cache";
import { getClinicSettings } from "./settings";

type CustomerWithStats = {
  id: string;
  name: string;
  phone: string;
  created_at: string;
  appointmentCount: number;
  cancelCount: number;
  lastVisit: string | null;
  booking_suspended: boolean;
  line_user_id: string | null;
  birth_month: number | null;
  gender: string | null;
  age_group: string | null;
  guardian_name: string | null;
  city_name: string | null;
  birth_date: string | null;
  referral_source: string | null;
  medical_record_number: string | null;
  address: string | null;
};

type AppointmentRow = {
  id: string;
  start_time: string;
  status: string | null;
};

type CustomerRow = Omit<CustomerWithStats, "appointmentCount" | "cancelCount" | "lastVisit"> & {
  appointments?: AppointmentRow[] | null;
};

type SupabaseErrorLike = {
  message?: string;
};

type CustomerUpdateData = {
  name: string;
  phone: string;
  medical_record_number?: string | null;
};

export async function getCustomers(): Promise<CustomerWithStats[]> {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await createClient();

    // まず medical_record_number を含めてクエリ
    const { data: rawCustomers, error: firstError } = await supabase
      .from("customers")
      .select(`
        id,
        name,
        phone,
        created_at,
        booking_suspended,
        line_user_id,
        birth_month,
        gender,
        age_group,
        guardian_name,
        city_name,
        birth_date,
        referral_source,
        medical_record_number,
        address,
        appointments (
          id,
          start_time,
          status
        )
      `)
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false });

    let customers: CustomerRow[] | null = rawCustomers as CustomerRow[] | null;
    let queryError = firstError;

    // エラーが発生した場合（medical_record_number カラム未作成など）は除外して再クエリ
    if (queryError) {
      const errMsg = (queryError as SupabaseErrorLike).message ?? JSON.stringify(queryError);
      console.warn("First query failed, retrying without medical_record_number:", errMsg);
      const fallback = await supabase
        .from("customers")
        .select(`
          id,
          name,
          phone,
          created_at,
          booking_suspended,
          line_user_id,
          birth_month,
          gender,
          age_group,
          guardian_name,
          city_name,
          birth_date,
          referral_source,
          address,
          appointments (
            id,
            start_time,
            status
          )
        `)
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false });
      customers = (fallback.data as CustomerRow[] | null) ?? null;
      queryError = fallback.error;
    }

    if (queryError) {
      const errMsg = (queryError as SupabaseErrorLike).message ?? JSON.stringify(queryError);
      console.error("Failed to fetch customers:", errMsg);
      return [];
    }

    const customerRows = customers ?? [];

    const formattedCustomers: CustomerWithStats[] = customerRows.map((c) => {
      const appointments = c.appointments || [];
      const cancelled = appointments.filter((a) => a.status === "cancelled");
      const active = appointments.filter((a) => a.status !== "cancelled");

      let lastVisit = null;
      if (active.length > 0) {
        const sorted = [...active].sort((a, b) =>
          new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
        );
        lastVisit = sorted[0].start_time;
      }

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        created_at: c.created_at,
        appointmentCount: active.length,
        cancelCount: cancelled.length,
        lastVisit,
        booking_suspended: c.booking_suspended ?? false,
        line_user_id: c.line_user_id ?? null,
        birth_month: c.birth_month ?? null,
        gender: c.gender ?? null,
        age_group: c.age_group ?? null,
        guardian_name: c.guardian_name ?? null,
        city_name: c.city_name ?? null,
        birth_date: c.birth_date ?? null,
        referral_source: c.referral_source ?? null,
        address: c.address ?? null,
        medical_record_number: c.medical_record_number ?? null,
      };
    });

    return formattedCustomers;
  } catch (err) {
    console.error("Customers fetch error:", err);
    return [];
  }
}

export async function updateCustomerQuestionnaire(
  customerId: string,
  data: {
    guardian_name?: string | null;
    birth_month?: number | null;
    gender?: string | null;
    age_group?: string | null;
    city_name?: string | null;
    birth_date?: string | null;
    referral_source?: string | null;
    address?: string | null;
  }
) {
  const { clinicId } = await checkAdminAuth();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");
  const supabase = createAdminClient(url, key);
  const { error } = await supabase
    .from("customers")
    .update(data)
    .eq("id", customerId)
    .eq("clinic_id", clinicId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/customers");
  return { success: true };
}

export async function updateCustomerInfo(
  customerId: string, 
  name: string, 
  phone: string,
  medicalRecordNumber?: string | null
) {
  const { clinicId } = await checkAdminAuth();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createAdminClient(url, key);
  
  const updateData: CustomerUpdateData = { 
    name: name.trim(), 
    phone: phone.trim() 
  };
  
  if (medicalRecordNumber !== undefined) {
    updateData.medical_record_number = medicalRecordNumber?.trim() || null;
  }

  const { error } = await supabase
    .from("customers")
    .update(updateData)
    .eq("id", customerId)
    .eq("clinic_id", clinicId);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/customers");
  return { success: true };
}

/**
 * 二つの顧客データを統合する（名寄せ）
 * sourceId の予約履歴を targetId へ移動し、sourceId を削除する
 */
export async function mergeCustomers(sourceId: string, targetId: string) {
  if (sourceId === targetId) {
    throw new Error("同じ患者同士は統合できません");
  }

  const { clinicId } = await checkAdminAuth();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createAdminClient(url, key);

  // 1. 予約データの移行
  const { error: moveError } = await supabase
    .from("appointments")
    .update({ customer_id: targetId })
    .eq("customer_id", sourceId)
    .eq("clinic_id", clinicId);

  if (moveError) {
    console.error("Failed to move appointments:", moveError);
    throw new Error("予約データの移行に失敗しました");
  }

  // 2. 元の顧客データを削除
  const { error: deleteError } = await supabase
    .from("customers")
    .delete()
    .eq("id", sourceId)
    .eq("clinic_id", clinicId);

  if (deleteError) {
    console.error("Failed to delete source customer:", deleteError);
    // 予約は既に移動済みなので、ここでのエラーは致命的ではないかもしれないが通知
  }

  revalidatePath("/admin/customers");
  return { success: true };
}

export type FuzzyDuplicateGroup = {
  ids: string[];
  reason: string;
  confidence: "high" | "medium" | "low";
};

export type FindFuzzyDuplicatesResult = {
  groups: FuzzyDuplicateGroup[];
  scannedAt: string;
  scannedCount: number;
};

export async function findFuzzyDuplicates(): Promise<FindFuzzyDuplicatesResult> {
  const { clinicId } = await checkAdminAuth();
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API キーが未設定です");
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");
  
  const supabase = createAdminClient(url, key);
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, name")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false });
  
  if (error) throw new Error("顧客データの取得に失敗しました");
  if (!customers || customers.length < 2) {
    return { 
      groups: [], 
      scannedAt: new Date().toISOString(), 
      scannedCount: customers?.length ?? 0,
    };
  }
  
  // 名前のみで Gemini に送信（プライバシー配慮）
  const customerList = customers.map(c => `${c.id}: ${c.name}`).join("\n");
  
  const prompt = `あなたは日本の医療機関の患者データを管理するアシスタントです。
以下の患者リストから、表記が異なるが同一人物の可能性が高いペアやグループを見つけてください。

検出すべき例:
- 「鈴木一郎」と「すずきいちろう」（漢字 vs ひらがな、同一読み）
- 「タナカ ハナコ」と「田中花子」（カタカナ vs 漢字）
- 「山田たろう」と「ヤマダタロウ」（ひらがな vs カタカナ）

検出すべきでない例:
- 同姓だが名前が違う（「鈴木一郎」と「鈴木次郎」は別人）
- 一部のみ一致（「田中」と「田中花子」は別の可能性）
- 同姓同名が複数いる場合は除外

【患者リスト】（id: 名前）
${customerList}

ルール:
- ids は患者リストに実在するUUIDのみ使用
- 1グループに最大3名まで
- confidence: high(ほぼ確実)/medium(可能性あり)/low(疑わしい程度)
- 表記揺れがない場合は空配列を返す

以下のJSON形式のみで返答（説明文・コードブロック不要）:
{
  "groups": [
    { "ids": ["uuid1", "uuid2"], "reason": "漢字とひらがなで同一読み「すずきいちろう」", "confidence": "high" }
  ]
}`;

  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI 応答のパースに失敗しました");
  
  const parsed = JSON.parse(jsonMatch[0]) as { groups?: unknown };
  
  // ハルシネーション対策: 配列でない or ID不在のものを除外
  const rawGroups = Array.isArray(parsed.groups) ? parsed.groups : [];
  const validIds = new Set(customers.map(c => c.id));
  const validConfidences = new Set(["high", "medium", "low"]);
  
  const validatedGroups: FuzzyDuplicateGroup[] = rawGroups
    .map((g: unknown): FuzzyDuplicateGroup | null => {
      if (!g || typeof g !== "object") return null;
      const obj = g as Record<string, unknown>;
      const idsRaw = Array.isArray(obj.ids) ? obj.ids : [];
      const ids = idsRaw
        .filter((id): id is string => typeof id === "string" && validIds.has(id))
        .slice(0, 3);
      if (ids.length < 2) return null;
      const reason = typeof obj.reason === "string" ? obj.reason : "表記揺れの可能性";
      const confidence = (typeof obj.confidence === "string" && validConfidences.has(obj.confidence))
        ? (obj.confidence as "high" | "medium" | "low")
        : "low";
      return { ids, reason, confidence };
    })
    .filter((g): g is FuzzyDuplicateGroup => g !== null);
  
  return {
    groups: validatedGroups,
    scannedAt: new Date().toISOString(),
    scannedCount: customers.length,
  };
}

export async function linkLineUser(customerId: string, lineUserId: string) {
  const { clinicId } = await checkAdminAuth();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createAdminClient(url, key);
  const { linkLineToCustomer } = await import("@/lib/line-links");
  const result = await linkLineToCustomer(
    lineUserId.trim(),
    customerId,
    clinicId,
    { linkedVia: "admin_manual" },
    supabase,
  );
  if (!result.ok) {
    console.error("linkLineUser error:", result.error);
    throw new Error(result.error);
  }
  revalidatePath("/admin/customers");
  return { success: true };
}

/** 指定 customer の特定 LINE 紐付けを解除（複数紐付き時に 1 件だけ消す）。 */
export async function unlinkSpecificLineLink(customerId: string, lineUserId: string) {
  const { clinicId } = await checkAdminAuth();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");
  const supabase = createAdminClient(url, key);
  const { unlinkLineFromCustomer } = await import("@/lib/line-links");
  const result = await unlinkLineFromCustomer(lineUserId, customerId, clinicId, supabase);
  if (!result.ok) throw new Error(result.error || "unlink failed");
  revalidatePath("/admin/customers");
  return { success: true };
}

export async function unlinkLineUser(customerId: string) {
  const { clinicId } = await checkAdminAuth();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createAdminClient(url, key);
  // この customer に紐付く全 LINE link を削除
  await supabase
    .from("customer_line_links")
    .delete()
    .eq("customer_id", customerId)
    .eq("clinic_id", clinicId);
  const { error } = await supabase
    .from("customers")
    .update({ line_user_id: null })
    .eq("id", customerId)
    .eq("clinic_id", clinicId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/customers");
}

/** 指定 customer に紐付いている LINE userId の一覧を返す（管理画面表示用）。 */
export async function getLineLinksForCustomer(customerId: string): Promise<{
  line_user_id: string;
  is_primary: boolean;
  display_label: string | null;
  linked_via: string | null;
  linked_at: string;
}[]> {
  await checkAdminAuth();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const supabase = createAdminClient(url, key);
  const { data } = await supabase
    .from("customer_line_links")
    .select("line_user_id, is_primary, display_label, linked_via, linked_at")
    .eq("customer_id", customerId)
    .order("is_primary", { ascending: false });
  return data ?? [];
}

/** 同じ LINE userId に紐付いている他 customer（家族メンバー）を返す。 */
export async function getFamilyMembersForCustomer(customerId: string): Promise<{
  customer_id: string;
  name: string;
  display_name: string | null;
  is_primary: boolean;
}[]> {
  await checkAdminAuth();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const supabase = createAdminClient(url, key);
  // 自分の LINE userId 一覧
  const { data: myLinks } = await supabase
    .from("customer_line_links")
    .select("line_user_id")
    .eq("customer_id", customerId);
  const lineIds = (myLinks ?? []).map((r: { line_user_id: string }) => r.line_user_id);
  if (lineIds.length === 0) return [];
  // 同じ LINE userId に紐付いている全 customer（自分も含む）
  const { data: family } = await supabase
    .from("customer_line_links")
    .select("customer_id, is_primary, customers!inner(name, display_name)")
    .in("line_user_id", lineIds);
  const seen = new Set<string>();
  const result: { customer_id: string; name: string; display_name: string | null; is_primary: boolean }[] = [];
  for (const row of family ?? []) {
    const id = (row as any).customer_id;
    if (id === customerId || seen.has(id)) continue;
    seen.add(id);
    const c = Array.isArray((row as any).customers) ? (row as any).customers[0] : (row as any).customers;
    if (!c) continue;
    result.push({
      customer_id: id,
      name: c.name,
      display_name: c.display_name ?? null,
      is_primary: Boolean((row as any).is_primary),
    });
  }
  return result;
}

/** 主紐付けを別 customer に切替える。 */
export async function setPrimaryLinkForCustomer(customerId: string, lineUserId: string) {
  const { clinicId } = await checkAdminAuth();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");
  const supabase = createAdminClient(url, key);
  const { setPrimaryLink } = await import("@/lib/line-links");
  const result = await setPrimaryLink(lineUserId, customerId, clinicId, supabase);
  if (!result.ok) throw new Error(result.error || "set primary failed");
  revalidatePath("/admin/customers");
  return { success: true };
}

// 最近LINEからメッセージを送ってきた未紐づけのユーザーIDを取得
export async function getRecentUnlinkedLineLogs(): Promise<{ user_id: string; message: string | null; created_at: string }[]> {
  await checkAdminAuth();

  // RLSをバイパスするためにservice roleキーで接続
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const supabase = createAdminClient(url, key);

  // line_debug_logsからユニークなuser_idを取得（最近のもの優先）
  const { data: logs, error: logsError } = await supabase
    .from("line_debug_logs")
    .select("user_id, message, created_at")
    .neq("user_id", "unknown")
    .order("created_at", { ascending: false })
    .limit(200);

  if (logsError) {
    console.error("line_debug_logs fetch error:", logsError);
    return [];
  }
  if (!logs || logs.length === 0) return [];

  // 既に紐づけ済みのLINE IDを取得
  const { data: linked } = await supabase
    .from("customers")
    .select("line_user_id")
    .not("line_user_id", "is", null);

  const linkedIds = new Set((linked || []).map((c: { line_user_id: string | null }) => c.line_user_id));

  // ユニーク化（最新のメッセージのみ）& 未紐づけのみ
  const seen = new Set<string>();
  const result: { user_id: string; message: string | null; created_at: string }[] = [];
  for (const log of logs) {
    if (!seen.has(log.user_id) && !linkedIds.has(log.user_id)) {
      seen.add(log.user_id);
      result.push({ user_id: log.user_id, message: log.message, created_at: log.created_at });
    }
    if (result.length >= 20) break;
  }
  return result;
}

export async function toggleBookingSuspension(customerId: string, suspend: boolean) {
  const { clinicId } = await checkAdminAuth();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createAdminClient(url, key);
  const { error } = await supabase
    .from("customers")
    .update({ booking_suspended: suspend })
    .eq("id", customerId)
    .eq("clinic_id", clinicId);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/customers");
}

// ===== 休眠患者への LINE 追客メッセージ送信 =====

export async function sendDormantLinePush(
  lineUserId: string,
  customerName: string,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await checkAdminAuth();

    const settings = await getClinicSettings();
    const token =
      settings?.line_channel_access_token ||
      process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!token) {
      return { success: false, error: "LINE_CHANNEL_ACCESS_TOKEN が未設定です" };
    }

    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: "text", text: message }],
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      console.error("[LINE追客送信失敗]", customerName, body);
      return { success: false, error: "LINE送信に失敗しました" };
    }

    return { success: true };
  } catch (err) {
    console.error("sendDormantLinePush error:", err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

// ===== リピート率・失客率 月別推移 =====

export type MonthlyVisitStat = {
  month: string;      // "2026-04"
  label: string;      // "4月"
  newPatients: number;
  returnPatients: number;
  total: number;
};

export async function getMonthlyVisitStats(months = 6): Promise<MonthlyVisitStat[]> {
  const { clinicId } = await checkAdminAuth();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const supabase = createAdminClient(url, key);

  const result: MonthlyVisitStat[] = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const startDate = `${monthStr}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const endDate = `${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

    const { data } = await supabase
      .from("cash_sales")
      .select("is_first_visit")
      .eq("clinic_id", clinicId)
      .gte("sale_date", startDate)
      .lte("sale_date", endDate);

    const rows = data ?? [];
    const newP = rows.filter((r: { is_first_visit: boolean | null }) => r.is_first_visit).length;
    const returnP = rows.filter((r: { is_first_visit: boolean | null }) => !r.is_first_visit).length;

    result.push({
      month: monthStr,
      label: `${month}月`,
      newPatients: newP,
      returnPatients: returnP,
      total: rows.length,
    });
  }

  return result;
}

// ===== CSV一括インポート =====

export type ImportCustomerRow = {
  name: string;
  phone?: string | null;
  birth_date?: string | null;   // "YYYY-MM-DD" or "YYYY/MM/DD"
  gender?: string | null;       // 男/女/その他
  city_name?: string | null;
  medical_record_number?: string | null;
  referral_source?: string | null;
  memo?: string | null;
};

export type ImportResult = {
  success: boolean;
  inserted: number;
  skipped: number;
  errors: { row: number; name: string; reason: string }[];
};

type CustomerInsertData = {
  name: string;
  clinic_id: string;
  phone?: string;
  birth_date?: string;
  birth_month?: number;
  gender?: string;
  city_name?: string;
  medical_record_number?: string;
  referral_source?: string;
};

function normalizeGender(val: string | null | undefined): string | null {
  if (!val) return null;
  const v = val.trim();
  if (v === "男" || v === "male" || v === "男性") return "male";
  if (v === "女" || v === "female" || v === "女性") return "female";
  if (v === "その他" || v === "other") return "other";
  return null;
}

function normalizeDate(val: string | null | undefined): string | null {
  if (!val) return null;
  // YYYY/MM/DD → YYYY-MM-DD
  const normalized = val.trim().replace(/\//g, "-");
  // 簡易バリデーション
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  return null;
}

export async function bulkImportCustomers(rows: ImportCustomerRow[]): Promise<ImportResult> {
  const { clinicId } = await checkAdminAuth();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createAdminClient(url, key);

  // 既存の名前+電話番号のセットを取得（重複チェック用）
  const { data: existing } = await supabase
    .from("customers")
    .select("name, phone")
    .eq("clinic_id", clinicId);

  const existingKeys = new Set(
    (existing || []).map((c) => `${c.name.trim()}__${(c.phone || "").trim()}`)
  );

  let inserted = 0;
  let skipped = 0;
  const errors: ImportResult["errors"] = [];
  const toInsert: CustomerInsertData[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    if (!row.name?.trim()) {
      errors.push({ row: rowNum, name: "(空)", reason: "患者名が空です" });
      continue;
    }

    const key = `${row.name.trim()}__${(row.phone || "").trim()}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    existingKeys.add(key); // 同一CSV内の重複も防ぐ

    const record: CustomerInsertData = {
      name: row.name.trim(),
      clinic_id: clinicId,
    };
    if (row.phone?.trim()) record.phone = row.phone.trim();
    const bd = normalizeDate(row.birth_date);
    if (bd) {
      record.birth_date = bd;
      record.birth_month = parseInt(bd.split("-")[1], 10);
    }
    const gender = normalizeGender(row.gender);
    if (gender) record.gender = gender;
    if (row.city_name?.trim()) record.city_name = row.city_name.trim();
    if (row.medical_record_number?.trim()) record.medical_record_number = row.medical_record_number.trim();
    if (row.referral_source?.trim()) record.referral_source = row.referral_source.trim();

    toInsert.push(record);
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("customers").insert(toInsert);
    if (error) throw new Error("一括登録に失敗しました: " + error.message);
    inserted = toInsert.length;
  }

  revalidatePath("/admin/customers");
  return { success: true, inserted, skipped, errors };
}
