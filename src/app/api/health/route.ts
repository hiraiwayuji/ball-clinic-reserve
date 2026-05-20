/**
 * 公開ヘルスチェック + Supabase warm 維持 + 異常時 LINE 通知
 *
 * 用途:
 *   - 外部 cron (UptimeRobot 等) から認証なしで毎5分叩く
 *   - 軽量 SELECT で Postgres を warm に保つ（朝一 504 対策）
 *   - 応答が遅い / DB エラー時に院長 LINE へ自動通知
 *
 * 認証なし。ただし軽量で副作用なしのため安全。
 *
 * 経緯:
 *   2026-05-21 に pg_cron 暴走 + Postgres connection 枯渇で全画面真っ白事故。
 *   ぼーるくんが気づくのに数時間ラグがあった。
 *   この endpoint を 5 分間隔で外部から叩くことで:
 *     1. cold start を防ぐ
 *     2. 異常を「ぼーるくんが気づく前に」LINE で検知
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pushLineToOwners } from "@/lib/admin-notify";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Supabase が遅い/壊れたと判断する閾値 (ms) */
const SLOW_THRESHOLD_MS = 5000;

/** 通知の重複抑止のため、前回送信時刻を module スコープに保持。
 *  サーバーレスだとインスタンス毎にリセットされるが、誤通知の連続だけ抑えられれば十分。 */
let lastAlertSent = 0;
const ALERT_COOLDOWN_MS = 10 * 60 * 1000; // 10分間は同じ系統のアラートを再送しない

async function maybeAlert(clinicId: string, summary: string) {
  const now = Date.now();
  if (now - lastAlertSent < ALERT_COOLDOWN_MS) {
    console.warn("[healthcheck] alert suppressed (cooldown):", summary);
    return;
  }
  lastAlertSent = now;
  try {
    await pushLineToOwners(clinicId, `🚨【自動監視】本番ヘルスチェック異常\n\n${summary}\n\nURL: https://ball-clinic-reserve.vercel.app/api/health\n時刻: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`);
  } catch (err) {
    console.error("[healthcheck] failed to push LINE alert:", err);
  }
}

export async function GET() {
  const startedAt = Date.now();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.json(
      { ok: false, error: "env missing" },
      { status: 500 },
    );
  }

  // anon キーで軽量クエリ。これだけで Postgres を warm に保てる。
  // テナント分離もちゃんと: clinic_settings.id でフィルタするので全院影響なし。
  const sb = createClient(url, anonKey, { auth: { persistSession: false } });

  let dbMs: number | null = null;
  let dbError: string | null = null;
  try {
    const t = Date.now();
    const { error } = await sb
      .from("clinic_settings")
      .select("id")
      .eq("id", PUBLIC_CLINIC_ID)
      .maybeSingle();
    dbMs = Date.now() - t;
    if (error) dbError = error.message;
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  const totalMs = Date.now() - startedAt;
  const ok = !dbError && dbMs !== null && dbMs < SLOW_THRESHOLD_MS;

  // 異常時は院長 LINE に通知（cooldown 制御で連投しない）
  if (!ok) {
    const summary = [
      dbError ? `DB エラー: ${dbError}` : null,
      dbMs !== null && dbMs >= SLOW_THRESHOLD_MS
        ? `DB 応答が遅い: ${dbMs}ms (閾値 ${SLOW_THRESHOLD_MS}ms)`
        : null,
    ]
      .filter(Boolean)
      .join("\n");
    // await しない（healthcheck の応答を遅らせない）
    void maybeAlert(PUBLIC_CLINIC_ID, summary);
  }

  return NextResponse.json(
    {
      ok,
      dbMs,
      dbError,
      totalMs,
      slowThresholdMs: SLOW_THRESHOLD_MS,
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
