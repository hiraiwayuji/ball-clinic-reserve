"use server";

import { requireRole, checkAdminAuth } from "@/app/actions/auth";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}

export type PaymentCategoryRow = {
  id: string;
  key: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
};

/** ログイン中ユーザーの clinic の支払区分一覧（アクティブのみ） */
export async function listPaymentCategories(): Promise<{
  success: boolean;
  rows?: PaymentCategoryRow[];
  error?: string;
}> {
  const auth = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { data, error } = await sb
    .from("payment_categories")
    .select("id, key, label, sort_order, is_active, is_system")
    .eq("clinic_id", auth.clinicId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, rows: (data ?? []) as PaymentCategoryRow[] };
}

/** 設定画面用：is_active=false も含めた全件 */
export async function listAllPaymentCategories(): Promise<{
  success: boolean;
  rows?: PaymentCategoryRow[];
  error?: string;
}> {
  const auth = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { data, error } = await sb
    .from("payment_categories")
    .select("id, key, label, sort_order, is_active, is_system")
    .eq("clinic_id", auth.clinicId)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, rows: (data ?? []) as PaymentCategoryRow[] };
}

/** patient LP/anon から呼ぶ用：NEXT_PUBLIC_CLINIC_ID を直接見る */
export async function listPublicPaymentCategories(): Promise<PaymentCategoryRow[]> {
  const sb = getServiceClient();
  if (!sb) return [];
  const { data } = await sb
    .from("payment_categories")
    .select("id, key, label, sort_order, is_active, is_system")
    .eq("clinic_id", PUBLIC_CLINIC_ID)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return (data ?? []) as PaymentCategoryRow[];
}

export type UpsertPaymentCategoryInput = {
  id?: string;           // 既存編集なら id を指定
  key?: string;          // 新規時のみ。未指定なら label から自動生成
  label: string;
  sort_order?: number;
  is_active?: boolean;
};

/** key 自動生成: 日本語ラベルからアスキー化、衝突回避は呼び出し側で */
function generateKey(label: string): string {
  // 簡易: ラベルを小文字スラグ化、日本語は romanize 困難なのでハッシュ的に
  const ascii = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii.length > 0) return ascii;
  // 日本語のみの場合: ラベル + 6桁ランダム
  return `cat-${Math.random().toString(36).slice(2, 8)}`;
}

export async function upsertPaymentCategory(
  input: UpsertPaymentCategoryInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const auth = await requireRole(["owner", "admin"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const label = input.label?.trim();
  if (!label) return { success: false, error: "表示名を入力してください" };

  if (input.id) {
    // 編集: label / sort_order / is_active のみ。key と is_system は触らない
    const { error } = await sb
      .from("payment_categories")
      .update({
        label,
        sort_order: input.sort_order ?? 0,
        is_active: input.is_active ?? true,
      })
      .eq("id", input.id)
      .eq("clinic_id", auth.clinicId);

    if (error) return { success: false, error: error.message };
    revalidatePath("/admin/settings");
    return { success: true, id: input.id };
  }

  // 新規: key 自動生成（指定があればそれを使う）
  const key = (input.key ?? generateKey(label)).slice(0, 50);

  const { data, error } = await sb
    .from("payment_categories")
    .insert({
      clinic_id: auth.clinicId,
      key,
      label,
      sort_order: input.sort_order ?? 999,
      is_active: input.is_active ?? true,
      is_system: false,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "このキーは既に使われています。別の名前にしてください。" };
    }
    return { success: false, error: error.message };
  }
  revalidatePath("/admin/settings");
  return { success: true, id: data?.id };
}

/** 論理削除。is_system=true は不可（標準カテゴリは label 変更のみ） */
export async function deactivatePaymentCategory(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireRole(["owner", "admin"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  // is_system チェック
  const { data: row } = await sb
    .from("payment_categories")
    .select("is_system")
    .eq("id", id)
    .eq("clinic_id", auth.clinicId)
    .maybeSingle();

  if (!row) return { success: false, error: "対象が見つかりません" };
  if (row.is_system) {
    return { success: false, error: "標準カテゴリは削除できません（表示名のみ変更可能）" };
  }

  const { error } = await sb
    .from("payment_categories")
    .update({ is_active: false })
    .eq("id", id)
    .eq("clinic_id", auth.clinicId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings");
  return { success: true };
}
