"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/app/actions/auth";
import { revalidatePath } from "next/cache";
import { addDays, differenceInCalendarDays, format, parseISO, subMonths } from "date-fns";
import {
  passbookDedupeKey,
  INSURANCE_MATCH_DAY_WINDOW,
  EXPENSE_DUPLICATE_DAY_WINDOW,
  type PassbookRow,
  type PassbookKind,
} from "@/lib/passbook";

export type InsuranceMatch = {
  id: string;
  insurance_name: string;
  amount: number;
  payment_date: string | null;
  payment_month: string;
  passbook_checked: boolean;
};

export type ExpenseDuplicate = {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
};

export type PassbookRowAnalysis = {
  dedupeKey: string;
  /** すでに取り込み済み・対象外にした行かどうか */
  importedAs: PassbookKind | null;
  /** 金額と振込日が合う保険入金の既存レコード */
  insuranceMatch: InsuranceMatch | null;
  /** レシートなどで既に登録済みの可能性がある経費 */
  expenseDuplicates: ExpenseDuplicate[];
};

function minMaxDate(rows: PassbookRow[]) {
  const dates = rows.map((r) => r.entry_date).sort();
  return { min: dates[0], max: dates[dates.length - 1] };
}

/**
 * 読み取った通帳の各行について、取込済みかどうか・既存の保険入金と一致するか・
 * 経費が二重計上にならないかを一括で調べる。
 */
export async function analyzePassbookRows(
  rows: PassbookRow[]
): Promise<{ success: boolean; data: PassbookRowAnalysis[]; error?: string }> {
  const { clinicId } = await requireRole(["owner"]);
  if (rows.length === 0) return { success: true, data: [] };

  try {
    const supabase = await createClient();
    const { min, max } = minMaxDate(rows);
    const keys = rows.map(passbookDedupeKey);

    const [importedRes, insuranceRes, expenseRes] = await Promise.all([
      supabase
        .from("passbook_entries")
        .select("dedupe_key, kind")
        .eq("clinic_id", clinicId)
        .in("dedupe_key", keys),
      supabase
        .from("insurance_payments")
        .select("id, insurance_name, amount, payment_date, payment_month, passbook_checked")
        .eq("clinic_id", clinicId)
        .gte("payment_month", format(subMonths(parseISO(min), 4), "yyyy-MM-01"))
        .lte("payment_month", format(parseISO(max), "yyyy-MM-01")),
      supabase
        .from("clinic_expenses")
        .select("id, expense_date, category, description, amount")
        .eq("clinic_id", clinicId)
        .gte("expense_date", format(addDays(parseISO(min), -EXPENSE_DUPLICATE_DAY_WINDOW), "yyyy-MM-dd"))
        .lte("expense_date", format(addDays(parseISO(max), EXPENSE_DUPLICATE_DAY_WINDOW), "yyyy-MM-dd")),
    ]);

    const importedMap = new Map<string, PassbookKind>(
      (importedRes.data ?? []).map((e) => [e.dedupe_key as string, e.kind as PassbookKind])
    );
    const payments = (insuranceRes.data ?? []) as InsuranceMatch[];
    const expenses = (expenseRes.data ?? []) as ExpenseDuplicate[];

    // 1件の保険入金を複数行に割り当てないよう、使ったものを覚えておく
    const usedPaymentIds = new Set<string>();

    const data = rows.map((row, i): PassbookRowAnalysis => {
      const dedupeKey = keys[i];
      const importedAs = importedMap.get(dedupeKey) ?? null;

      let insuranceMatch: InsuranceMatch | null = null;
      if (row.deposit > 0) {
        insuranceMatch =
          payments.find((p) => {
            if (usedPaymentIds.has(p.id) || p.amount !== row.deposit) return false;
            if (p.payment_date) {
              return (
                Math.abs(differenceInCalendarDays(parseISO(p.payment_date), parseISO(row.entry_date))) <=
                INSURANCE_MATCH_DAY_WINDOW
              );
            }
            // 振込日が空のレコードは、対象月が入金月から4ヶ月前までなら候補にする
            const diffMonths =
              (parseISO(row.entry_date).getFullYear() - parseISO(p.payment_month).getFullYear()) * 12 +
              (parseISO(row.entry_date).getMonth() - parseISO(p.payment_month).getMonth());
            return diffMonths >= 0 && diffMonths <= 4;
          }) ?? null;
        if (insuranceMatch) usedPaymentIds.add(insuranceMatch.id);
      }

      const amount = row.withdrawal > 0 ? row.withdrawal : row.deposit;
      const expenseDuplicates = expenses.filter(
        (e) =>
          e.amount === amount &&
          Math.abs(differenceInCalendarDays(parseISO(e.expense_date), parseISO(row.entry_date))) <=
            EXPENSE_DUPLICATE_DAY_WINDOW
      );

      return { dedupeKey, importedAs, insuranceMatch, expenseDuplicates };
    });

    return { success: true, data };
  } catch (error) {
    console.error("Error analyzing passbook rows:", error);
    return { success: false, data: [], error: "照合に失敗しました" };
  }
}

export type PassbookImportItem = {
  row: PassbookRow;
  kind: PassbookKind;
  /** 経費・その他収入のカテゴリ */
  category?: string;
  /** 台帳に載せる摘要（未指定なら通帳の摘要をそのまま） */
  description?: string;
  /** 保険入金の名称（新規登録するとき） */
  insuranceName?: string;
  /** 保険入金の対象月 "yyyy-MM-01"（新規登録するとき） */
  insurancePaymentMonth?: string;
  /** 既存の保険入金レコードに紐づけて通帳確認済みにする場合のID */
  insuranceMatchId?: string | null;
  imageUrl?: string | null;
};

export async function importPassbookRows(items: PassbookImportItem[]) {
  const { clinicId } = await requireRole(["owner"]);
  if (items.length === 0) return { success: false, error: "取り込む行がありません" };

  try {
    const supabase = await createClient();
    const entries: Record<string, unknown>[] = [];
    let expenseCount = 0;
    let incomeCount = 0;
    let insuranceNewCount = 0;
    let insuranceCheckedCount = 0;
    let ignoreCount = 0;

    for (const item of items) {
      const { row, kind } = item;
      const amount = row.withdrawal > 0 ? row.withdrawal : row.deposit;
      const description = (item.description || row.description || "").trim();
      let linkedExpenseId: string | null = null;
      let linkedInsuranceId: string | null = null;

      if (kind === "expense" || kind === "income") {
        const { data, error } = await supabase
          .from("clinic_expenses")
          .insert([
            {
              expense_date: row.entry_date,
              category: item.category || "その他",
              description,
              amount,
              memo: "通帳から取込",
              image_url: item.imageUrl || "",
              entry_type: kind,
              clinic_id: clinicId,
            },
          ])
          .select("id")
          .single();
        if (error) throw error;
        linkedExpenseId = data.id;
        if (kind === "expense") expenseCount++;
        else incomeCount++;
      } else if (kind === "insurance") {
        if (item.insuranceMatchId) {
          const { error } = await supabase
            .from("insurance_payments")
            .update({ passbook_checked: true, payment_date: row.entry_date })
            .eq("id", item.insuranceMatchId)
            .eq("clinic_id", clinicId);
          if (error) throw error;
          linkedInsuranceId = item.insuranceMatchId;
          insuranceCheckedCount++;
        } else {
          const { data, error } = await supabase
            .from("insurance_payments")
            .insert([
              {
                payment_month: item.insurancePaymentMonth || `${row.entry_date.slice(0, 7)}-01`,
                insurance_name: item.insuranceName || description || "保険入金",
                amount: row.deposit,
                payment_date: row.entry_date,
                passbook_checked: true,
                notes: "通帳から取込",
                image_url: item.imageUrl || null,
                clinic_id: clinicId,
              },
            ])
            .select("id")
            .single();
          if (error) throw error;
          linkedInsuranceId = data.id;
          insuranceNewCount++;
        }
      } else {
        ignoreCount++;
      }

      entries.push({
        clinic_id: clinicId,
        entry_date: row.entry_date,
        description: row.description,
        deposit: row.deposit,
        withdrawal: row.withdrawal,
        balance: row.balance,
        kind,
        linked_expense_id: linkedExpenseId,
        linked_insurance_id: linkedInsuranceId,
        image_url: item.imageUrl || null,
        dedupe_key: passbookDedupeKey(row),
      });
    }

    const { error: entryError } = await supabase
      .from("passbook_entries")
      .upsert(entries, { onConflict: "clinic_id,dedupe_key" });
    if (entryError) throw entryError;

    revalidatePath("/admin/passbook");
    revalidatePath("/admin/expenses");
    revalidatePath("/admin/insurance");
    revalidatePath("/admin/dashboard");

    return {
      success: true,
      summary: { expenseCount, incomeCount, insuranceNewCount, insuranceCheckedCount, ignoreCount },
    };
  } catch (error) {
    console.error("Error importing passbook rows:", error);
    return { success: false, error: "取り込みに失敗しました" };
  }
}

export async function getPassbookHistory(limit = 100) {
  const { clinicId } = await requireRole(["owner"]);
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("passbook_entries")
      .select("*")
      .eq("clinic_id", clinicId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return { success: true, data: data ?? [] };
  } catch (error) {
    console.error("Error fetching passbook history:", error);
    return { success: false, data: [], error: "取得に失敗しました" };
  }
}

/**
 * 取込記録だけを消す。紐づけて作った経費・保険入金は消さない
 * （消したい場合は経費記帳／保険入金の画面から消してもらう）。
 */
export async function deletePassbookEntry(id: string) {
  const { clinicId } = await requireRole(["owner"]);
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("passbook_entries")
      .delete()
      .eq("id", id)
      .eq("clinic_id", clinicId);
    if (error) throw error;
    revalidatePath("/admin/passbook");
    return { success: true };
  } catch (error) {
    console.error("Error deleting passbook entry:", error);
    return { success: false, error: "削除に失敗しました" };
  }
}
