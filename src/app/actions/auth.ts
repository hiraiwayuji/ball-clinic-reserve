"use server";

import { redirect } from "next/navigation";

// Supabaseセッションを確認する関数
export async function checkAdminAuth() {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect("/admin-login");
  }
  
  return true;
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
    return { error: "ログインに失敗しました。メールアドレスまたはパスワードを確認してください。" };
  }

  redirect("/admin");
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
  
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/admin`,
    },
  });

  if (error) {
    return { error: `アカウント作成に失敗しました: ${error.message}` };
  }

  return { success: "アカウントを作成しました。メールが届いた場合は確認してください（設定によっては即時ログイン可能です）。" };
}
