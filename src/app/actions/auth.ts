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

/** クライアントコンポーネントからログイン中ユーザーの clinic_id を取得する（リダイレクトなし） */
export async function getMyClinicId(): Promise<string | null> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  return data?.clinic_id ?? "00000000-0000-0000-0000-000000000001";
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

/** デモアカウントで自動ログイン（APP_MODE=DEMO 時のみ有効） */
export async function demoLoginAction() {
  const email = process.env.DEMO_LOGIN_EMAIL;
  const password = process.env.DEMO_LOGIN_PASSWORD;

  if (!email || !password) {
    return { error: "デモアカウントが設定されていません（DEMO_LOGIN_EMAIL / DEMO_LOGIN_PASSWORD）。" };
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "デモアカウントのメールアドレスが未確認です。Supabase の Authentication → Users でユーザーを確認済みにしてください。" };
    }
    return { error: `デモアカウントへのログインに失敗しました: ${error.message}` };
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
  const email        = formData.get("email") as string;
  const password     = formData.get("password") as string;
  const setupPassword = formData.get("setupPassword") as string;
  const clinicName   = (formData.get("clinicName") as string)?.trim() || "新規接骨院";

  // セットアップパスワード確認
  const requiredPassword = process.env.SETUP_PASSWORD;
  if (requiredPassword && setupPassword !== requiredPassword) {
    return { error: "セットアップコードが正しくありません。発行者にご確認ください。" };
  }

  const { createClient: createServiceClient } = await import("@supabase/supabase-js");
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ① 新しいクリニックを clinic_settings に作成（固有 UUID）
  const { data: clinicData, error: clinicError } = await serviceClient
    .from("clinic_settings")
    .insert({ clinic_name: clinicName })
    .select("id")
    .single();

  if (clinicError || !clinicData) {
    return { error: `クリニック作成に失敗しました: ${clinicError?.message}` };
  }

  const newClinicId = clinicData.id;

  // ② ユーザーアカウント作成（メール確認不要）
  const { data: adminData, error: createError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) {
    // ユーザー作成失敗時はクリニックも削除
    await serviceClient.from("clinic_settings").delete().eq("id", newClinicId);
    return { error: `アカウント作成に失敗しました: ${createError.message}` };
  }

  // ③ ユーザーを新クリニックのオーナーとして登録
  if (adminData.user) {
    await serviceClient.from("clinic_users").upsert({
      user_id: adminData.user.id,
      clinic_id: newClinicId,
      role: "owner",
    }, { onConflict: "user_id, clinic_id", ignoreDuplicates: true });
  }

  // ④ 作成直後にそのままサインイン
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) {
    return { success: "アカウントを作成しました。ログイン画面からログインしてください。", autoLogin: false };
  }

  return { success: "アカウントを作成しました。", autoLogin: true };
}
