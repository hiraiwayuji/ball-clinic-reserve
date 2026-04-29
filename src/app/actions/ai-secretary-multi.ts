"use server";

// Phase 3: AI 秘書マルチエージェント
// - オーナー秘書: 直近の audit_log + 予約 + 売上から経営の「気付き」を生成
// - スタッフ秘書: 自分の予約担当数・キャンセル数・リピート率からモチベメッセージを生成
// - Gemini API を共通基盤として使用

import { checkAdminAuth, requireRole } from "@/app/actions/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key);
}

type GeminiOptions = { temperature?: number; maxTokens?: number };

async function callGemini(prompt: string, opts: GeminiOptions = {}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY が未設定です（.env.local に追加してください）" };
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: opts.temperature ?? 0.7, maxOutputTokens: opts.maxTokens ?? 600 },
    });
    const result = await model.generateContent(prompt);
    return { ok: true, text: result.response.text() };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Gemini 呼び出しに失敗しました" };
  }
}

// ───────── オーナー秘書: 経営異常検知 ─────────

export type OwnerBriefing = {
  generatedAt: string;
  metrics: {
    last7DaysAppointments: number;
    last7DaysCancellations: number;
    last7DaysCreatedByStaff: number;
    last7DaysDeletedByStaff: number;
    last7DaysRevenue: number;
    cancelRate: number;
  };
  message: string;
  alerts: string[];
};

export async function generateOwnerBriefing(): Promise<{ success: boolean; briefing?: OwnerBriefing; error?: string }> {
  const auth = await requireRole(["owner"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // ── 並列で集計 ──
  const [auditRes, apptRes, cancelRes, salesRes] = await Promise.all([
    sb
      .from("audit_log")
      .select("action_type, actor_role, actor_email, created_at")
      .eq("clinic_id", auth.clinicId)
      .gte("created_at", since),
    sb
      .from("appointments")
      .select("id, status, created_at")
      .eq("clinic_id", auth.clinicId)
      .gte("created_at", since),
    sb
      .from("appointments")
      .select("id")
      .eq("clinic_id", auth.clinicId)
      .eq("status", "cancelled")
      .gte("created_at", since),
    sb
      .from("cash_sales")
      .select("amount, sale_date")
      .eq("clinic_id", auth.clinicId)
      .gte("sale_date", since.split("T")[0]),
  ]);

  const audits = auditRes.data ?? [];
  const last7DaysAppointments = (apptRes.data ?? []).length;
  const last7DaysCancellations = (cancelRes.data ?? []).length;
  const last7DaysCreatedByStaff = audits.filter(
    (a: any) => a.action_type === "appointment.create" && (a.actor_role === "staff" || a.actor_role === "admin"),
  ).length;
  const last7DaysDeletedByStaff = audits.filter(
    (a: any) => a.action_type === "appointment.delete" && (a.actor_role === "staff" || a.actor_role === "admin"),
  ).length;
  const last7DaysRevenue = (salesRes.data ?? []).reduce((sum: number, r: any) => sum + (r.amount ?? 0), 0);
  const cancelRate = last7DaysAppointments > 0 ? Math.round((last7DaysCancellations / last7DaysAppointments) * 100) : 0;

  // ── ローカル異常検知（Gemini が動かなくてもアラートは出る） ──
  const alerts: string[] = [];
  if (last7DaysDeletedByStaff >= 3) {
    alerts.push(`スタッフによる予約削除が ${last7DaysDeletedByStaff} 件あります。理由を確認してください。`);
  }
  if (cancelRate >= 30) {
    alerts.push(`キャンセル率が ${cancelRate}% と高めです。リマインド運用を見直しましょう。`);
  }
  const failedUnlocks = audits.filter((a: any) => a.action_type === "passcode.unlock_failed").length;
  if (failedUnlocks >= 3) {
    alerts.push(`設定画面の解錠失敗が ${failedUnlocks} 回。第三者操作の可能性。`);
  }
  const settingsRequests = audits.filter((a: any) => a.action_type === "settings.request").length;
  if (settingsRequests > 0) {
    alerts.push(`スタッフからの設定変更申請が ${settingsRequests} 件、承認待ちです。`);
  }

  // ── Gemini で経営アドバイスを 1 文生成 ──
  const prompt = `あなたはぼーるくん（接骨院オーナー）専属の経営秘書 AI です。
直近 7 日のデータを見て、150 字以内で「今週のひと言」を生成してください。
無駄な前置き禁止、語尾は「〜です」体、絵文字 1 つだけ使用可。

【データ】
- 予約作成数: ${last7DaysAppointments}
- キャンセル数: ${last7DaysCancellations}（率 ${cancelRate}%）
- スタッフによる予約作成: ${last7DaysCreatedByStaff}
- スタッフによる予約削除: ${last7DaysDeletedByStaff}
- 現金売上合計: ¥${last7DaysRevenue.toLocaleString()}
- 検出されたアラート: ${alerts.length === 0 ? "なし" : alerts.join(" / ")}
`;

  const ai = await callGemini(prompt, { temperature: 0.6, maxTokens: 200 });
  const message = ai.ok ? ai.text.trim() : `📊 直近 7 日の予約 ${last7DaysAppointments} 件・売上 ¥${last7DaysRevenue.toLocaleString()}。${alerts.length > 0 ? "気になるアラートが出ています。" : "順調な滑り出しです。"}`;

  return {
    success: true,
    briefing: {
      generatedAt: now.toISOString(),
      metrics: {
        last7DaysAppointments,
        last7DaysCancellations,
        last7DaysCreatedByStaff,
        last7DaysDeletedByStaff,
        last7DaysRevenue,
        cancelRate,
      },
      message,
      alerts,
    },
  };
}

// ───────── スタッフ秘書: 個別モチベメッセージ ─────────

export type StaffBriefing = {
  generatedAt: string;
  metrics: {
    handledLast7Days: number;
    repeatRate: number; // 担当した顧客のリピート率
    pointsToday: number; // ゲーミフィケーション用（Phase 4 で実装）
  };
  message: string;
};

export async function generateStaffBriefing(): Promise<{ success: boolean; briefing?: StaffBriefing; error?: string }> {
  const auth = await checkAdminAuth(); // staff/admin/owner 全員 OK（自分の状況を見る）
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const staffEmail = auth.email;

  // 「自分が担当した予約」を audit_log の actor_email で近似
  const { data: myAudits } = await sb
    .from("audit_log")
    .select("action_type, target_id, created_at")
    .eq("clinic_id", auth.clinicId)
    .eq("actor_email", staffEmail)
    .gte("created_at", since);

  const handledIds = Array.from(new Set((myAudits ?? []).map((a: any) => a.target_id).filter(Boolean)));
  const handledLast7Days = (myAudits ?? []).filter((a: any) =>
    ["appointment.create", "appointment.update", "appointment.status"].includes(a.action_type),
  ).length;

  // 担当した予約の顧客のリピート率（簡易: 同顧客の他予約があるか）
  let repeatRate = 0;
  if (handledIds.length > 0) {
    const { data: appts } = await sb
      .from("appointments")
      .select("id, customer_id")
      .eq("clinic_id", auth.clinicId)
      .in("id", handledIds);
    const customerIds = Array.from(new Set((appts ?? []).map((a: any) => a.customer_id).filter(Boolean)));
    if (customerIds.length > 0) {
      const { data: allAppts } = await sb
        .from("appointments")
        .select("customer_id, status")
        .eq("clinic_id", auth.clinicId)
        .in("customer_id", customerIds)
        .neq("status", "cancelled");
      const visitsPerCustomer = new Map<string, number>();
      (allAppts ?? []).forEach((a: any) => {
        visitsPerCustomer.set(a.customer_id, (visitsPerCustomer.get(a.customer_id) ?? 0) + 1);
      });
      const repeats = Array.from(visitsPerCustomer.values()).filter((n) => n >= 2).length;
      repeatRate = customerIds.length > 0 ? Math.round((repeats / customerIds.length) * 100) : 0;
    }
  }

  // Gemini で励ましメッセージを 1 つ生成（80 字以内、絵文字可）
  const prompt = `あなたは接骨院スタッフ専属のモチベ向上 AI 秘書です。
スタッフの直近実績を見て、80 字以内で「今日の一言」を生成してください。
ポジティブで具体的、絵文字 1 つだけ可。

【スタッフ ${staffEmail ?? "(匿名)"} の実績】
- 直近 7 日の対応予約数: ${handledLast7Days}
- 担当顧客のリピート率: ${repeatRate}%`;

  const ai = await callGemini(prompt, { temperature: 0.85, maxTokens: 120 });
  const message = ai.ok
    ? ai.text.trim()
    : handledLast7Days > 0
      ? `🌱 今週は ${handledLast7Days} 件の予約に対応しましたね。リピート率 ${repeatRate}% は素敵な数字です。`
      : `🌱 今週はゆったりペース。次の患者さんに最高の施術を準備しましょう。`;

  return {
    success: true,
    briefing: {
      generatedAt: now.toISOString(),
      metrics: { handledLast7Days, repeatRate, pointsToday: 0 },
      message,
    },
  };
}
