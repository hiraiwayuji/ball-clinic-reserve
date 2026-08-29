"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth, requireRole } from "@/app/actions/auth";
import {
  auditEntries,
  CHECKED_MARK,
  INCOME_FIX_CATEGORY,
  type AuditEntry,
  type AuditFinding,
} from "@/lib/entry-audit";

/**
 * 記帳チェック（/admin/expenses/check）のサーバー側。
 *
 * 「入ってきたお金が経費に入っていないか」を毎回あぶり出すための画面。
 * 判定の規則そのものは src/lib/entry-audit.ts に置いてあり、ここはDBの出し入れだけを持つ。
 */

/**
 * 一度に見る記帳の上限。
 * 期間で切らないのは、「令和8年」を「2014年」と読み違えた行こそ見つけたいから。
 * 期間で絞ると、その読み違えた行が範囲の外に落ちてしまう。
 */
const MAX_ROWS = 5000;

/** あやしい記帳の一覧。経費として登録されている行だけを見る。 */
export async function getEntryAuditFindings(): Promise<{
  success: boolean;
  findings: AuditFinding[];
  checkedCount: number;
  scannedCount: number;
  error?: string;
}> {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clinic_expenses")
      .select("id, expense_date, category, description, amount, memo, entry_type")
      .eq("clinic_id", clinicId)
      .order("expense_date", { ascending: false })
      .limit(MAX_ROWS);

    if (error) throw error;

    const rows = (data ?? []) as AuditEntry[];
    const findings = auditEntries(rows);
    const checkedCount = rows.filter((r) => (r.memo ?? "").includes(CHECKED_MARK)).length;
    return { success: true, findings, checkedCount, scannedCount: rows.length };
  } catch (error) {
    console.error("Error auditing entries:", error);
    return { success: false, findings: [], checkedCount: 0, scannedCount: 0, error: "取得に失敗しました" };
  }
}

/** 「入ってきたお金だった」ぶんを収入に付け替える。 */
export async function convertEntryToIncome(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["owner", "admin"]);
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await createClient();
    const { data: current, error: readError } = await supabase
      .from("clinic_expenses")
      .select("memo")
      .eq("clinic_id", clinicId)
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) return { success: false, error: "その記帳が見つかりませんでした" };

    const stamp = `【${today()} 記帳チェック】入ってきたお金なので、経費から収入に直しました。`;
    const { error } = await supabase
      .from("clinic_expenses")
      .update({
        entry_type: "income",
        category: INCOME_FIX_CATEGORY,
        memo: `${current.memo ?? ""} ${stamp}`.trim(),
      })
      .eq("clinic_id", clinicId)
      .eq("id", id);

    if (error) throw error;

    revalidatePath("/admin/expenses");
    revalidatePath("/admin/expenses/check");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error converting entry to income:", error);
    return { success: false, error: "変更に失敗しました" };
  }
}

/** 「見たけれど、これで正しい」ぶんに印をつけて、次回から出さないようにする。 */
export async function markEntryChecked(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["owner", "admin"]);
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await createClient();
    const { data: current, error: readError } = await supabase
      .from("clinic_expenses")
      .select("memo")
      .eq("clinic_id", clinicId)
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) return { success: false, error: "その記帳が見つかりませんでした" };
    if ((current.memo ?? "").includes(CHECKED_MARK)) return { success: true };

    const { error } = await supabase
      .from("clinic_expenses")
      .update({ memo: `${current.memo ?? ""} ${CHECKED_MARK}${today()}`.trim() })
      .eq("clinic_id", clinicId)
      .eq("id", id);

    if (error) throw error;

    revalidatePath("/admin/expenses/check");
    return { success: true };
  } catch (error) {
    console.error("Error marking entry checked:", error);
    return { success: false, error: "更新に失敗しました" };
  }
}

/** Asia/Tokyo の今日（yyyy-MM-dd）。 */
function today(): string {
  const jst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${jst.getFullYear()}-${p(jst.getMonth() + 1)}-${p(jst.getDate())}`;
}
