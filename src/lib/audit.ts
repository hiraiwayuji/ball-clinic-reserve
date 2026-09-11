// Phase 1: 監査ログ書き込みヘルパー
// - service_role クライアントを使い RLS をバイパスして audit_log に INSERT する
// - LINE/メール通知も合わせて行う（staff 操作 or 機微操作のみ）
//
// 失敗してもアプリ本処理は止めないこと（ベストエフォート）。

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getLineAccessToken } from "@/lib/admin-notify";
import { describeLinePushFailure } from "@/lib/line-push-error";

export type AuditActorRole = "owner" | "admin" | "staff" | "unknown" | "system";

export type AuditEntry = {
  clinicId: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole: AuditActorRole;
  actionType: string; // e.g. "appointment.create" / "appointment.delete" / "settings.update"
  targetTable?: string | null;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  diff?: unknown;
};

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key);
}

/** 差分を浅く抽出（同一値はキー自体を残さない） */
function shallowDiff(before: unknown, after: unknown): Record<string, { before: unknown; after: unknown }> | undefined {
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return undefined;
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const result: Record<string, { before: unknown; after: unknown }> = {};
  for (const k of keys) {
    const bv = b[k];
    const av = a[k];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      result[k] = { before: bv, after: av };
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) {
    console.warn("[audit] service role 未設定のため audit_log を書き込めません");
    return;
  }
  const diff = entry.diff ?? shallowDiff(entry.before, entry.after);
  try {
    const { error } = await supabase.from("audit_log").insert({
      clinic_id: entry.clinicId,
      actor_user_id: entry.actorUserId ?? null,
      actor_email: entry.actorEmail ?? null,
      actor_role: entry.actorRole,
      action_type: entry.actionType,
      target_table: entry.targetTable ?? null,
      target_id: entry.targetId ?? null,
      before_data: entry.before ?? null,
      after_data: entry.after ?? null,
      diff: diff ?? null,
    });
    if (error) console.warn("[audit] insert error:", error.message);
  } catch (err) {
    console.warn("[audit] unexpected error:", err);
  }
}

/**
 * 指定クリニックの有効な通知先 LINE user_id を取得する。
 * テーブル admin_notification_targets が空の場合は env の OWNER_LINE_USER_ID をフォールバックとして返す。
 */
async function listLineTargets(clinicId?: string): Promise<string[]> {
  const fallback = process.env.OWNER_LINE_USER_ID ? [process.env.OWNER_LINE_USER_ID] : [];
  if (!clinicId) return fallback;

  const supabase = getServiceClient();
  if (!supabase) return fallback;

  try {
    const { data } = await supabase
      .from("admin_notification_targets")
      .select("line_user_id")
      .eq("clinic_id", clinicId)
      .eq("enabled", true);
    const ids = (data ?? [])
      .map((r: { line_user_id: string | null }) => r.line_user_id)
      .filter((v): v is string => !!v && v.length > 0);
    return ids.length > 0 ? ids : fallback;
  } catch (err) {
    console.warn("[audit-notify] listLineTargets error:", err);
    return fallback;
  }
}

/**
 * staff/admin が機微操作を行ったときに登録済みの通知先（複数）へ LINE Push する。
 * オーナー本人の操作は通知不要（actorRole が 'owner' の場合はスキップ）。
 *
 * 🚨 LINE へ飛ばすのは importance:"important"（削除・日計表の削除・設定変更の申請など、
 *    取り返しがつかない／承認が要る操作）だけ。予約の作成・変更・確定・キャンセル・
 *    日計表の修正といった毎日の受付業務は audit_log（writeAudit）に残るだけで、LINE は送らない。
 *
 * 背景（2026-09-11 からだ鍼灸整骨院）: 受付が共用の staff アカウントになった 8/23 以降、
 * 受付の操作1回ごとに院長の LINE へ通知が飛び、9月上旬で LINE公式アカウントの無料枠
 * （月200通）を使い切った。その結果、患者さんへの予約確定LINEも院長への仮予約通知も
 * 全部 429 で失敗した。通知は「見なくていいものを送らない」が原則。
 */
export type StaffActionImportance = "routine" | "important";

export async function notifyOwnerOfStaffAction(opts: {
  actorRole: AuditActorRole;
  actorEmail?: string | null;
  actionType: string;
  summary: string;
  clinicId?: string;
  /** 省略時は routine（＝LINEは送らない。監査ログのみ） */
  importance?: StaffActionImportance;
}): Promise<void> {
  if (opts.actorRole === "owner") return;
  if ((opts.importance ?? "routine") !== "important") return;

  const targets = await listLineTargets(opts.clinicId);
  if (targets.length === 0) return;
  const token = await getLineAccessToken();
  if (!token) return;

  const actorLabel = `${opts.actorRole.toUpperCase()}${opts.actorEmail ? ` (${opts.actorEmail})` : ""}`;
  const text = `🛡️【スタッフ操作通知】\n操作者: ${actorLabel}\n種別: ${opts.actionType}\n\n${opts.summary}`;

  await Promise.all(
    targets.map(async (to) => {
      try {
        const res = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          const f = describeLinePushFailure(res.status, body);
          console.warn(`[audit-notify] LINE push 失敗: ${res.status} code=${f.code}`, body);
        }
      } catch (err) {
        console.warn("[audit-notify] LINE push エラー:", err);
      }
    }),
  );
}
