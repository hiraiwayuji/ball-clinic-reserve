import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getLineAccessToken } from "@/lib/admin-notify";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";

/**
 * LINE 連携のヘルスチェック。
 *
 * 各院セットアップ後の動作確認・トラブルシューティング用。
 * - env の有無（LINE_CHANNEL_ID/SECRET/ACCESS_TOKEN）
 * - 動的トークン取得が成功するか（ID + SECRET 経由）
 * - LINE API /v2/bot/info が叩けるか（基本的に token 検証）
 * - admin_notification_targets テーブルに通知先がいくつ登録されているか
 *
 * /api/line/health で誰でも GET できる（機密値は返さない）。
 */
export async function GET() {
  const channelId = process.env.LINE_CHANNEL_ID;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const channelAccessTokenStatic = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const ownerLineUserId = process.env.OWNER_LINE_USER_ID;
  const lineOfficialUrl = process.env.NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL;
  const clinicId = PUBLIC_CLINIC_ID;

  const result: {
    ok: boolean;
    env: {
      hasChannelId: boolean;
      hasChannelSecret: boolean;
      hasStaticAccessToken: boolean;
      hasOwnerLineUserId: boolean;
      lineOfficialUrl: string | null;
    };
    tokenSource: "client_credentials" | "static_token" | "none";
    tokenValid: boolean | null;
    botInfo: { userId?: string; basicId?: string; displayName?: string; pictureUrl?: string } | null;
    statusCode: number | null;
    notificationTargets: {
      clinicId: string;
      enabledCount: number;
      hasOwnerEnvFallback: boolean;
    };
    warnings: string[];
    error: string | null;
    checkedAt: string;
  } = {
    ok: false,
    env: {
      hasChannelId: Boolean(channelId),
      hasChannelSecret: Boolean(channelSecret),
      hasStaticAccessToken: Boolean(channelAccessTokenStatic),
      hasOwnerLineUserId: Boolean(ownerLineUserId),
      lineOfficialUrl: lineOfficialUrl ?? null,
    },
    tokenSource: "none",
    tokenValid: null,
    botInfo: null,
    statusCode: null,
    notificationTargets: {
      clinicId,
      enabledCount: 0,
      hasOwnerEnvFallback: Boolean(ownerLineUserId),
    },
    warnings: [],
    error: null,
    checkedAt: new Date().toISOString(),
  };

  // ── 警告ロジック ──
  if (channelId && channelSecret) {
    result.tokenSource = "client_credentials";
  } else if (channelAccessTokenStatic) {
    result.tokenSource = "static_token";
    result.warnings.push("LINE_CHANNEL_ID または LINE_CHANNEL_SECRET が未設定。静的 token フォールバック使用中。token 失効リスクあり。");
  } else {
    result.tokenSource = "none";
    result.warnings.push("LINE 認証情報が一切設定されていません。通知は送信できません。");
  }

  if (lineOfficialUrl && !/^https?:\/\/(line\.me|lin\.ee)\//.test(lineOfficialUrl)) {
    result.warnings.push(`NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL が LINE 形式ではありません: ${lineOfficialUrl}`);
  }

  // ── 動的 / 静的 token 取得テスト ──
  const token = await getLineAccessToken();
  if (!token) {
    result.tokenValid = false;
    result.error = "アクセストークンを取得できませんでした。";
    return NextResponse.json(result, { status: 200 });
  }

  // ── LINE API で token と bot 情報を確認 ──
  try {
    const res = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    result.statusCode = res.status;
    if (res.ok) {
      const json = await res.json();
      result.tokenValid = true;
      result.botInfo = {
        userId: json.userId,
        basicId: json.basicId,
        displayName: json.displayName,
        pictureUrl: json.pictureUrl,
      };
    } else {
      result.tokenValid = false;
      const text = await res.text();
      result.error = `LINE API ${res.status}: ${text.slice(0, 300)}`;
    }
  } catch (err: any) {
    result.tokenValid = false;
    result.error = `fetch error: ${err?.message ?? String(err)}`;
  }

  // ── admin_notification_targets テーブル状態 ──
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const sb = createClient(url, key, { auth: { persistSession: false } });
      const { count, error } = await sb
        .from("admin_notification_targets")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .eq("enabled", true);
      if (error) {
        result.warnings.push(`通知先テーブル参照エラー: ${error.message}`);
      } else {
        result.notificationTargets.enabledCount = count ?? 0;
        if ((count ?? 0) === 0 && !ownerLineUserId) {
          result.warnings.push("admin_notification_targets が 0 件かつ OWNER_LINE_USER_ID env も未設定。予約通知の宛先がありません。");
        }
      }
    } else {
      result.warnings.push("Supabase 接続情報が不足。テーブル参照不能。");
    }
  } catch (err: any) {
    result.warnings.push(`通知先テーブル参照例外: ${err?.message ?? String(err)}`);
  }

  result.ok =
    result.tokenValid === true &&
    (result.notificationTargets.enabledCount > 0 || result.notificationTargets.hasOwnerEnvFallback);

  return NextResponse.json(result, { status: 200 });
}
