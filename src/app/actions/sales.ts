"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth, requireRole } from "@/app/actions/auth";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

async function getSupabase() {
  return await createClient();
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key);
}


// --- Cash Sales Actions ---

// AI売上予測: 過去3ヶ月の履歴から最頻パターンを返す
export type SalesPrediction = {
  predictedAmount: number;
  predictedMemo: string;
  confidence: number;    // 0-100 (最頻パターンの割合%)
  historyCount: number;  // 3ヶ月の来院数
  aiMessage: string;
  lastAmount: number;
  warning: string | null;
};

export async function getSalesPrediction(customerName: string): Promise<SalesPrediction | null> {
  const { clinicId } = await checkAdminAuth();
  if (!customerName.trim()) return null;

  const supabase = await getSupabase();

  // 過去3ヶ月の売上履歴（名前完全一致）
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const fromDate = threeMonthsAgo.toISOString().split("T")[0];

  const { data } = await supabase
    .from("cash_sales")
    .select("treatment_fee, memo, sale_date")
    .eq("clinic_id", clinicId)
    .eq("customer_name", customerName.trim())
    .gte("sale_date", fromDate)
    .order("sale_date", { ascending: false });

  if (!data || data.length === 0) return null;

  // 最頻金額を特定
  const amountFreq: Record<number, number> = {};
  const memoFreq: Record<string, number> = {};
  for (const row of data) {
    amountFreq[row.treatment_fee] = (amountFreq[row.treatment_fee] || 0) + 1;
    if (row.memo) memoFreq[row.memo] = (memoFreq[row.memo] || 0) + 1;
  }

  const topAmount = Object.entries(amountFreq).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  const predictedAmount = Number(topAmount[0]);
  const predictedMemo = Object.entries(memoFreq).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] ?? "";
  const confidence = Math.round((Number(topAmount[1]) / data.length) * 100);
  const lastAmount = data[0].treatment_fee;

  // 直近と予測に大きな乖離があれば警告
  let warning: string | null = null;
  if (lastAmount !== predictedAmount && Math.abs(predictedAmount - lastAmount) > predictedAmount * 0.3) {
    warning = `前回（${lastAmount.toLocaleString()}円）と予測（${predictedAmount.toLocaleString()}円）に差があります。確認してください。`;
  }

  const timeLabel = data.length === 1 ? "前回" : `${data.length}回中${Number(topAmount[1])}回`;
  const aiMessage = `${customerName}様は${timeLabel}このメニューです。仮入力しておきました！確認をお願いします。`;

  return { predictedAmount, predictedMemo, confidence, historyCount: data.length, aiMessage, lastAmount, warning };
}

// 今日の売上未入力患者リスト（一括入力画面用）
export type PendingSalePatient = {
  appointmentId: string;
  customerName: string;
  isFirstVisit: boolean;
  checkinTime: string;
  checkinStatus: string | null;
  confidence: "certain" | "likely" | "unknown";
  prediction?: SalesPrediction | null;
  /** 予約時に選ばれていたコース（snapshot 名）。null なら未選択。 */
  reservedCourseName: string | null;
  /** 予約コースから算出した提案金額。is_first_visit に応じて first_visit_price / price を選ぶ。 */
  reservedCoursePrice: number | null;
  /** 金額の元情報の出所。bulk画面で表示バッジを切り替えるのに使う。 */
  amountSource: "course" | "ai" | "empty";
  /** bulk画面で初期表示する金額（コース > AI > 空欄 の優先順位） */
  initialAmount: string;
  /** bulk画面で初期表示するメモ（コース名 > AI予測メモ > "" の優先順位） */
  initialMemo: string;
};

function getJstDateString(date = new Date()) {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function buildJstDayRange(dateStr: string) {
  return {
    dayStart: `${dateStr}T00:00:00+09:00`,
    dayEnd: `${dateStr}T23:59:59+09:00`,
  };
}

function getAppointmentCustomerName(customer: { name?: string } | { name?: string }[] | null) {
  if (Array.isArray(customer)) {
    return customer[0]?.name?.trim() ?? "";
  }
  return customer?.name?.trim() ?? "";
}

function getConfidence(checkinStatus: string | null): "certain" | "likely" | "unknown" {
  if (checkinStatus === "done" || checkinStatus === "in_treatment") return "certain";
  if (checkinStatus === "arrived") return "likely";
  return "unknown";
}

export async function getTodayPendingSales(dateStr?: string): Promise<{ success: boolean; data: PendingSalePatient[]; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = getAdminSupabase() ?? await getSupabase();
    const targetDate = dateStr ?? getJstDateString();
    const { dayStart, dayEnd } = buildJstDayRange(targetDate);

    // 指定日の「会計完了」予約を取得（コース情報も snapshot として一緒に取る）
    const { data: appointments, error: aptError } = await supabase
      .from("appointments")
      .select("id, is_first_visit, start_time, checkin_status, status, course_id, course_name, customers(name)")
      .eq("clinic_id", clinicId)
      .neq("status", "cancelled")
      .gte("start_time", dayStart)
      .lte("start_time", dayEnd);

    if (aptError) throw aptError;
    if (!appointments || appointments.length === 0) return { success: true, data: [] };

    // 予約で参照されている course_id の最新マスタ価格を一括取得（N+1 回避）。
    // course_id snapshot が削除済みコースを指していると null。その場合は AI 履歴フォールバック。
    const courseIds = Array.from(new Set(
      (appointments as Array<{ course_id?: string | null }>)
        .map((a) => a.course_id ?? null)
        .filter((id): id is string => !!id)
    ));
    type CourseMasterRow = { id: string; name: string; price: number | null; first_visit_price: number | null };
    let courseMaster: Map<string, CourseMasterRow> = new Map();
    if (courseIds.length > 0) {
      const { data: courseRows } = await supabase
        .from("reservation_courses")
        .select("id, name, price, first_visit_price")
        .eq("clinic_id", clinicId)
        .in("id", courseIds);
      courseMaster = new Map((courseRows ?? []).map((c) => [c.id as string, c as CourseMasterRow]));
    }

    // 指定日の既存売上を取得（名前で照合）
    const { data: existingSales } = await supabase
      .from("cash_sales")
      .select("customer_name")
      .eq("clinic_id", clinicId)
      .eq("sale_date", targetDate);

    const enteredCounts = new Map<string, number>();
    for (const sale of existingSales ?? []) {
      const normalizedName = sale.customer_name?.trim();
      if (!normalizedName) continue;
      enteredCounts.set(normalizedName, (enteredCounts.get(normalizedName) ?? 0) + 1);
    }

    // 売上未入力の患者だけ抽出して、コース価格 → AI履歴 → 空欄 の順で元情報を決める
    const pending: PendingSalePatient[] = [];
    for (const apt of appointments as Array<{
      id: string;
      is_first_visit: boolean | null;
      start_time: string;
      checkin_status: string | null;
      status: string;
      course_id: string | null;
      course_name: string | null;
      customers: { name?: string } | { name?: string }[] | null;
    }>) {
      const customerName = getAppointmentCustomerName(apt.customers);
      if (!customerName) continue;
      const currentEnteredCount = enteredCounts.get(customerName) ?? 0;
      if (currentEnteredCount > 0) {
        enteredCounts.set(customerName, currentEnteredCount - 1);
        continue;
      }

      const isFirstVisit = apt.is_first_visit ?? false;

      // ── 第1優先: 予約時のコース価格 ──
      // course_id がマスタに残っていれば、初診→first_visit_price（無ければprice）、再診→price
      let reservedCoursePrice: number | null = null;
      const courseRow = apt.course_id ? courseMaster.get(apt.course_id) ?? null : null;
      if (courseRow) {
        if (isFirstVisit) {
          reservedCoursePrice = courseRow.first_visit_price ?? courseRow.price ?? null;
        } else {
          reservedCoursePrice = courseRow.price ?? null;
        }
      }

      // ── 第2優先: AI履歴予測（コース価格が無い時だけ計算） ──
      let prediction: SalesPrediction | null = null;
      if (reservedCoursePrice == null && !isFirstVisit) {
        const { data: hist } = await supabase
          .from("cash_sales")
          .select("treatment_fee, memo, sale_date")
          .eq("clinic_id", clinicId)
          .eq("customer_name", customerName)
          .gte("sale_date", getJstDateString(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)))
          .order("sale_date", { ascending: false });

        if (hist && hist.length > 0) {
          const amtFreq: Record<number, number> = {};
          const memoFreq: Record<string, number> = {};
          for (const row of hist) {
            amtFreq[row.treatment_fee] = (amtFreq[row.treatment_fee] || 0) + 1;
            if (row.memo) memoFreq[row.memo] = (memoFreq[row.memo] || 0) + 1;
          }
          const topAmt = Object.entries(amtFreq).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
          const predAmt = Number(topAmt[0]);
          const predMemo = Object.entries(memoFreq).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] ?? "";
          const conf = Math.round((Number(topAmt[1]) / hist.length) * 100);
          const lastAmt = hist[0].treatment_fee;
          const label = hist.length === 1 ? "前回" : `${hist.length}回中${Number(topAmt[1])}回`;
          let warn: string | null = null;
          if (lastAmt !== predAmt && Math.abs(predAmt - lastAmt) > predAmt * 0.3) {
            warn = `前回（${lastAmt.toLocaleString()}円）と予測（${predAmt.toLocaleString()}円）に差があります`;
          }
          prediction = {
            predictedAmount: predAmt,
            predictedMemo: predMemo,
            confidence: conf,
            historyCount: hist.length,
            aiMessage: `${customerName}様は${label}このメニューです。確認をお願いします！`,
            lastAmount: lastAmt,
            warning: warn,
          };
        }
      }

      // 元情報の出所と初期値を決定
      const reservedCourseName = apt.course_name ?? courseRow?.name ?? null;
      let amountSource: "course" | "ai" | "empty";
      let initialAmount = "";
      let initialMemo = "";
      if (reservedCoursePrice != null) {
        amountSource = "course";
        initialAmount = String(reservedCoursePrice);
        initialMemo = reservedCourseName ?? "";
      } else if (prediction) {
        amountSource = "ai";
        initialAmount = String(prediction.predictedAmount);
        initialMemo = prediction.predictedMemo;
      } else {
        amountSource = "empty";
      }

      pending.push({
        appointmentId: apt.id,
        customerName,
        isFirstVisit,
        checkinTime: apt.start_time,
        checkinStatus: apt.checkin_status ?? null,
        confidence: getConfidence(apt.checkin_status ?? null),
        prediction,
        reservedCourseName,
        reservedCoursePrice,
        amountSource,
        initialAmount,
        initialMemo,
      });
    }

    return { success: true, data: pending };
  } catch (error) {
    console.error("Error fetching pending sales:", error);
    return { success: false, data: [], error: "取得に失敗しました" };
  }
}

// 支払区分は payment_categories マスタで管理（院ごとに追加・編集可）。
// 型は string に緩めて、validation は DB レベルで行う（FK 強制ではなく、
// 値の存在チェックは UI 側の listPaymentCategories に委譲）。
// 互換のため、self_pay は「指定なし=自費通常」として扱う。
export type CashSalePaymentType = string;

function normalizePaymentType(value: unknown): CashSalePaymentType | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  // 50 文字制限と非空文字のみチェック。具体的な key 妥当性は payment_categories の参照側で判定。
  if (v.length > 50) return null;
  return v;
}

export async function bulkAddCashSales(rows: Array<{
  customer_name: string;
  treatment_fee: number;
  memo: string;
  is_first_visit: boolean;
  sale_date: string;
  payment_type?: CashSalePaymentType | null;
}>) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.from("cash_sales").insert(
      rows.map(r => ({
        customer_name: r.customer_name,
        treatment_fee: r.treatment_fee,
        memo: r.memo,
        is_first_visit: r.is_first_visit,
        sale_date: r.sale_date,
        payment_type: normalizePaymentType(r.payment_type),
        clinic_id: clinicId,
      }))
    );
    if (error) throw error;
    revalidatePath("/admin/sales");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error bulk adding cash sales:", error);
    return { success: false, error: "一括保存に失敗しました" };
  }
}

// 売上登録用: 患者名で過去の cash_sales から候補を返す
export type SalesPatientSuggestion = {
  customer_name: string;
  lastAmount: number;        // 直近の金額
  lastSaleDate: string;      // "yyyy-MM-dd"
  daysSinceLastVisit: number;
  visitCount: number;
};

/**
 * カルテ番号で customers を検索。完全一致が1件→顧客返却、複数ヒット→候補配列で返す。
 * 売上登録画面でカルテ番号入力時に名前を自動引き出すために使う。
 */
export async function getCustomerByMedicalRecord(
  medicalRecordNumber: string,
): Promise<{ ok: true; customers: { id: string; name: string; phone: string | null }[] } | { ok: false; error: string }> {
  try {
    const { clinicId } = await checkAdminAuth();
    const num = medicalRecordNumber.trim();
    if (!num) return { ok: false, error: "カルテ番号が空です" };

    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone")
      .eq("clinic_id", clinicId)
      .eq("medical_record_number", num)
      .limit(5);

    if (error) {
      console.error("[getCustomerByMedicalRecord] error:", error);
      return { ok: false, error: error.message };
    }
    return { ok: true, customers: (data ?? []).map((c: any) => ({ id: c.id, name: c.name, phone: c.phone })) };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "unknown" };
  }
}

export async function searchSalesPatients(name: string): Promise<SalesPatientSuggestion[]> {
  const { clinicId } = await checkAdminAuth();
  if (!name.trim()) return [];

  const supabase = await getSupabase();

  // 名前部分一致で過去の売上を取得（直近20件）
  const { data } = await supabase
    .from("cash_sales")
    .select("customer_name, treatment_fee, sale_date")
    .eq("clinic_id", clinicId)
    .ilike("customer_name", `%${name.trim()}%`)
    .order("sale_date", { ascending: false })
    .limit(50);

  if (!data || data.length === 0) return [];

  // 名前ごとに集約
  const byName: Record<string, { lastAmount: number; lastSaleDate: string; visitCount: number }> = {};
  for (const row of data) {
    const n = row.customer_name as string;
    if (!byName[n]) {
      byName[n] = { lastAmount: row.treatment_fee, lastSaleDate: row.sale_date, visitCount: 1 };
    } else {
      byName[n].visitCount++;
      // sale_date 降順で取得しているので最初のレコードが最新
    }
  }

  const today = new Date();
  return Object.entries(byName)
    .map(([customer_name, info]) => ({
      customer_name,
      lastAmount: info.lastAmount,
      lastSaleDate: info.lastSaleDate,
      daysSinceLastVisit: Math.floor(
        (today.getTime() - new Date(info.lastSaleDate).getTime()) / (1000 * 60 * 60 * 24)
      ),
      visitCount: info.visitCount,
    }))
    .sort((a, b) => a.daysSinceLastVisit - b.daysSinceLastVisit)
    .slice(0, 8);
}

export async function addCashSale(formData: FormData) {
  const auth = await checkAdminAuth();
  const { clinicId } = auth;
  try {
    const saleDate = formData.get("sale_date") as string;
    const customerName = formData.get("customer_name") as string;
    const treatmentFee = parseInt(formData.get("treatment_fee") as string, 10);
    const memo = formData.get("memo") as string || "";
    const isFirstVisit = formData.get("is_first_visit") === "true";
    const paymentType = normalizePaymentType(formData.get("payment_type"));

    if (!saleDate || !customerName || isNaN(treatmentFee) || treatmentFee < 0) {
      return { success: false, error: "必須項目を入力してください" };
    }
    // 0 円計上時は支払区分（自賠責/はぐくみ/その他）を必須にする。
    // 通常の自費で 0 円は誤入力の可能性が高いため。
    if (treatmentFee === 0 && (!paymentType || paymentType === "self_pay")) {
      return { success: false, error: "0円で登録する場合は支払区分（自賠責・はぐくみ医療など）を選択してください" };
    }

    const supabase = await getSupabase();
    const saleData: any = {
      sale_date: saleDate,
      customer_name: customerName,
      treatment_fee: treatmentFee,
      memo,
      is_first_visit: isFirstVisit,
      payment_type: paymentType,
      clinic_id: clinicId
    };

    // tenant-isolation-ignore: saleData.clinic_id は L418 で設定済み
    const { error } = await supabase
      .from("cash_sales")
      .insert([saleData]);

    if (error) throw error;

    // ポイント加算（売上記帳 1 件 = 8pt）
    const { awardPoints } = await import("@/lib/gamification");
    await awardPoints({
      clinicId,
      userId: auth.userId,
      userEmail: auth.email,
      reason: "sales.record",
      sourceTable: "cash_sales",
    });

    revalidatePath("/admin/sales");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error adding cash sale:", error);
    return { success: false, error: "保存に失敗しました" };
  }
}

export async function getCashSales(dateStr: string) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    // Migration完了につき clinic_id フィルタを有効化
    let query = supabase
      .from("cash_sales")
      .select("*")
      .eq("sale_date", dateStr)
      .eq("clinic_id", clinicId);

    const { data, error } = await query
      .order("created_at", { ascending: true });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error fetching cash sales:", error);
    return { success: false, error: "取得に失敗しました", data: [] };
  }
}

export async function updateCashSale(formData: FormData) {
  await requireRole(["owner", "admin"]);
  const { clinicId } = await checkAdminAuth();
  try {
    const id = formData.get("id") as string;
    const saleDate = formData.get("sale_date") as string;
    const customerName = ((formData.get("customer_name") as string) ?? "").trim();
    // 金額は整数のみ許可。"5000abc" や 小数を弾く（parseInt は前者を通すため Number+isInteger）
    const feeRaw = (formData.get("treatment_fee") as string) ?? "";
    const treatmentFee = Number(feeRaw);
    const memo = (formData.get("memo") as string) ?? "";
    const isFirstVisit = formData.get("is_first_visit") === "true";
    const paymentType = normalizePaymentType(formData.get("payment_type"));

    if (!id) {
      return { success: false, error: "ID が指定されていません" };
    }
    if (!saleDate || !customerName) {
      return { success: false, error: "日付とお名前を入力してください" };
    }
    if (!Number.isInteger(treatmentFee) || treatmentFee < 0) {
      return { success: false, error: "金額は0以上の整数で入力してください" };
    }
    if (treatmentFee === 0 && (!paymentType || paymentType === "self_pay")) {
      return { success: false, error: "0円に修正する場合は支払区分（自賠責・はぐくみ医療など）を選択してください" };
    }

    const supabase = await getSupabase();
    const { error } = await supabase
      .from("cash_sales")
      .update({
        sale_date: saleDate,
        customer_name: customerName,
        treatment_fee: treatmentFee,
        memo,
        is_first_visit: isFirstVisit,
        payment_type: paymentType,
      })
      .eq("id", id)
      .eq("clinic_id", clinicId); // 他院のレコードを誤って書き換えない安全策

    if (error) throw error;

    revalidatePath("/admin/sales");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error updating cash sale:", error);
    return { success: false, error: "更新に失敗しました" };
  }
}

export async function deleteCashSale(id: string) {
  await requireRole(["owner", "admin"]);
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("cash_sales")
      .delete()
      .eq("clinic_id", clinicId)
      .eq("id", id);

    if (error) throw error;

    revalidatePath("/admin/sales");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error deleting cash sale:", error);
    return { success: false, error: "削除に失敗しました" };
  }
}

// --- Insurance Payment Actions ---

export async function addInsurancePayment(formData: FormData) {
  const { clinicId } = await checkAdminAuth();
  try {
    const paymentMonth = formData.get("payment_month") as string; // "YYYY-MM-01"
    const insuranceName = formData.get("insurance_name") as string;
    const amount = parseInt(formData.get("amount") as string, 10);
    const paymentDate = (formData.get("payment_date") as string) || null;
    const imageUrl = (formData.get("image_url") as string) || null;
    const notes = (formData.get("notes") as string) || null;

    if (!paymentMonth || !insuranceName || isNaN(amount)) {
      return { success: false, error: "必須項目を入力してください" };
    }

    const supabase = await getSupabase();
    const { error } = await supabase
      .from("insurance_payments")
      .insert([{
        payment_month: paymentMonth,
        insurance_name: insuranceName,
        amount,
        payment_date: paymentDate,
        image_url: imageUrl,
        notes,
        clinic_id: clinicId
      }]);

    if (error) throw error;

    revalidatePath("/admin/insurance");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error adding insurance payment:", error);
    return { success: false, error: "保存に失敗しました" };
  }
}

export async function getInsurancePayments(monthStr: string) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("insurance_payments")
      .select("*")
      .eq("payment_month", monthStr)
      .eq("clinic_id", clinicId)
      .order("payment_date", { ascending: true });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error fetching insurance payments:", error);
    return { success: false, error: "取得に失敗しました", data: [] };
  }
}

export async function updateInsurancePayment(id: string, data: {
  insurance_name: string;
  amount: number;
  payment_date: string | null;
  notes: string | null;
}) {
  await requireRole(["owner", "admin"]);
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("insurance_payments")
      .update({
        insurance_name: data.insurance_name,
        amount: data.amount,
        payment_date: data.payment_date || null,
        notes: data.notes || null,
      })
      .eq("id", id)
      .eq("clinic_id", clinicId);

    if (error) throw error;
    revalidatePath("/admin/insurance");
    return { success: true };
  } catch (error) {
    console.error("Error updating insurance payment:", error);
    return { success: false, error: "更新に失敗しました" };
  }
}

export async function updateInsurancePassbookCheck(id: string, checked: boolean) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("insurance_payments")
      .update({ passbook_checked: checked })
      .eq("id", id)
      .eq("clinic_id", clinicId);

    if (error) throw error;
    revalidatePath("/admin/insurance");
    return { success: true };
  } catch (error) {
    console.error("Error updating passbook check:", error);
    return { success: false, error: "更新に失敗しました" };
  }
}

export async function deleteInsurancePayment(id: string) {
  await requireRole(["owner", "admin"]);
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("insurance_payments")
      .delete()
      .eq("id", id)
      .eq("clinic_id", clinicId);

    if (error) throw error;

    revalidatePath("/admin/insurance");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error deleting insurance payment:", error);
    return { success: false, error: "削除に失敗しました" };
  }
}

// --- Revenue Statistics ---

export async function getMonthlyTotalRevenue(year: number, month: number) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
    const startOfMonth = `${monthStr}-01`;
    const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

    // Get Cash Sales
    const { data: cashData, error: cashErr } = await supabase
      .from("cash_sales")
      .select("treatment_fee")
      .eq("clinic_id", clinicId)
      .gte("sale_date", startOfMonth)
      .lte("sale_date", endOfMonth);

    if (cashErr) throw cashErr;

    // Get Insurance Payments
    const { data: insuranceData, error: insErr } = await supabase
      .from("insurance_payments")
      .select("amount")
      .eq("clinic_id", clinicId)
      .eq("payment_month", startOfMonth);

    if (insErr) throw insErr;

    const cashTotal = (cashData || []).reduce((sum, item) => sum + item.treatment_fee, 0);
    const insuranceTotal = (insuranceData || []).reduce((sum, item) => sum + item.amount, 0);

    return {
      success: true,
      data: {
        cash: cashTotal,
        insurance: insuranceTotal,
        total: cashTotal + insuranceTotal
      }
    };
  } catch (error) {
    console.error("Error calculating monthly revenue:", error);
    return { success: false, error: "計算に失敗しました", data: { cash: 0, insurance: 0, total: 0 } };
  }
}

export async function getDailySalesSummary(dateStr: string) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("cash_sales")
      .select("treatment_fee")
      .eq("clinic_id", clinicId)
      .eq("sale_date", dateStr);

    if (error) throw error;
    const total = (data || []).reduce((sum, item) => sum + item.treatment_fee, 0);
    return { success: true, total };
  } catch (error) {
    return { success: false, total: 0 };
  }
}

// --- Expense Actions ---

export async function addExpense(formData: FormData) {
  const { clinicId } = await checkAdminAuth();
  try {
    const expenseDate = formData.get("expense_date") as string;
    const category = formData.get("category") as string;
    const description = formData.get("description") as string || "";
    const amount = parseInt(formData.get("amount") as string, 10);
    const memo = formData.get("memo") as string || "";
    const imageUrl = formData.get("image_url") as string || "";

    if (!expenseDate || !category || isNaN(amount)) {
      return { success: false, error: "必須項目を入力してください" };
    }

    const supabase = await getSupabase();
    const { error } = await supabase
      .from("clinic_expenses")
      .insert([{ 
        expense_date: expenseDate, 
        category, 
        description, 
        amount, 
        memo,
        image_url: imageUrl,
        clinic_id: clinicId
      }]);

    if (error) throw error;

    revalidatePath("/admin/expenses");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error adding expense:", error);
    return { success: false, error: "保存に失敗しました" };
  }
}

export async function getExpenses(dateStr: string) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("clinic_expenses")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("expense_date", dateStr)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error fetching expenses:", error);
    return { success: false, error: "取得に失敗しました", data: [] };
  }
}

export async function getMonthDetailedExpenses(year: number, month: number) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
    const startOfMonth = `${monthStr}-01`;
    const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

    const { data, error } = await supabase
      .from("clinic_expenses")
      .select("*")
      .eq("clinic_id", clinicId)
      .gte("expense_date", startOfMonth)
      .lte("expense_date", endOfMonth)
      .order("expense_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error fetching monthly detailed expenses:", error);
    return { success: false, error: "取得に失敗しました", data: [] };
  }
}

export async function updateExpense(id: string, data: {
  expense_date?: string;
  category?: string;
  description?: string;
  amount?: number;
  memo?: string;
}) {
  await requireRole(["owner", "admin"]);
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("clinic_expenses")
      .update(data)
      .eq("id", id)
      .eq("clinic_id", clinicId);

    if (error) throw error;

    revalidatePath("/admin/expenses");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error updating expense:", error);
    return { success: false, error: "更新に失敗しました" };
  }
}

export async function deleteExpense(id: string) {
  await requireRole(["owner", "admin"]);
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("clinic_expenses")
      .delete()
      .eq("id", id)
      .eq("clinic_id", clinicId);

    if (error) throw error;

    revalidatePath("/admin/expenses");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error deleting expense:", error);
    return { success: false, error: "削除に失敗しました" };
  }
}

export async function getMonthlyExpenses(year: number, month: number) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
    const startOfMonth = `${monthStr}-01`;
    const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

    const { data, error } = await supabase
      .from("clinic_expenses")
      .select("amount, category")
      .eq("clinic_id", clinicId)
      .gte("expense_date", startOfMonth)
      .lte("expense_date", endOfMonth);

    if (error) throw error;
    const total = (data || []).reduce((sum, item) => sum + item.amount, 0);
    const byCategory: Record<string, number> = {};
    (data || []).forEach(item => {
      byCategory[item.category] = (byCategory[item.category] || 0) + item.amount;
    });

    return { success: true, data: { total, byCategory } };
  } catch (error) {
    console.error("Error calculating monthly expenses:", error);
    return { success: false, data: { total: 0, byCategory: {} } };
  }
}

// --- Business Context for AI Chat ---

export async function getBusinessContext() {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const now = new Date();
    const jstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const dateStr = jstNow.toISOString().split('T')[0];
    const year = jstNow.getUTCFullYear();
    const month = jstNow.getUTCMonth() + 1;
    const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
    const startOfMonth = `${monthStr}-01`;
    const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

    // 1. Monthly Revenue
    const revenueRes = await getMonthlyTotalRevenue(year, month);

    // 2. Monthly Expenses
    const expenseRes = await getMonthlyExpenses(year, month);

    // 3. Today's Sales
    const todaySales = await getDailySalesSummary(dateStr);

    // 4. Today's Appointments
    const startOfDay = `${dateStr}T00:00:00+09:00`;
    const endOfDay = `${dateStr}T23:59:59+09:00`;
    let todayAppts: any[] = [];
    try {
      const { data } = await supabase
        .from("appointments")
        .select("id, start_time, status, is_first_visit, customers(name)")
        .eq("clinic_id", clinicId)
        .gte("start_time", startOfDay)
        .lte("start_time", endOfDay)
        .neq("status", "cancelled");
      todayAppts = data || [];
    } catch (e) {
      console.error("[AI_CONTEXT_LOG] Error fetching today's appointments:", e);
    }

    // 5. This month's total appointments
    let monthAppts: any[] = [];
    try {
      const { data } = await supabase
        .from("appointments")
        .select("id, is_first_visit")
        .eq("clinic_id", clinicId)
        .gte("start_time", `${startOfMonth}T00:00:00+09:00`)
        .lte("start_time", `${endOfMonth}T23:59:59+09:00`)
        .neq("status", "cancelled");
      monthAppts = data || [];
    } catch (e) {
      console.error("[AI_CONTEXT_LOG] Error fetching month's appointments:", e);
    }

    // 6. Monthly Target
    let targetData: any = null;
    try {
      const { data } = await supabase
        .from("clinic_targets")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("month", startOfMonth)
        .maybeSingle();
      targetData = data;
    } catch (e) {
      console.error("[AI_CONTEXT_LOG] Error fetching target:", e);
    }

    // 7. Total customers
    let totalCustomers = 0;
    try {
      const { count } = await supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId);
      totalCustomers = count || 0;
    } catch (e) {
      console.error("[AI_CONTEXT_LOG] Error fetching customers count:", e);
    }

    const targetIncome = targetData?.target_income || 1500000;
    const monthlyRevenue = revenueRes.data?.total || 0;
    const monthlyExpense = expenseRes.data?.total || 0;
    const daysInMonth = new Date(year, month, 0).getDate();
    const dayOfMonth = jstNow.getUTCDate();
    const remainingDays = daysInMonth - dayOfMonth;
    const monthlyProfit = monthlyRevenue - monthlyExpense;

    return {
      success: true,
      context: `
【本日の日付】${dateStr}（${month}月${dayOfMonth}日）

【今月の売上目標】¥${targetIncome.toLocaleString()}
【今月の売上実績（自費+保険）】¥${monthlyRevenue.toLocaleString()}（達成率: ${Math.round((monthlyRevenue / targetIncome) * 100)}%）
  - 自費売上: ¥${(revenueRes.data?.cash || 0).toLocaleString()}
  - 保険入金: ¥${(revenueRes.data?.insurance || 0).toLocaleString()}
【目標までの不足額】¥${Math.max(0, targetIncome - monthlyRevenue).toLocaleString()}
【残り日数】${remainingDays}日（1日あたり必要額: ¥${remainingDays > 0 ? Math.ceil(Math.max(0, targetIncome - monthlyRevenue) / remainingDays).toLocaleString() : '---'}）

【今月の経費合計】¥${monthlyExpense.toLocaleString()}
【今月の利益（売上-経費）】¥${monthlyProfit.toLocaleString()}
${Object.entries(expenseRes.data?.byCategory || {}).map(([cat, amt]) => `  - ${cat}: ¥${(amt as number).toLocaleString()}`).join('\n')}

【本日の予約数】${todayAppts.length}件
  - 初診: ${todayAppts.filter(a => a.is_first_visit).length}件
  - 再診: ${todayAppts.filter(a => !a.is_first_visit).length}件
【本日の売上】¥${(todaySales.total || 0).toLocaleString()}

【今月の延べ来院数】${monthAppts.length}件
  - 新規: ${monthAppts.filter(a => a.is_first_visit).length}件
  - 再診: ${monthAppts.filter(a => !a.is_first_visit).length}件
【登録患者総数】${totalCustomers}名
`.trim()
    };
  } catch (error) {
    console.error("Error gathering business context:", error);
    return { success: false, context: "ビジネスデータの取得に失敗しました。" };
  }
}

export async function getTodayDashboardData() {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    // Get JST today
    const now = new Date();
    const jstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const dateStr = jstNow.toISOString().split('T')[0];
    const year = jstNow.getUTCFullYear();
    const month = jstNow.getUTCMonth() + 1;

    console.log(`[DASHBOARD_LOG] Fetching data for ${dateStr}`);

    // 1. Monthly Revenue
    let revenueRes;
    try {
      revenueRes = await getMonthlyTotalRevenue(year, month);
    } catch (e) {
      console.error("[DASHBOARD_LOG] Error in getMonthlyTotalRevenue:", e);
      revenueRes = { success: false, data: { cash: 0, insurance: 0, total: 0 } };
    }
    
    // 2. Today's Cash Sales
    let todaySales;
    try {
      todaySales = await getDailySalesSummary(dateStr);
    } catch (e) {
      console.error("[DASHBOARD_LOG] Error in getDailySalesSummary:", e);
      todaySales = { success: false, total: 0 };
    }

    // 3. Today's Appointments (Detailed)
    const startOfDay = `${dateStr}T00:00:00+09:00`;
    const endOfDay = `${dateStr}T23:59:59+09:00`;

    let appointments: any[] = [];
    try {
      const { data, error: aptErr } = await supabase
        .from("appointments")
        .select(`
          id,
          start_time,
          status,
          checkin_status,
          is_first_visit,
          course_name,
          customer_id,
          customers (
            name,
            phone
          )
        `)
        .eq("clinic_id", clinicId)
        .gte("start_time", startOfDay)
        .lte("start_time", endOfDay)
        .neq("status", "cancelled")
        .order("start_time", { ascending: true });
      
      if (aptErr) throw aptErr;
      appointments = data || [];
    } catch (e) {
      console.error("[DASHBOARD_LOG] Error fetching appointments:", e);
    }

    // 4. Monthly Target
    let targetIncome = 1500000;
    let targetSnsTasks = 0;
    try {
      const { data: target } = await supabase
        .from("clinic_targets")
        .select("target_income, target_sns_tasks")
        .eq("clinic_id", clinicId)
        .eq("month", `${year}-${month.toString().padStart(2, '0')}-01`)
        .maybeSingle();
      if (target?.target_income) targetIncome = target.target_income;
      if (target?.target_sns_tasks) targetSnsTasks = target.target_sns_tasks;
    } catch (e) {
      console.error("[DASHBOARD_LOG] Error fetching target:", e);
    }

    // 4b. Monthly SNS Tasks (completed this month)
    let monthlySnsDone = 0;
    try {
      const firstDay = `${year}-${month.toString().padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const lastDayStr = `${year}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
      const { data: snsDone } = await supabase
        .from("daily_tasks")
        .select("id", { count: "exact" })
        .eq("clinic_id", clinicId)
        .gte("task_date", firstDay)
        .lte("task_date", lastDayStr)
        .eq("status", "completed");
      monthlySnsDone = snsDone?.length ?? 0;
    } catch (e) {
      console.error("[DASHBOARD_LOG] Error fetching SNS tasks:", e);
    }

    // 5. Monthly Expenses
    let monthlyExpenses = 0;
    try {
      const expenseRes = await getMonthlyExpenses(year, month);
      monthlyExpenses = expenseRes.data?.total || 0;
    } catch (e) {
      console.error("[DASHBOARD_LOG] Error fetching expenses:", e);
    }

    // 6. AI Suggestions from Monthly Evaluations
    let aiSuggestions = null;
    try {
      const { data: evalData } = await supabase
        .from("monthly_evaluations")
        .select("ai_suggestions")
        .eq("clinic_id", clinicId)
        .eq("month", `${year}-${month.toString().padStart(2, '0')}-01`)
        .maybeSingle();
      aiSuggestions = evalData?.ai_suggestions || null;
    } catch (e) {
      console.error("[DASHBOARD_LOG] Error fetching evaluations:", e);
    }

    // 7. Daily tasks
    let dailyTasks = [];
    try {
      const { data } = await supabase
        .from("daily_tasks")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("task_date", dateStr)
        .order("created_at", { ascending: true });
      dailyTasks = data || [];
    } catch (e) {
      console.error("[DASHBOARD_LOG] Error fetching tasks:", e);
    }

    return {
      success: true,
      data: {
        dateStr,
        monthlyRevenue: revenueRes.data,
        monthlyExpenses,
        todaySales: todaySales.total,
        appointments: appointments.map((a: any) => ({
          time: new Date(a.start_time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }),
          name: (a.customers as any)?.name || "不明",
          phone: (a.customers as any)?.phone || "",
          customer_id: a.customer_id || null,
          type: a.is_first_visit ? "初診" : "再診",
          status: a.status,
          checkin_status: a.checkin_status ?? null,
          course_name: a.course_name ?? null,
        })),
        targetIncome,
        targetSnsTasks,
        monthlySnsDone,
        aiSuggestions,
        dailyTasks
      }
    };
  } catch (error) {
    console.error("[DASHBOARD_LOG] Critical Dashboard data fetch error:", error);
    return { success: false, error: "ダッシュボードデータの取得中に深刻なエラーが発生しました。" };
  }
}

// ===== 確定申告サポート: 年間データ取得 =====

import type { AnnualTaxReportData } from "@/lib/annual-tax-report";

export async function getAnnualTaxData(
  year: number,
): Promise<{ success: boolean; data?: AnnualTaxReportData; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();

    // クリニック名取得（clinic_settings は id がclinic_id を兼ねる）
    const { data: settings } = await supabase
      .from("clinic_settings")
      .select("clinic_name")
      .eq("id", clinicId)
      .maybeSingle();
    const clinicName = (settings as any)?.clinic_name ?? "クリニック";

    // 12ヶ月分を並列取得
    const monthlyResults = await Promise.all(
      Array.from({ length: 12 }, async (_, i) => {
        const month = i + 1;
        const monthStr = `${year}-${String(month).padStart(2, "0")}`;
        const startDate = `${monthStr}-01`;
        const daysInMonth = new Date(year, month, 0).getDate();
        const endDate = `${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

        const [cashRes, insRes, expRes, salesRes] = await Promise.all([
          // 自費収入
          supabase
            .from("cash_sales")
            .select("treatment_fee, is_first_visit")
            .eq("clinic_id", clinicId)
            .gte("sale_date", startDate)
            .lte("sale_date", endDate),
          // 保険収入
          supabase
            .from("insurance_payments")
            .select("amount")
            .eq("clinic_id", clinicId)
            .eq("payment_month", startDate),
          // 経費
          supabase
            .from("clinic_expenses")
            .select("amount, category")
            .eq("clinic_id", clinicId)
            .gte("expense_date", startDate)
            .lte("expense_date", endDate),
          // 来院数（自費）
          supabase
            .from("cash_sales")
            .select("is_first_visit")
            .eq("clinic_id", clinicId)
            .gte("sale_date", startDate)
            .lte("sale_date", endDate),
        ]);

        const cashIncome     = (cashRes.data ?? []).reduce((s: number, r: any) => s + r.treatment_fee, 0);
        const insuranceIncome = (insRes.data ?? []).reduce((s: number, r: any) => s + r.amount, 0);
        const totalIncome    = cashIncome + insuranceIncome;
        const expenseTotal   = (expRes.data ?? []).reduce((s: number, r: any) => s + r.amount, 0);
        const newPatients    = (salesRes.data ?? []).filter((r: any) => r.is_first_visit).length;
        const returnPatients = (salesRes.data ?? []).filter((r: any) => !r.is_first_visit).length;

        return {
          month,
          cashIncome,
          insuranceIncome,
          totalIncome,
          expenseTotal,
          profit: totalIncome - expenseTotal,
          newPatients,
          returnPatients,
          // カテゴリ別経費（ピボット用）
          expenseByCategory: (expRes.data ?? []) as { amount: number; category: string }[],
        };
      })
    );

    // 経費カテゴリ別月別ピボット構築
    const categorySet = new Set<string>();
    monthlyResults.forEach(m => m.expenseByCategory.forEach((e) => categorySet.add(e.category)));
    const categories = Array.from(categorySet).sort();

    const categoryRows = categories.map(cat => {
      const monthlyAmounts = monthlyResults.map(m =>
        m.expenseByCategory
          .filter((e) => e.category === cat)
          .reduce((s, e) => s + e.amount, 0)
      );
      return {
        category: cat,
        monthlyAmounts,
        total: monthlyAmounts.reduce((s, v) => s + v, 0),
      };
    });

    // 経費全件取得
    const startOfYear = `${year}-01-01`;
    const endOfYear   = `${year}-12-31`;
    const { data: allExpenses } = await supabase
      .from("clinic_expenses")
      .select("expense_date, category, description, amount, memo")
      .eq("clinic_id", clinicId)
      .gte("expense_date", startOfYear)
      .lte("expense_date", endOfYear)
      .order("expense_date", { ascending: true });

    const expenseDetails = (allExpenses ?? []).map((r: any) => ({
      date: r.expense_date,
      category: r.category,
      description: r.description ?? "",
      amount: r.amount,
      memo: r.memo ?? "",
    }));

    return {
      success: true,
      data: {
        year,
        clinicName,
        months: monthlyResults.map(({ expenseByCategory: _, ...rest }) => rest),
        categoryRows,
        expenseDetails,
      },
    };
  } catch (err) {
    console.error("getAnnualTaxData error:", err);
    return { success: false, error: "年間データの取得に失敗しました" };
  }
}

// --- Cash Sales Bulk Import ---

export interface ImportCashSaleRow {
  sale_date: string;
  customer_name: string;
  treatment_fee: number;
  memo?: string | null;
  is_first_visit?: boolean;
}

export async function bulkImportCashSales(rows: ImportCashSaleRow[]): Promise<{
  success: boolean;
  inserted: number;
  skipped: number;
  errors: { row: number; name: string; reason: string }[];
}> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await getSupabase();

  let inserted = 0;
  let skipped = 0;
  const errors: { row: number; name: string; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed, header is row 1

    // バリデーション
    if (!row.sale_date) {
      errors.push({ row: rowNum, name: row.customer_name, reason: "日付が未入力です" });
      skipped++;
      continue;
    }
    if (!row.customer_name) {
      errors.push({ row: rowNum, name: "（空欄）", reason: "お名前が未入力です" });
      skipped++;
      continue;
    }
    if (!row.treatment_fee || isNaN(row.treatment_fee) || row.treatment_fee <= 0) {
      errors.push({ row: rowNum, name: row.customer_name, reason: "金額が無効です" });
      skipped++;
      continue;
    }

    try {
      const { error } = await supabase.from("cash_sales").insert([{
        sale_date: row.sale_date,
        customer_name: row.customer_name,
        treatment_fee: row.treatment_fee,
        memo: row.memo || null,
        is_first_visit: row.is_first_visit ?? false,
        clinic_id: clinicId,
      }]);
      if (error) throw error;
      inserted++;
    } catch (e: any) {
      errors.push({ row: rowNum, name: row.customer_name, reason: e.message || "登録エラー" });
      skipped++;
    }
  }

  revalidatePath("/admin/sales");
  revalidatePath("/admin/dashboard");
  return { success: true, inserted, skipped, errors };
}

// --- Pending Expenses (Triage Flow) ---

export async function addPendingExpense(imageUrl: string | null, triageData: any = {}) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("pending_expenses")
      .insert([{
        image_url: imageUrl,
        status: 'unprocessed',
        clinic_id: clinicId,
        ...triageData,
      }])
      .select()
      .single();

    if (error) throw error;
    revalidatePath("/admin/expenses/triage");
    return { success: true, data };
  } catch (error) {
    console.error("Error adding pending expense:", error);
    return { success: false, error: "一時保存に失敗しました" };
  }
}

export async function getPendingExpenses(statusFilter?: string) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    let query = supabase.from("pending_expenses").select("*").eq("clinic_id", clinicId);

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error fetching pending expenses:", error);
    return { success: false, error: "取得に失敗しました", data: [] };
  }
}

export async function updatePendingExpense(id: string, updates: any) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("pending_expenses")
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("clinic_id", clinicId);

    if (error) throw error;
    revalidatePath("/admin/expenses/triage");
    return { success: true };
  } catch (error) {
    console.error("Error updating pending expense:", error);
    return { success: false, error: "更新に失敗しました" };
  }
}

export async function finalizePendingExpense(id: string, finalData: any) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    
    // 0. 元の保留データから画像URLを特定
    const { data: pending } = await supabase
      .from("pending_expenses")
      .select("image_url")
      .eq("id", id)
      .eq("clinic_id", clinicId)
      .single();
    
    // finalDataに新しいURLがある場合はそちらを優先
    const imageUrl = finalData.image_url || pending?.image_url || "";

    // 1. Insert into formal clinic_expenses
    const { error: insertErr } = await supabase
      .from("clinic_expenses")
      .insert([{
        expense_date: finalData.expense_date,
        category: finalData.category,
        description: finalData.description,
        amount: finalData.amount,
        memo: finalData.memo,
        image_url: imageUrl,
        clinic_id: clinicId
      }]);

    if (insertErr) throw insertErr;

    // 2. Delete from pending_expenses
    const { error: deleteErr } = await supabase
      .from("pending_expenses")
      .delete()
      .eq("id", id)
      .eq("clinic_id", clinicId);

    if (deleteErr) throw deleteErr;

    revalidatePath("/admin/expenses");
    revalidatePath("/admin/expenses/triage");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error finalizing expense:", error);
    return { success: false, error: "正式登録に失敗しました" };
  }
}

// ─── 経費一括インポート ───────────────────────────────────
export type ImportExpenseRow = {
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  memo: string;
};

export async function bulkImportExpenses(rows: ImportExpenseRow[]): Promise<{
  success: boolean; inserted: number; skipped: number;
  errors: { row: number; description: string; reason: string }[];
}> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await getSupabase();
  let inserted = 0, skipped = 0;
  const errors: { row: number; description: string; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    if (!row.expense_date) {
      errors.push({ row: rowNum, description: row.description, reason: "日付が未入力です" });
      skipped++; continue;
    }
    if (!row.category) {
      errors.push({ row: rowNum, description: row.description, reason: "カテゴリが未入力です" });
      skipped++; continue;
    }
    if (!row.amount || isNaN(row.amount) || row.amount <= 0) {
      errors.push({ row: rowNum, description: row.description, reason: "金額が無効です" });
      skipped++; continue;
    }
    try {
      const { error } = await supabase.from("clinic_expenses").insert([{
        expense_date: row.expense_date, category: row.category,
        description: row.description || "", amount: row.amount,
        memo: row.memo || null, clinic_id: clinicId,
      }]);
      if (error) throw error;
      inserted++;
    } catch (e: unknown) {
      errors.push({ row: rowNum, description: row.description, reason: (e as Error).message || "登録エラー" });
      skipped++;
    }
  }
  revalidatePath("/admin/expenses");
  return { success: true, inserted, skipped, errors };
}

// ─── 保険入金一括インポート ────────────────────────────────
export type ImportInsuranceRow = {
  payment_date: string;
  insurance_name: string;
  amount: number;
  notes: string;
};

export async function bulkImportInsurancePayments(rows: ImportInsuranceRow[]): Promise<{
  success: boolean; inserted: number; skipped: number;
  errors: { row: number; name: string; reason: string }[];
}> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await getSupabase();
  let inserted = 0, skipped = 0;
  const errors: { row: number; name: string; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    if (!row.payment_date) {
      errors.push({ row: rowNum, name: row.insurance_name, reason: "日付が未入力です" });
      skipped++; continue;
    }
    if (!row.insurance_name) {
      errors.push({ row: rowNum, name: "（空欄）", reason: "保険種別が未入力です" });
      skipped++; continue;
    }
    if (!row.amount || isNaN(row.amount) || row.amount <= 0) {
      errors.push({ row: rowNum, name: row.insurance_name, reason: "金額が無効です" });
      skipped++; continue;
    }
    try {
      const paymentMonth = row.payment_date.slice(0, 7);
      const { error } = await supabase.from("insurance_payments").insert([{
        payment_date: row.payment_date, payment_month: paymentMonth,
        insurance_name: row.insurance_name, amount: row.amount,
        notes: row.notes || null, passbook_checked: false, clinic_id: clinicId,
      }]);
      if (error) throw error;
      inserted++;
    } catch (e: unknown) {
      errors.push({ row: rowNum, name: row.insurance_name, reason: (e as Error).message || "登録エラー" });
      skipped++;
    }
  }
  revalidatePath("/admin/insurance");
  return { success: true, inserted, skipped, errors };
}

// ─── 重複チェック ─────────────────────────────────────────────

export type DuplicateCheckRow = {
  expense_date: string;
  amount: number;
  description: string;
};

export type DuplicateFlag = {
  rowIndex: number;     // 0-based（EditableExpenseRow配列のインデックス）
  isDuplicate: boolean;
  confidence: number;   // 0.0〜1.0
  reason: string;
};

/**
 * アップロード予定行をDBの既存データと照合し、重複の疑いがある行を返す。
 * 完全一致（日付+金額）は confidence=0.95、近似（金額+3日以内）は confidence=0.65。
 */
export async function checkDuplicateExpenses(
  rows: DuplicateCheckRow[]
): Promise<DuplicateFlag[]> {
  const { clinicId } = await checkAdminAuth();
  const supabase = await getSupabase();

  const validDates = rows
    .map((r) => r.expense_date)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();

  if (validDates.length === 0) {
    return rows.map((_, i) => ({ rowIndex: i, isDuplicate: false, confidence: 0, reason: "" }));
  }

  const minDate = new Date(validDates[0]);
  const maxDate = new Date(validDates[validDates.length - 1]);
  minDate.setDate(minDate.getDate() - 14);
  maxDate.setDate(maxDate.getDate() + 14);

  const { data: existing } = await supabase
    .from("clinic_expenses")
    .select("id, expense_date, amount, description")
    .eq("clinic_id", clinicId)
    .gte("expense_date", minDate.toISOString().split("T")[0])
    .lte("expense_date", maxDate.toISOString().split("T")[0]);

  if (!existing || existing.length === 0) {
    return rows.map((_, i) => ({ rowIndex: i, isDuplicate: false, confidence: 0, reason: "" }));
  }

  return rows.map((row, i) => {
    // 完全一致: 同日 + 同金額
    const exactMatch = existing.find(
      (e) => e.expense_date === row.expense_date && e.amount === row.amount
    );
    if (exactMatch) {
      return {
        rowIndex: i,
        isDuplicate: true,
        confidence: 0.95,
        reason: `同日（${row.expense_date}）・同金額（¥${row.amount.toLocaleString()}）が登録済みです`,
      };
    }

    // 近似一致: 同金額 + 3日以内
    const nearMatch = existing.find((e) => {
      if (e.amount !== row.amount) return false;
      if (!row.expense_date || !e.expense_date) return false;
      const diff =
        Math.abs(new Date(e.expense_date).getTime() - new Date(row.expense_date).getTime()) /
        86400000;
      return diff <= 3;
    });
    if (nearMatch) {
      return {
        rowIndex: i,
        isDuplicate: true,
        confidence: 0.65,
        reason: `類似金額（¥${row.amount.toLocaleString()}）が${nearMatch.expense_date}に登録されている可能性があります`,
      };
    }

    return { rowIndex: i, isDuplicate: false, confidence: 0, reason: "" };
  });
}
