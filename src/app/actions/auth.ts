"use server";

import { redirect } from "next/navigation";

// Supabaseセッションを確認し、テナントのclinic_idを返す関数
export async function checkAdminAuth(): Promise<{ clinicId: string }> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin-login");
  }

  const { data } = await supabase
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  const clinicId = data?.clinic_id ?? "00000000-0000-0000-0000-000000000001";
  return { clinicId };
}

export async function loginAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "メールアドレスが未確認です。確認メールのリンクをクリックしてから再度ログインしてください。" };
    }
    return { error: "ログインに失敗しました。メールアドレスまたはパスワードを確認してください。" };
  }

  return { success: true };
}

export async function sendPasswordResetEmail(email: string, siteUrl: string) {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback`,
  });

  if (error) {
    return { error: "メールの送信に失敗しました。メールアドレスをご確認ください。" };
  }

  return { success: true };
}

export async function logoutAction() {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin-login");
}

export async function signUpAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const setupPassword = formData.get("setupPassword") as string;

  // セキュリティ強化: 環境変数で設定されたセットアップ用パスワードを確認
  const requiredPassword = process.env.SETUP_PASSWORD;
  if (requiredPassword && setupPassword !== requiredPassword) {
    return { error: "セットアップパスワードが正しくありません。管理者に確認してください。" };
  }

  // サービスロールでアカウント作成（メール確認不要・即時ログイン可能）
  const { createClient: createServiceClient } = await import("@supabase/supabase-js");
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: adminData, error: createError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) {
    return { error: `アカウント作成に失敗しました: ${createError.message}` };
  }

  // 新規ユーザーをデフォルトクリニックに自動登録
  if (adminData.user) {
    await serviceClient.from("clinic_users").upsert({
      user_id: adminData.user.id,
      clinic_id: "00000000-0000-0000-0000-000000000001",
      role: "owner",
    }, { onConflict: "user_id, clinic_id", ignoreDuplicates: true });
  }

  // 作成直後にそのままサインイン（セッションCookieをセット）
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) {
    // アカウントは作成済み。手動でログインしてもらう
    return { success: "アカウントを作成しました。ログイン画面からログインしてください。", autoLogin: false };
  }

  return { success: "アカウントを作成しました。", autoLogin: true };
}
