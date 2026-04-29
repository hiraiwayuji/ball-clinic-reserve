// Phase 1: 設定画面ロックの「解錠状態」を Cookie で管理する
// - Cookie 値は HMAC 署名付きで改ざん検知
// - 既定 30 分で失効
// - Server Action / Server Component で `isSettingsUnlocked()` をチェックする

import { cookies } from "next/headers";

const COOKIE_NAME = "ball_settings_unlock";
const TTL_MS = 30 * 60 * 1000; // 30 分

function getSecret(): string {
  return (
    process.env.SETTINGS_LOCK_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "ball-fallback-lock-secret"
  );
}

async function hmacHex(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function setSettingsUnlocked(clinicId: string): Promise<void> {
  const expiry = Date.now() + TTL_MS;
  const payload = `${clinicId}:${expiry}`;
  const sig = await hmacHex(payload);
  const value = `${expiry}.${sig}`;

  const store = await cookies();
  store.set({
    name: COOKIE_NAME,
    value,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(TTL_MS / 1000),
  });
}

export async function clearSettingsUnlocked(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function isSettingsUnlocked(clinicId: string): Promise<boolean> {
  const store = await cookies();
  const v = store.get(COOKIE_NAME)?.value;
  if (!v) return false;
  const [expiryStr, sig] = v.split(".");
  const expiry = Number(expiryStr);
  if (!expiry || Number.isNaN(expiry)) return false;
  if (expiry < Date.now()) return false;
  const expected = await hmacHex(`${clinicId}:${expiry}`);
  return expected === sig;
}
