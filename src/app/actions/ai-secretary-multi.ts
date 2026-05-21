"use server";

// Phase 3: AI 秘書マルチエージェント
// - オーナー秘書: 直近の audit_log + 予約 + 売上から経営の「気付き」を生成
// - スタッフ秘書: 自分の予約担当数・キャンセル数・リピート率からモチベメッセージを生成
// - Gemini API を共通基盤として使用

import { checkAdminAuth, requireRole } from "@/app/actions/auth";
import { getLatestSignalsForClinic } from "@/app/actions/external-signals";
import { getTaskLoadByStaff, listTasks } from "@/app/actions/staff-schedule";
import { CLINIC_CONFIG } from "@/lib/clinic-config";
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

export type AlertCategory = "urgent" | "thisWeek" | "thisMonth" | "longTerm";

export type OwnerAlert = {
  category: AlertCategory;
  message: string;
  /** dismiss 用の決定的キー（同内容なら同じ値）。dismiss されたら以後の briefing で除外 */
  id?: string;
  /** タップで遷移する解決ページの URL */
  actionUrl?: string;
};

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
  alerts: string[]; // 後方互換のため残す（全カテゴリのメッセージをフラットに収納）
  alertsV2?: OwnerAlert[];
};

export async function generateOwnerBriefing(): Promise<{ success: boolean; briefing?: OwnerBriefing; error?: string }> {
  const auth = await requireRole(["owner"]);
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 違和感検知用の参照範囲（今日〜2週間先の予約・全顧客の電話/名前）
  const todayStr = new Date().toISOString().split("T")[0];
  const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

  // ── 並列で集計 ──
  const [auditRes, apptRes, cancelRes, salesRes, upcomingRes, customersRes] = await Promise.all([
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
      .select("treatment_fee, sale_date")
      .eq("clinic_id", auth.clinicId)
      .gte("sale_date", since.split("T")[0]),
    // 違和感検知: 今日〜2週間先の予約（顧客名・電話を結合）
    sb
      .from("appointments")
      .select("id, start_time, customer_id, customers(id, name, phone)")
      .eq("clinic_id", auth.clinicId)
      .neq("status", "cancelled")
      .gte("start_time", `${todayStr}T00:00:00+09:00`)
      .lte("start_time", twoWeeksLater),
    // 同一電話で別名義の登録チェック用（軽いので最大 500 件）
    sb
      .from("customers")
      .select("id, name, phone")
      .eq("clinic_id", auth.clinicId)
      .not("phone", "is", null)
      .limit(500),
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
  const last7DaysRevenue = (salesRes.data ?? []).reduce((sum: number, r: any) => sum + (r.treatment_fee ?? 0), 0);
  const cancelRate = last7DaysAppointments > 0 ? Math.round((last7DaysCancellations / last7DaysAppointments) * 100) : 0;

  // ── ローカル異常検知（Gemini が動かなくてもアラートは出る） ──
  const alertsV2: OwnerAlert[] = [];
  const pushAlert = (category: AlertCategory, message: string, opts?: { id?: string; actionUrl?: string }) => {
    alertsV2.push({ category, message, id: opts?.id, actionUrl: opts?.actionUrl });
  };

  if (last7DaysDeletedByStaff >= 3) {
    pushAlert("urgent", `スタッフによる予約削除が ${last7DaysDeletedByStaff} 件あります。理由を確認してください。`, {
      id: "staff-delete-spike-7d",
      actionUrl: "/admin/appointments?status=cancelled",
    });
  }
  if (cancelRate >= 30) {
    pushAlert("urgent", `キャンセル率が ${cancelRate}% と高めです。リマインド運用を見直しましょう。`, {
      id: "high-cancel-rate-7d",
      actionUrl: "/admin/appointments?status=cancelled",
    });
  }
  const failedUnlocks = audits.filter((a: any) => a.action_type === "passcode.unlock_failed").length;
  if (failedUnlocks >= 3) {
    pushAlert("urgent", `設定画面の解錠失敗が ${failedUnlocks} 回。第三者操作の可能性。`, {
      id: "passcode-unlock-failed-7d",
      actionUrl: "/admin/settings",
    });
  }
  const settingsRequests = audits.filter((a: any) => a.action_type === "settings.request").length;
  if (settingsRequests > 0) {
    pushAlert("urgent", `スタッフからの設定変更申請が ${settingsRequests} 件、承認待ちです。`, {
      id: "settings-requests-pending",
      actionUrl: "/admin/approvals",
    });
  }

  // ── 違和感検知（予約・顧客の整合性チェック） ──
  // 1) 同じ日に同じ顧客の予約が複数（重複疑い）
  type ApptRow = { id: string; start_time: string; customer_id: string | null; customers: { id: string; name: string; phone: string | null } | { id: string; name: string; phone: string | null }[] | null };
  const upcoming: ApptRow[] = (upcomingRes.data ?? []) as any[];
  const pickCustomer = (c: ApptRow["customers"]) => Array.isArray(c) ? c[0] : c;
  const sameDayMap = new Map<string, { name: string; date: string; ids: string[] }>();
  for (const a of upcoming) {
    const cust = pickCustomer(a.customers);
    if (!cust?.name) continue;
    const dateKey = a.start_time.slice(0, 10); // YYYY-MM-DD（JST 想定で UTC 寄りでもザックリ把握）
    const key = `${dateKey}|${cust.id ?? cust.name}`;
    const cur = sameDayMap.get(key) ?? { name: cust.name, date: dateKey, ids: [] };
    cur.ids.push(a.id);
    sameDayMap.set(key, cur);
  }
  const duplicates = [...sameDayMap.values()].filter((v) => v.ids.length >= 2);
  if (duplicates.length > 0) {
    const head = duplicates.slice(0, 3);
    const tail = duplicates.length > 3 ? `（他 ${duplicates.length - 3} 件）` : "";
    // 最初の重複を actionUrl のターゲットにする
    const first = duplicates[0];
    pushAlert(
      "urgent",
      `同じ日に同名の予約が重複しています。確認してください: ${head
        .map((d) => `${d.date} ${d.name}様（${d.ids.length}件）`)
        .join(" / ")}${tail}`,
      {
        id: `duplicate-booking-${first.date}-${first.name}`,
        actionUrl: `/admin/appointments?date=${first.date}&q=${encodeURIComponent(first.name)}`,
      }
    );
  }

  // 2) 同一電話番号で別名義の顧客（家族予約 or 入力ミスの疑い）
  const customers = (customersRes.data ?? []) as { id: string; name: string; phone: string | null }[];
  const phoneToNames = new Map<string, Set<string>>();
  for (const c of customers) {
    if (!c.phone) continue;
    const normalized = c.phone.replace(/[^\d]/g, "");
    if (normalized.length < 6) continue;
    const set = phoneToNames.get(normalized) ?? new Set<string>();
    set.add(c.name);
    phoneToNames.set(normalized, set);
  }
  const phoneConflicts = [...phoneToNames.entries()].filter(([, names]) => names.size >= 2);
  if (phoneConflicts.length > 0) {
    const head = phoneConflicts.slice(0, 3).map(([phone, names]) => {
      const masked = phone.length >= 4 ? `${phone.slice(0, 3)}***${phone.slice(-2)}` : "***";
      return `${masked}（${[...names].slice(0, 3).join("・")}）`;
    });
    const tail = phoneConflicts.length > 3 ? `（他 ${phoneConflicts.length - 3} 件）` : "";
    const firstPhone = phoneConflicts[0][0];
    pushAlert("urgent", `同じ電話番号で別名義の登録が ${phoneConflicts.length} 組あります: ${head.join(" / ")}${tail}（家族予約か入力ミスを確認）`, {
      id: `phone-conflict-${firstPhone}`,
      actionUrl: `/admin/customers?phone=${encodeURIComponent(firstPhone)}`,
    });
  }

  // 3) 直近 14 日に同じ顧客の連続キャンセルが 3 回以上（離脱兆候）
  const cancelByCustomerSince = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data: cancels14d } = await sb
      .from("appointments")
      .select("customer_id, customers(name)")
      .eq("clinic_id", auth.clinicId)
      .eq("status", "cancelled")
      .gte("created_at", cancelByCustomerSince);
    const byCustomer = new Map<string, { name: string; n: number }>();
    for (const r of (cancels14d ?? []) as any[]) {
      if (!r.customer_id) continue;
      const cust = Array.isArray(r.customers) ? r.customers[0] : r.customers;
      const cur = byCustomer.get(r.customer_id) ?? { name: cust?.name ?? "(顧客名不明)", n: 0 };
      cur.n++;
      byCustomer.set(r.customer_id, cur);
    }
    const heavyCancellers = [...byCustomer.values()].filter((v) => v.n >= 3);
    if (heavyCancellers.length > 0) {
      const head = heavyCancellers.slice(0, 3).map((v) => `${v.name}様（${v.n}回）`);
      pushAlert("urgent", `直近2週間でキャンセルが続いている方がいます: ${head.join(" / ")}（連絡確認を）`, {
        id: `heavy-cancellers-${heavyCancellers.length}`,
        actionUrl: "/admin/appointments?status=cancelled",
      });
    }
  } catch {}

  // ─────────────────────────────────────────
  // 追加ルール（既存テーブル + Phase 2 スキーマで実装可能なもの）
  // 失敗しても降格動作するよう個別に try-catch
  // ─────────────────────────────────────────

  // 4) 今週誕生日の患者
  try {
    const { data: birthCustomers } = await sb
      .from("customers")
      .select("id, name, birth_date, birth_month, line_user_id")
      .eq("clinic_id", auth.clinicId);
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();
    const sevenDaysLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const within7 = (m: number, d: number) => {
      // 月跨ぎ対応：今日〜7日後の月日範囲に該当するか
      for (let i = 0; i <= 7; i++) {
        const t = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
        if (t.getMonth() + 1 === m && t.getDate() === d) return true;
      }
      return false;
    };
    const upcoming: { name: string; mmdd: string; hasLine: boolean }[] = [];
    for (const c of (birthCustomers ?? []) as any[]) {
      let m: number | null = c.birth_month ?? null;
      let d: number | null = null;
      if (c.birth_date) {
        const dt = new Date(c.birth_date);
        m = dt.getMonth() + 1;
        d = dt.getDate();
      }
      if (m == null || d == null) continue;
      if (within7(m, d)) {
        upcoming.push({
          name: c.name,
          mmdd: `${m}/${d}`,
          hasLine: !!c.line_user_id,
        });
      }
    }
    if (upcoming.length > 0) {
      const head = upcoming.slice(0, 4).map((u) => `${u.name}様(${u.mmdd}${u.hasLine ? "・LINE◯" : ""})`);
      const tail = upcoming.length > 4 ? `（他 ${upcoming.length - 4} 名）` : "";
      pushAlert("thisWeek", `今週お誕生日: ${head.join(" / ")}${tail}。LINE のお祝い・割引クーポン送付を検討`, {
        id: `birthday-this-week-${currentMonth}-${currentDay}`,
        actionUrl: "/admin/marketing",
      });
    }
    // 月内誕生日合計（今月のキャンペーン提案用）
    const thisMonthTotal = (birthCustomers ?? []).filter((c: any) => {
      if (c.birth_date) return new Date(c.birth_date).getMonth() + 1 === currentMonth;
      return c.birth_month === currentMonth;
    }).length;
    if (thisMonthTotal >= 5 && upcoming.length === 0) {
      pushAlert("thisMonth", `今月の誕生日患者は合計 ${thisMonthTotal} 名。誕生月キャンペーンの一斉配信を準備しましょう。`, {
        id: `birthday-this-month-${currentMonth}`,
        actionUrl: "/admin/marketing",
      });
    }
    // sevenDaysLater は将来の判定で使う可能性あるが今は未使用
    void sevenDaysLater;
    void currentDay;
  } catch {}

  // 5) スタッフ誕生日（今週）
  try {
    const { data: staffList } = await sb
      .from("reservation_staff")
      .select("id, name, birth_date")
      .eq("clinic_id", auth.clinicId)
      .eq("is_active", true);
    const upcoming: string[] = [];
    for (const s of (staffList ?? []) as any[]) {
      if (!s.birth_date) continue;
      const dt = new Date(s.birth_date);
      const m = dt.getMonth() + 1;
      const d = dt.getDate();
      for (let i = 0; i <= 7; i++) {
        const t = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
        if (t.getMonth() + 1 === m && t.getDate() === d) {
          upcoming.push(`${s.name}先生(${m}/${d})`);
          break;
        }
      }
    }
    if (upcoming.length > 0) {
      pushAlert("thisWeek", `スタッフの誕生日が近いです: ${upcoming.join(" / ")}。お祝いの準備を`, {
        id: `staff-birthday-this-week-${upcoming.length}`,
        actionUrl: "/admin/leaderboard",
      });
    }
  } catch {}

  // 6) 新患フォローアップ（来院 7-14 日経過 × 再来予約なし）
  try {
    const since14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const since7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: firstVisits } = await sb
      .from("appointments")
      .select("id, customer_id, start_time, customers(name, line_user_id)")
      .eq("clinic_id", auth.clinicId)
      .eq("is_first_visit", true)
      .neq("status", "cancelled")
      .gte("start_time", since14)
      .lt("start_time", since7);

    const candidates: { id: string; name: string; date: string; hasLine: boolean }[] = [];
    for (const r of (firstVisits ?? []) as any[]) {
      if (!r.customer_id) continue;
      // この顧客の未来予約があるか
      const { data: future } = await sb
        .from("appointments")
        .select("id")
        .eq("clinic_id", auth.clinicId)
        .eq("customer_id", r.customer_id)
        .neq("status", "cancelled")
        .gt("start_time", now.toISOString())
        .limit(1);
      if ((future ?? []).length === 0) {
        const cust = Array.isArray(r.customers) ? r.customers[0] : r.customers;
        candidates.push({
          id: r.id,
          name: cust?.name ?? "(顧客名不明)",
          date: r.start_time.slice(0, 10),
          hasLine: !!cust?.line_user_id,
        });
      }
    }
    if (candidates.length > 0) {
      const head = candidates.slice(0, 4).map((c) => `${c.name}様(${c.date}初診${c.hasLine ? "・LINE◯" : ""})`);
      const tail = candidates.length > 4 ? `（他 ${candidates.length - 4} 名）` : "";
      const first = candidates[0];
      pushAlert("thisMonth", `初診後フォロー候補: ${head.join(" / ")}${tail}。LINE で「その後いかがですか？」声かけを`, {
        id: `first-visit-followup-${first.date}-${first.name}`,
        actionUrl: "/admin/customers",
      });
    }
  } catch {}

  // 7) 長期未来院（60日以上、累計5回以上の優良顧客）
  try {
    const since60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { data: longAppts } = await sb
      .from("appointments")
      .select("customer_id, start_time, customers(name, line_user_id)")
      .eq("clinic_id", auth.clinicId)
      .neq("status", "cancelled")
      .order("start_time", { ascending: false })
      .limit(2000);
    const lastByCustomer = new Map<string, { name: string; last: string; count: number; hasLine: boolean }>();
    for (const r of (longAppts ?? []) as any[]) {
      if (!r.customer_id) continue;
      const cust = Array.isArray(r.customers) ? r.customers[0] : r.customers;
      const cur = lastByCustomer.get(r.customer_id) ?? {
        name: cust?.name ?? "(顧客名不明)",
        last: r.start_time,
        count: 0,
        hasLine: !!cust?.line_user_id,
      };
      cur.count++;
      if (r.start_time > cur.last) cur.last = r.start_time;
      lastByCustomer.set(r.customer_id, cur);
    }
    const lapsed = [...lastByCustomer.values()].filter((v) => v.count >= 5 && v.last < since60);
    if (lapsed.length > 0) {
      const head = lapsed.slice(0, 4).map((v) => `${v.name}様(${v.count}回・最終${v.last.slice(0, 10)}${v.hasLine ? "・LINE◯" : ""})`);
      const tail = lapsed.length > 4 ? `（他 ${lapsed.length - 4} 名）` : "";
      pushAlert("longTerm", `60日以上ご来院のない優良患者: ${head.join(" / ")}${tail}。リテンション施策を`, {
        id: `long-inactive-${lapsed.length}`,
        actionUrl: "/admin/customers",
      });
    }
  } catch {}

  // 8) スタッフ別予約偏り（過去 7 日）
  try {
    const { data: byStaff } = await sb
      .from("appointments")
      .select("staff_id, staff_name")
      .eq("clinic_id", auth.clinicId)
      .neq("status", "cancelled")
      .gte("created_at", since)
      .not("staff_id", "is", null);
    const counts = new Map<string, { name: string; n: number }>();
    for (const r of (byStaff ?? []) as any[]) {
      if (!r.staff_id) continue;
      const cur = counts.get(r.staff_id) ?? { name: r.staff_name ?? "(担当不明)", n: 0 };
      cur.n++;
      counts.set(r.staff_id, cur);
    }
    const vals = [...counts.values()];
    if (vals.length >= 2) {
      const avg = vals.reduce((s, v) => s + v.n, 0) / vals.length;
      const max = vals.reduce((a, b) => (a.n > b.n ? a : b));
      const min = vals.reduce((a, b) => (a.n < b.n ? a : b));
      if (avg > 0 && max.n - min.n >= Math.max(3, avg * 0.6)) {
        pushAlert(
          "thisWeek",
          `担当配分の偏り: ${max.name} ${max.n}件 ／ ${min.name} ${min.n}件（過去7日）。配分の見直しを`,
          {
            id: `staff-load-imbalance-${max.name}-${min.name}`,
            actionUrl: "/admin/settings/staff-schedule",
          }
        );
      }
    }
  } catch {}

  // 9) 地域情報・時事ネタ（天気・インフル・花粉 など）
  let externalSignalsText = "";
  try {
    const signals = await getLatestSignalsForClinic();
    if (signals.length > 0) {
      externalSignalsText = signals
        .filter((s) => s.summary)
        .map((s) => `- ${labelForSignalType(s.signal_type)}: ${s.summary}`)
        .join("\n");
    }
  } catch {}

  // 10) タスク管理（偏り・期限超過・期限近・長期未完了）
  try {
    const taskLoadRes = await getTaskLoadByStaff();
    if (taskLoadRes.success && taskLoadRes.rows && taskLoadRes.rows.length > 0) {
      const assignedRows = taskLoadRes.rows.filter((r) => r.staff_id !== null);
      const sorted = [...assignedRows].sort((a, b) => b.pending - a.pending);
      const top = sorted[0];
      const others = sorted.slice(1);
      const otherAvg = others.length > 0
        ? others.reduce((s, r) => s + r.pending, 0) / others.length
        : 0;

      // タスク集中
      if (top && top.pending >= 8 && (otherAvg === 0 || top.pending >= otherAvg * 2.5)) {
        pushAlert(
          "thisWeek",
          `${top.staff_name} にタスクが集中しています（${top.pending} 件、他平均 ${otherAvg.toFixed(1)} 件）。再分配を検討してください。`,
          {
            id: `task-concentration-${top.staff_name}`,
            actionUrl: "/admin/tasks",
          }
        );
      }

      // 期限超過合計
      const overdueTotal = taskLoadRes.rows.reduce((s, r) => s + r.overdue, 0);
      if (overdueTotal > 0) {
        pushAlert("urgent", `期限超過のタスクが ${overdueTotal} 件あります。`, {
          id: `task-overdue-${overdueTotal}`,
          actionUrl: "/admin/tasks",
        });
      }
    }

    // 期限近 (2日以内) の高優先度
    const tasksRes = await listTasks({ status: "pending" });
    if (tasksRes.success && tasksRes.rows) {
      const todayStr = now.toISOString().slice(0, 10);
      const twoDaysLater = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const soon = tasksRes.rows.filter(
        (t) => t.due_date && t.due_date >= todayStr && t.due_date <= twoDaysLater && t.priority === "high"
      );
      if (soon.length >= 2) {
        pushAlert("thisWeek", `期限が 2 日以内の高優先度タスクが ${soon.length} 件あります。早めの対応を。`, {
          id: `task-due-soon-${soon.length}`,
          actionUrl: "/admin/tasks",
        });
      }

      // 長期未完了 (作成から 30 日経過の pending)
      const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const stale = tasksRes.rows.filter((t) => t.created_at < since30);
      if (stale.length > 0) {
        pushAlert(
          "longTerm",
          `30 日以上未完了のタスクが ${stale.length} 件あります。やる気が出ない案件は思い切って削除も検討してください。`,
          {
            id: `task-stale-${stale.length}`,
            actionUrl: "/admin/tasks",
          }
        );
      }
    }
  } catch {}

  // ── dismiss 済み alert を除外 ──
  // alert_dismissals に記録された alert_id は緊急枠から外す（=「タスクに降格」済み）
  try {
    const dismissedSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: dismissed } = await sb
      .from("alert_dismissals")
      .select("alert_id")
      .eq("clinic_id", auth.clinicId)
      .gte("dismissed_at", dismissedSince);
    const dismissedSet = new Set((dismissed ?? []).map((r: any) => r.alert_id));
    if (dismissedSet.size > 0) {
      for (let i = alertsV2.length - 1; i >= 0; i--) {
        if (alertsV2[i].id && dismissedSet.has(alertsV2[i].id!)) {
          alertsV2.splice(i, 1);
        }
      }
    }
  } catch (e) {
    console.error("[ai-secretary] dismissed filter error (non-fatal):", e);
  }

  // ── 後方互換: フラット alerts を生成 ──
  const alerts: string[] = alertsV2.map((a) => a.message);

  // ── Gemini で経営アドバイスを 1 文生成 ──
  const prompt = `あなたは${CLINIC_CONFIG.ownerNickname}（接骨院オーナー）専属の経営秘書 AI です。
直近 7 日のデータを見て、200 字以内で「今週のひと言」を生成してください。
無駄な前置き禁止、語尾は「〜です」体、絵文字 1 つだけ使用可。
${externalSignalsText ? "\n地域情報があれば、最後に1文「今日のひと言」として患者さんへの声かけ素材を添えること。" : ""}

【データ】
- 予約作成数: ${last7DaysAppointments}
- キャンセル数: ${last7DaysCancellations}（率 ${cancelRate}%）
- スタッフによる予約作成: ${last7DaysCreatedByStaff}
- スタッフによる予約削除: ${last7DaysDeletedByStaff}
- 現金売上合計: ¥${last7DaysRevenue.toLocaleString()}
- 検出されたアラート: ${alerts.length === 0 ? "なし" : alerts.join(" / ")}
${externalSignalsText ? `\n【地域情報・時事ネタ】\n${externalSignalsText}` : ""}
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
      alertsV2,
    },
  };
}

function labelForSignalType(t: string): string {
  switch (t) {
    case "weather_today": return "今日の天気";
    case "weather_forecast": return "天気予報";
    case "influenza_weekly": return "インフル流行";
    case "pollen": return "花粉";
    case "heatstroke_alert": return "熱中症警戒";
    default: return "メモ";
  }
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

  // 自分の未完了タスクをコンテキストに追加（StaffSecretaryWidget の表示と別に、励ましメッセージ内で言及）
  let myTaskContext = "";
  let myTaskCount = 0;
  try {
    const myTasksRes = await listTasks({ status: "pending", staff_id: "me" });
    if (myTasksRes.success && myTasksRes.rows && myTasksRes.rows.length > 0) {
      const todayStr = now.toISOString().slice(0, 10);
      const twoDaysLater = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const overdue = myTasksRes.rows.filter((t) => t.due_date && t.due_date < todayStr);
      const soon = myTasksRes.rows.filter((t) => t.due_date && t.due_date >= todayStr && t.due_date <= twoDaysLater);
      myTaskCount = myTasksRes.rows.length;

      const parts = [`未完了タスク ${myTaskCount} 件`];
      if (overdue.length > 0) parts.push(`期限超過 ${overdue.length} 件`);
      if (soon.length > 0) parts.push(`期限 2 日以内 ${soon.length} 件`);
      myTaskContext = `\n- ${parts.join(" / ")}`;
    }
  } catch {}

  // Gemini で励ましメッセージを 1 つ生成（100 字以内、絵文字可）
  const prompt = `あなたは接骨院スタッフ専属のモチベ向上 AI 秘書です。
スタッフの直近実績を見て、100 字以内で「今日の一言」を生成してください。
ポジティブで具体的、絵文字 1 つだけ可。
${myTaskContext ? "期限超過・期限近のタスクがあれば、優しく1文で言及して。プレッシャー与えすぎず、寄り添う雰囲気で。" : ""}

【スタッフ ${staffEmail ?? "(匿名)"} の実績】
- 直近 7 日の対応予約数: ${handledLast7Days}
- 担当顧客のリピート率: ${repeatRate}%${myTaskContext}`;

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

// ───────── 緊急アラート: 「タスクに降格」する ─────────
/**
 * AI秘書 OwnerAlert をタップして「今は解決しない」を選んだ時の処理。
 * 1. daily_tasks に登録（あとで /admin/tasks で消化）
 * 2. alert_dismissals に記録 → 次回 briefing 生成時に同 alert_id を緊急枠から除外
 *
 * 戻り値: success と新規 task の id（リダイレクト先に使える）
 */
export async function dismissAlertToTask(input: {
  alertId: string;
  alertMessage: string;
  priority?: "high" | "medium" | "low";
}): Promise<{ success: boolean; taskId?: string; error?: string }> {
  try {
    const { clinicId, userId } = await requireRole(["owner", "admin"]);
    const sb = getServiceClient();
    if (!sb) return { success: false, error: "service role unavailable" };

    if (!input.alertId || !input.alertMessage) {
      return { success: false, error: "alertId/alertMessage が必要です" };
    }

    const taskDateStr = new Date().toISOString().slice(0, 10);
    // メッセージ全文をタスク名にすると長いので 60 文字で切る
    const taskName = input.alertMessage.length > 60
      ? input.alertMessage.slice(0, 57) + "..."
      : input.alertMessage;

    const { data: inserted, error: insertErr } = await sb
      .from("daily_tasks")
      .insert([{
        clinic_id: clinicId,
        task_date: taskDateStr,
        task_name: taskName,
        title: taskName,
        status: "pending",
        priority: input.priority ?? "medium",
        reference_content: input.alertMessage, // 全文は reference_content に保持
      }])
      .select("id")
      .single();

    if (insertErr) {
      console.error("[dismissAlertToTask] daily_tasks insert error:", insertErr);
      return { success: false, error: insertErr.message };
    }

    const { error: dismissErr } = await sb
      .from("alert_dismissals")
      .upsert(
        {
          clinic_id: clinicId,
          alert_id: input.alertId,
          dismissed_at: new Date().toISOString(),
          dismissed_by: userId,
        },
        { onConflict: "clinic_id,alert_id" }
      );

    if (dismissErr) {
      // task は登録されたが dismiss 記録失敗。次回 briefing で再表示されるが致命的ではない
      console.error("[dismissAlertToTask] alert_dismissals upsert error (non-fatal):", dismissErr);
    }

    return { success: true, taskId: inserted?.id };
  } catch (e: any) {
    console.error("[dismissAlertToTask] unexpected error:", e);
    return { success: false, error: e?.message ?? "unknown error" };
  }
}
