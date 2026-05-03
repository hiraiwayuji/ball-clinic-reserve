"use server";

import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";
import { getCustomersForLineUserId, type LinkedCustomer } from "@/lib/line-links";

const COOKIE_NAME = "ball_line_uid";
const COOKIE_MAX_AGE_SECONDS = 30 * 60;

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type FamilySessionResult =
  | { ok: true; family: LinkedCustomer[] }
  | { ok: false; error: string };

/**
 * リッチメニュー経由の `?lt=...` トークンを 1 度だけ消費し、
 * line_user_id を httpOnly cookie に保存して家族 customer 一覧を返す。
 */
export async function consumeLineReserveToken(token: string): Promise<FamilySessionResult> {
  if (!token || token.length < 16) return { ok: false, error: "invalid token" };
  const sb = getServiceClient();
  if (!sb) return { ok: false, error: "server unavailable" };

  const { data: row, error } = await sb
    .from("line_reserve_tokens")
    .select("line_user_id, clinic_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (error || !row) return { ok: false, error: "token not found or expired" };

  const expiresAt = new Date(row.expires_at).getTime();
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
    await sb.from("line_reserve_tokens").delete().eq("token", token);
    return { ok: false, error: "token expired" };
  }

  // 1 度だけ使えるトークンとして即削除
  await sb.from("line_reserve_tokens").delete().eq("token", token);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, row.line_user_id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });

  const family = await getCustomersForLineUserId(row.line_user_id, row.clinic_id ?? PUBLIC_CLINIC_ID, sb);
  return { ok: true, family };
}

/** 既に cookie がセットされている場合に家族 customer 一覧を返す（無ければ空配列）。 */
export async function getFamilyForLineSession(): Promise<LinkedCustomer[]> {
  const cookieStore = await cookies();
  const lineUserId = cookieStore.get(COOKIE_NAME)?.value;
  if (!lineUserId) return [];
  return getCustomersForLineUserId(lineUserId, PUBLIC_CLINIC_ID);
}

/** cookie に保存された line_user_id を取得（サーバーアクション内検証用）。 */
export async function getLineUidFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}

/** ログアウト相当: cookie を破棄。 */
export async function clearLineSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
