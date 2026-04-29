// Phase 4: ゲーミフィケーション・ポイント加算ヘルパー
// - 監査ログと同様、ベストエフォートで失敗してもアプリ本処理は止めない
// - 加算ルール（POINT_RULES）を一箇所に集約

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const POINT_RULES = {
  "appointment.create": 5, // 予約を作成
  "appointment.complete": 10, // 来院完了 (counter で done に)
  "appointment.update": 1, // 内容修正
  "appointment.no_show": -2, // NoShow 扱い（マイナス）
  "appointment.cancel": -3, // 予約キャンセル
  "sales.record": 8, // 売上記帳
  "expense.record": 4, // 経費登録
  "ai.advice_used": 3, // AI 秘書のアドバイスを実行
} as const;

export type PointReason = keyof typeof POINT_RULES;

export type PointEntry = {
  clinicId: string;
  userId?: string | null;
  userEmail?: string | null;
  reason: PointReason | string; // 任意の文字列も許容（カスタム）
  sourceTable?: string | null;
  sourceId?: string | null;
  /** ルール表に無い理由のときだけ手動指定 */
  pointsOverride?: number;
};

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key);
}

/** スタッフにポイントを加算する。userId がない場合は何もしない（システム操作）。 */
export async function awardPoints(entry: PointEntry): Promise<void> {
  if (!entry.userId) return; // 匿名 / システム操作はスキップ
  const points =
    entry.pointsOverride ?? (POINT_RULES as Record<string, number>)[entry.reason] ?? 0;
  if (points === 0) return;

  const supabase = getServiceClient();
  if (!supabase) return;

  try {
    const { error } = await supabase.from("staff_points").insert({
      clinic_id: entry.clinicId,
      user_id: entry.userId,
      user_email: entry.userEmail ?? null,
      points,
      reason: entry.reason,
      source_table: entry.sourceTable ?? null,
      source_id: entry.sourceId ?? null,
    });
    if (error) console.warn("[gamification] insert error:", error.message);
  } catch (err) {
    console.warn("[gamification] unexpected error:", err);
  }
}
