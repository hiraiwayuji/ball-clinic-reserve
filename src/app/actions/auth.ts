"use server";

import { redirect } from "next/navigation";

export type ClinicRole = "owner" | "admin" | "staff";

export type AdminAuthInfo = {
  clinicId: string;
  userId: string;
  email: string | null;
  role: ClinicRole;
};

// Supabase の getUser/select が cold start でハングしても画面真っ白にしないための
// 安全タイムアウト。これを超えたら未認証扱いで /admin-login に戻す or デフォルト値で続行する。
async function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Supabaseセッションを確認し、テナントのclinic_idと role を返す関数。
// マルチテナント方針: 各 Vercel デプロイには NEXT_PUBLIC_CLINIC_ID が設定されており、
// そのデプロイは「その clinic 専用」として動く。複数院に紐付くユーザーでも、
// このデプロイの clinic_id に登録がなければ unauthorized 扱い。
export async function checkAdminAuth(): Promise<AdminAuthInfo> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  // getUser は Supabase Auth API への外部呼び出し。cold start で詰まる場合があるため
  // 10s のタイムアウトで囲む。タイムアウト/エラー時は user=null として通常の未認証
  // フローに合流させる（=ログイン画面へ戻す）。
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  try {
    const result = await withTimeout(supabase.auth.getUser(), 10_000, "auth.getUser");
    user = result.data.user;
  } catch (err) {
    console.error("[checkAdminAuth] auth.getUser failed:", err);
  }

  if (!user) {
    redirect("/admin-login");
  }

  const expectedClinicId = process.env.NEXT_PUBLIC_CLINIC_ID;
  if (!expectedClinicId) {
    // 各 Vercel デプロイには必ず設定されているはず。未設定なら設定漏れ。
    console.error(
      "[checkAdminAuth] NEXT_PUBLIC_CLINIC_ID is not set. Cannot resolve clinic for user.",
    );
    redirect("/admin-login?error=misconfigured");
  }

  // このデプロイの clinic に対する権限のみを参照（user_id + clinic_id で絞る）。
  let data: { clinic_id: string; role: string | null } | null = null;
  try {
    const result = await withTimeout(
      supabase
        .from("clinic_users")
        .select("clinic_id, role")
        .eq("user_id", user.id)
        .eq("clinic_id", expectedClinicId)
        .maybeSingle(),
      5_000,
      "clinic_users.select",
    );
    data = result.data;
  } catch (err) {
    console.error("[checkAdminAuth] clinic_users lookup failed:", err);
  }

  if (!data) {
    // この clinic に紐付いていない。誤った clinic_id で続行すると別院のデータが
    // 見えてしまうので、明示的に unauthorized 扱いでログイン画面に戻す。
    console.warn(
      `[checkAdminAuth] user ${user.id} is not registered for clinic ${expectedClinicId}`,
    );
    redirect("/admin-login?error=no-clinic-access");
  }

  const role = (data.role as ClinicRole | null) ?? "owner";
  return {
    clinicId: data.clinic_id,
    userId: user.id,
    email: user.email ?? null,
    role,
  };
}

/**
 * 読み取り専用の常駐ポーリング（RemindersWatcher 等）専用の軽量認証。
 *
 * 通常の checkAdminAuth は Supabase Auth API への外部呼び出し（getUser）を行うが、
 * これを 30〜60 秒ごとに叩き続けると、アクセストークン期限切れ時に裏ポーリング・
 * 複数タブ・画面操作が同時にトークン回転をかけ、Supabase の乗っ取り検知でセッション
 * ごと失効＝「触ってないのに頻繁にログアウト」の原因になる（runbook_ball_frequent_logout）。
 *
 * そこで常駐パスでは getClaims（ローカル JWT 検証＝Auth API を叩かない／トークン回転を
 * 誘発しない）で user_id を取り出す。署名キー未設定などで getClaims が使えない環境では
 * 従来の checkAdminAuth にフォールバックするため、挙動が悪化することはない。
 *
 * 認証に失敗した場合は null を返す（常駐ポーリングはログイン画面へ redirect せず静かに止まる）。
 */
export async function checkAdminAuthLite(): Promise<AdminAuthInfo | null> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const expectedClinicId = process.env.NEXT_PUBLIC_CLINIC_ID;
  if (!expectedClinicId) return null;

  // getClaims はローカルで JWT 署名を検証する（Auth API への外部呼び出しなし）。
  let userId: string | null = null;
  let email: string | null = null;
  try {
    const { data } = await withTimeout(supabase.auth.getClaims(), 5_000, "auth.getClaims");
    const claims = data?.claims;
    if (claims?.sub) {
      userId = claims.sub as string;
      email = (claims.email as string | undefined) ?? null;
    }
  } catch (err) {
    console.warn("[checkAdminAuthLite] getClaims failed, will fall back:", err);
  }

  // getClaims が使えない環境（署名キー未設定など）では従来の厳格チェックにフォールバック。
  if (!userId) {
    try {
      return await checkAdminAuth();
    } catch {
      return null;
    }
  }

  // この clinic に対する権限のみ参照（user_id + clinic_id）。
  let data: { clinic_id: string; role: string | null } | null = null;
  try {
    const result = await withTimeout(
      supabase
        .from("clinic_users")
        .select("clinic_id, role")
        .eq("user_id", userId)
        .eq("clinic_id", expectedClinicId)
        .maybeSingle(),
      5_000,
      "clinic_users.select(lite)",
    );
    data = result.data;
  } catch (err) {
    console.error("[checkAdminAuthLite] clinic_users lookup failed:", err);
    return null;
  }

  if (!data) return null;

  return {
    clinicId: data.clinic_id,
    userId,
    email,
    role: (data.role as ClinicRole | null) ?? "owner",
  };
}

/**
 * 指定 role のいずれかでなければリダイレクト。
 * - 例: requireRole(['owner'])  → owner 以外は /admin/dashboard?denied=1 へ
 * - 例: requireRole(['owner','admin'])
 */
export async function requireRole(
  allowed: ClinicRole[],
  redirectTo: string = "/admin/dashboard?denied=1",
): Promise<AdminAuthInfo> {
  const info = await checkAdminAuth();
  if (!allowed.includes(info.role)) {
    redirect(redirectTo);
  }
  return info;
}

/** リダイレクトせずに role のみ返す（クライアント表示制御用）。
 * このデプロイの clinic に紐付いていない場合は null を返す。 */
export async function getMyRole(): Promise<ClinicRole | null> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const expectedClinicId = process.env.NEXT_PUBLIC_CLINIC_ID;
  if (!expectedClinicId) return null;

  const { data } = await supabase
    .from("clinic_users")
    .select("role")
    .eq("user_id", user.id)
    .eq("clinic_id", expectedClinicId)
    .maybeSingle();

  return (data?.role as ClinicRole | undefined) ?? null;
}

/** ログイン中スタッフの表示名を返す（チェックリストの「誰がチェックしたか」用）。
 * reservation_staff.auth_user_id が一致するレコードの name を優先し、なければメールアドレス。 */
export async function getMyStaffName(): Promise<string> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "スタッフ";

  const expectedClinicId = process.env.NEXT_PUBLIC_CLINIC_ID;
  if (expectedClinicId && user.email) {
    const { data } = await supabase
      .from("reservation_staff")
      .select("name")
      .eq("clinic_id", expectedClinicId)
      .eq("email", user.email)
      .maybeSingle();
    if (data?.name) return data.name as string;
  }

  // メールの @ 前をフォールバック
  return user.email?.split("@")[0] ?? "スタッフ";
}

/** ログイン中ユーザーに対応する reservation_staff.id を返す（なければ null）。 */
export async function getMyStaffId(): Promise<string | null> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const expectedClinicId = process.env.NEXT_PUBLIC_CLINIC_ID;
  if (!expectedClinicId) return null;

  const { data } = await supabase
    .from("reservation_staff")
    .select("id")
    .eq("clinic_id", expectedClinicId)
    .eq("email", user.email)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

/** クライアントコンポーネントからログイン中ユーザーの clinic_id を取得する（リダイレクトなし）。
 * このデプロイの clinic に紐付いていない場合は null を返す。 */
export async function getMyClinicId(): Promise<string | null> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const expectedClinicId = process.env.NEXT_PUBLIC_CLINIC_ID;
  if (!expectedClinicId) return null;

  const { data } = await supabase
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .eq("clinic_id", expectedClinicId)
    .maybeSingle();

  return data?.clinic_id ?? null;
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

/** ログイン中ユーザーのメールアドレスを取得 */
export async function getMyEmail(): Promise<string | null> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email ?? null;
}

/** メールアドレス変更（確認メールが届く） */
export async function updateEmailAction(formData: FormData) {
  const newEmail = formData.get("email") as string;
  if (!newEmail?.trim()) return { error: "メールアドレスを入力してください" };

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
  if (error) return { error: `変更に失敗しました: ${error.message}` };
  return { success: "確認メールを送信しました。リンクをクリックして変更を完了してください。" };
}

/** パスワード変更（現在のパスワードで再認証してから変更） */
export async function updatePasswordAction(formData: FormData) {
  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!currentPassword || !newPassword || !confirmPassword)
    return { error: "すべての項目を入力してください" };
  if (newPassword !== confirmPassword)
    return { error: "新しいパスワードが一致しません" };
  if (newPassword.length < 8)
    return { error: "パスワードは8文字以上で設定してください" };

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  // 現在のパスワードで再認証
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "ユーザー情報を取得できませんでした" };

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (signInError) return { error: "現在のパスワードが正しくありません" };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: `変更に失敗しました: ${error.message}` };
  return { success: "パスワードを変更しました" };
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
  // tenant-isolation-ignore: 新規クリニック作成。id は DB 側で gen_random_uuid() が発行
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
