import { createClient } from "@/lib/supabase/server";

const DEFAULT_CLINIC_ID = "00000000-0000-0000-0000-000000000001";

/**
 * 認証済みユーザーのclinic_idをclinic_usersテーブルから動的に取得する。
 * Phase 2: DEFAULT_CLINIC_IDのハードコードを排除するための中核関数。
 * 未登録ユーザーはデフォルトクリニックIDにフォールバック（シングルテナント後方互換）。
 */
export async function getCurrentClinicId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return DEFAULT_CLINIC_ID;

  // tenant-isolation-ignore: user_id から所属 clinic を引く認証ヘルパー。
  // 構造上、ここで clinic_id を絞ると「クリニックの解決」自体ができない。
  // ※ メモリの「マルチテナント clinic_id 解決バグ」も別途要修正（複数院紐付き対応）。
  const { data } = await supabase
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  return data?.clinic_id ?? DEFAULT_CLINIC_ID;
}
