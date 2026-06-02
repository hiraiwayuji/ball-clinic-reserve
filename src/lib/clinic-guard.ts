/**
 * クリニック識別の不整合ガード（他院ドメインのボール・フォールバック対策）。
 *
 * 各院は同一リポジトリの別 Vercel プロジェクトで、クリニック識別は
 * NEXT_PUBLIC_CLINIC_*（ビルド時埋め込み）のみ。env が正しく焼き込まれないと
 * `PUBLIC_CLINIC_ID` がボール接骨院(default)へサイレント・フォールバックし、
 * 他院ドメインなのに予約データがボールの clinic_id に保存される事故が起きうる。
 *
 * このガードは「解決された clinic_id がボール default なのに、別院であるべき証拠がある」
 * 状態を検知し、予約の書き込みを止める。誤爆を避けるため、ボール default に解決された
 * ときだけ評価し、非デフォルトに解決されていれば常に正常扱い。
 */
import { headers } from "next/headers";
import { PUBLIC_CLINIC_ID } from "./default-clinic-id";

const BALL_DEFAULT_ID = "00000000-0000-0000-0000-000000000001";

// 既知の「非ボール院」ドメイン → 本来の clinic_id。
// フルフォールバック（env が丸ごと未設定で NAME も空）の検知に使う。
// 新しい独自ドメインを足すたびにここへ追記する。
const NON_BALL_HOSTS: Record<string, string> = {
  "karada-clinic.vercel.app":  "d3b55abc-46a6-4cbe-8198-21c0392d9a2e",
  "karada-sinkyu.jp":          "d3b55abc-46a6-4cbe-8198-21c0392d9a2e",
  "www.karada-sinkyu.jp":      "d3b55abc-46a6-4cbe-8198-21c0392d9a2e",
  "muscleseitai.vercel.app":   "9f2a3359-3f84-451a-9ccd-d50cb3dd8bbd",
  "relaq-clinic.vercel.app":   "021efe2a-a768-4fa6-9de8-62cae9a79d47",
};

export type ClinicGuardResult = { misconfigured: boolean; reason: string | null };

/**
 * 予約書き込み前に呼ぶ。misconfigured=true なら書き込みを止めること。
 */
export async function detectClinicMisconfig(): Promise<ClinicGuardResult> {
  // 非デフォルト clinic に解決できていれば正常（誤爆させない）
  if (PUBLIC_CLINIC_ID !== BALL_DEFAULT_ID) {
    return { misconfigured: false, reason: null };
  }

  // ── 以降、clinic_id がボール default に解決されているケースのみ精査 ──

  // (1) env 不整合: 院名は焼き込まれているのに id だけ default に落ちている＝部分bake
  const envName = process.env.NEXT_PUBLIC_CLINIC_NAME ?? "";
  if (envName.trim()) {
    return {
      misconfigured: true,
      reason: `env不整合: NEXT_PUBLIC_CLINIC_NAME="${envName}" なのに clinic_id がボールdefaultにフォールバック`,
    };
  }

  // (2) host 不整合: 既知の非ボール院ドメインなのに clinic_id がボール default＝フルフォールバック
  try {
    const h = await headers();
    const host = (h.get("host") ?? "").toLowerCase().trim();
    const expected = NON_BALL_HOSTS[host];
    if (expected && expected !== BALL_DEFAULT_ID) {
      return {
        misconfigured: true,
        reason: `host=${host} は別院のはずだが clinic_id がボールdefaultにフォールバック`,
      };
    }
  } catch {
    // headers() が使えない文脈（ビルド時等）は素通り
  }

  return { misconfigured: false, reason: null };
}

/** 予約ブロック時に患者へ返す文言（電話/LINE 誘導） */
export const CLINIC_MISCONFIG_USER_MESSAGE =
  "ただいまシステム調整中のため、Web予約を一時停止しています。お手数ですが、お電話またはLINEにてご予約ください。";
