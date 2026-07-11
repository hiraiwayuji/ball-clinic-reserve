// 打刻の端末ロック：院のパソコンを一度「登録」した端末だけ打刻できるようにする。
// - 合言葉（パスワード）で解錠 → その端末（ブラウザ）に長期の署名 Cookie を保存
// - Cookie は HMAC 署名付きで改ざん検知、既定 1 年で失効
// - 合言葉は SHA-256 ハッシュで clinic_settings に保存（平文は保存しない）
// settings-lock.ts と同じ考え方。TTL を長く（院のPCは一度登録すれば以後不要）。

import { cookies } from "next/headers";

const COOKIE_NAME = "ball_attendance_device";
const TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 年

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

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 打刻用パスワードのハッシュ。前後空白のみ除去（英数字・記号OK）。 */
export async function hashAttendancePasscode(passcode: string): Promise<string> {
  return sha256Hex(`attendance::${passcode.trim()}`);
}

/** 合言葉の検証。空・未設定は常に false（＝ロック中は必ず設定が要る）。 */
export async function verifyAttendancePasscode(
  passcode: string,
  storedHash: string | null | undefined,
): Promise<boolean> {
  const code = passcode.trim();
  if (!code || !storedHash) return false;
  const candidate = await sha256Hex(`attendance::${code}`);
  return candidate === storedHash;
}

/** この端末を「院のPC」として登録（解錠 Cookie を発行）。 */
export async function setAttendanceDeviceUnlocked(clinicId: string): Promise<void> {
  const expiry = Date.now() + TTL_MS;
  const sig = await hmacHex(`${clinicId}:${expiry}`);
  const store = await cookies();
  store.set({
    name: COOKIE_NAME,
    value: `${expiry}.${sig}`,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(TTL_MS / 1000),
  });
}

export async function clearAttendanceDeviceUnlocked(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** この端末が登録済み（解錠済み）か。 */
export async function isAttendanceDeviceUnlocked(clinicId: string): Promise<boolean> {
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
