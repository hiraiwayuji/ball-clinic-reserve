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
    /** 院設定(clinic_settings)に保存された値の状態。古い値が残ると送信が全滅するため必ず検証する。 */
    storedClinicToken: {
      present: boolean;
      valid: boolean | null;   // present=false なら null
      statusCode: number | null;
    };
    storedClinicSecret: { present: boolean };
    notificationTargets: {
      clinicId: string;
      enabledCount: number;
      hasOwnerEnvFallback: boolean;
    };
    /**
     * 今月の送信通数（LINE Messaging API /v2/bot/message/quota, /quota/consumption）。
     * 無料プランは月200通。使い切ると全 push が 429 になる（2026-09-11 からだで発生）。
     */
    quota: {
      type: "none" | "limited" | "unknown";
      limit: number | null;      // limited のとき上限通数
      used: number | null;       // 今月の使用通数
      remaining: number | null;  // 残り（limited のときだけ）
      exhausted: boolean;        // true なら今月はもう送れない
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
    storedClinicToken: { present: false, valid: null, statusCode: null },
    storedClinicSecret: { present: false },
    notificationTargets: {
      clinicId,
      enabledCount: 0,
      hasOwnerEnvFallback: Boolean(ownerLineUserId),
    },
    quota: { type: "unknown", limit: null, used: null, remaining: null, exhausted: false },
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

  // ── 今月の送信通数（上限に達していると全送信が 429 で失敗する） ──
  try {
    const [quotaRes, usedRes] = await Promise.all([
      fetch("https://api.line.me/v2/bot/message/quota", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
      fetch("https://api.line.me/v2/bot/message/quota/consumption", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
    ]);
    if (quotaRes.ok) {
      const q = (await quotaRes.json()) as { type?: string; value?: number };
      if (q.type === "limited" && typeof q.value === "number") {
        result.quota.type = "limited";
        result.quota.limit = q.value;
      } else if (q.type === "none") {
        result.quota.type = "none";
      }
    }
    if (usedRes.ok) {
      const u = (await usedRes.json()) as { totalUsage?: number };
      if (typeof u.totalUsage === "number") result.quota.used = u.totalUsage;
    }
    if (result.quota.type === "limited" && result.quota.limit !== null && result.quota.used !== null) {
      result.quota.remaining = Math.max(0, result.quota.limit - result.quota.used);
      result.quota.exhausted = result.quota.used >= result.quota.limit;
      if (result.quota.exhausted) {
        result.warnings.push(
          `🚨 LINE公式アカウントの今月の送信上限（${result.quota.limit}通）に達しています（使用 ${result.quota.used}通）。` +
          "患者さんへの確定LINE・院長への通知はすべて失敗します。来月1日に回復。今月中に送るにはプラン変更が必要です。",
        );
      } else if (result.quota.remaining <= Math.ceil(result.quota.limit * 0.2)) {
        result.warnings.push(
          `⚠ LINE公式アカウントの今月の送信通数が残り ${result.quota.remaining}通です（上限 ${result.quota.limit}通）。`,
        );
      }
    }
  } catch (err: any) {
    result.warnings.push(`送信通数の取得で例外: ${err?.message ?? String(err)}`);
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

  // ── 院設定に保存された token / secret の検証 ──
  // 2026-07-17: ボールに古い access token が残っていて LINE送信が全滅していた。
  // 保存値は本来不要（各院の env に CHANNEL_ID/SECRET があるため）なので、
  // 「残っていて無効」を検知できるようにする。
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const sb = createClient(url, key, { auth: { persistSession: false } });
      const { data } = await sb
        .from("clinic_settings")
        .select("line_channel_access_token, line_channel_secret")
        .eq("id", clinicId)
        .maybeSingle();

      const storedToken = (data as { line_channel_access_token: string | null } | null)?.line_channel_access_token?.trim() || null;
      const storedSecret = (data as { line_channel_secret: string | null } | null)?.line_channel_secret?.trim() || null;
      result.storedClinicSecret.present = Boolean(storedSecret);
      result.storedClinicToken.present = Boolean(storedToken);

      if (storedToken) {
        // 保存トークンが実際に使えるかを LINE API で検証する
        try {
          const res = await fetch("https://api.line.me/v2/bot/info", {
            headers: { Authorization: `Bearer ${storedToken}` },
            cache: "no-store",
          });
          result.storedClinicToken.statusCode = res.status;
          result.storedClinicToken.valid = res.ok;
          if (!res.ok) {
            result.warnings.push(
              `🚨 院設定に保存された LINE アクセストークンが無効です（LINE API ${res.status}）。` +
              `多くの送信処理はこれを優先するため、LINE送信が失敗します。設定のトークン欄を空にしてください（env の CHANNEL_ID/SECRET から自動発行されます）。`,
            );
          } else {
            result.warnings.push(
              "院設定に LINE アクセストークンが保存されています。env から自動発行できるため通常は不要です（失効すると送信が壊れる原因になります）。",
            );
          }
        } catch {
          result.storedClinicToken.valid = false;
          result.warnings.push("院設定の保存トークンを検証できませんでした（通信エラー）。");
        }
      }
    }
  } catch (err: any) {
    result.warnings.push(`院設定の検証で例外: ${err?.message ?? String(err)}`);
  }

  result.ok =
    result.tokenValid === true &&
    // 今月の上限に達していたら送信は全部失敗するので ok=false にする
    !result.quota.exhausted &&
    // 保存トークンが残っていて無効なら、送信は失敗するので ok=false にする
    result.storedClinicToken.valid !== false &&
    (result.notificationTargets.enabledCount > 0 || result.notificationTargets.hasOwnerEnvFallback);

  return NextResponse.json(result, { status: 200 });
}
