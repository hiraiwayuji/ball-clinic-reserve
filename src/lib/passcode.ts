// Phase 1: 設定画面パスコード（4-6桁）の SHA-256 ハッシュ・検証
// - bcrypt 等のネイティブ依存を避けるため Web Crypto を使う
// - 未設定時は既定値 "0000" を許容（オーナーは初回ログイン後に必ず変更すること）

const DEFAULT_PASSCODE = "0000";

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPasscode(passcode: string): Promise<string> {
  const cleaned = passcode.replace(/\D/g, "");
  return sha256Hex(`balladmin::${cleaned}`);
}

export async function verifyPasscode(passcode: string, storedHash: string | null | undefined): Promise<boolean> {
  const cleaned = passcode.replace(/\D/g, "");
  if (cleaned.length < 4 || cleaned.length > 6) return false;
  const candidate = await sha256Hex(`balladmin::${cleaned}`);
  // 未設定の場合は既定値 "0000" を許容
  const fallback = await sha256Hex(`balladmin::${DEFAULT_PASSCODE}`);
  const target = storedHash && storedHash.length > 0 ? storedHash : fallback;
  return candidate === target;
}

export const PASSCODE_DEFAULT_HINT = "未設定の場合は 0000（初期パスコード）";
