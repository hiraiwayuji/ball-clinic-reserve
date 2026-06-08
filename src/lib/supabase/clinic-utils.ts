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
  // 各 Vercel デプロイは「その院専用」。このデプロイの clinic を正とする。
  const expected = process.env.NEXT_PUBLIC_CLINIC_ID || DEFAULT_CLINIC_ID;
  if (!user) return expected;

  // user_id だけで .single() すると、複数院に紐づくユーザーが「最初に見つかった別院」を
  // 取得してしまう（マルチテナント clinic_id 解決バグ）。このデプロイの clinic に
  // 所属しているかを clinic_id 付きで確認し、所属していればその院を返す。
  // tenant-isolation-ignore: user_id ＋ expected clinic_id で所属確認するための解決ヘルパー。
  const { data } = await supabase
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .eq("clinic_id", expected)
    .maybeSingle();

  return data?.clinic_id ?? expected;
}
