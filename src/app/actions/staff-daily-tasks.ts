"use server";

import { checkAdminAuth, getMyStaffId } from "@/app/actions/auth";
import { getDayStaffSummary } from "@/app/actions/staff-schedule";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

export type TaskKind = "manual" | "karte" | "morning" | "sns" | "cleaning" | "other";
export type TaskPriority = "low" | "normal" | "high";

// 業務テンプレ（TASK_TEMPLATES）の値は "@/lib/daily-task-templates" に分離。
// "use server" ファイルからは値（オブジェクト/配列）を export できないため
// （本番ビルドで "A use server file can only export async functions" エラーになる）。

export type DailyTask = {
  id: string;
  staff_id: string | null;
  staff_name: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  status: "pending" | "done";
  priority: TaskPriority;
  task_kind: TaskKind;
  linked_appointment_id: string | null;
  approved: boolean;
  source: "ai" | "manual";
  line_sent_at: string | null;
  created_at: string;
  completed_at: string | null;
};

function mapRow(r: any): DailyTask {
  return {
    id: r.id,
    staff_id: r.staff_id,
    staff_name: Array.isArray(r.reservation_staff) ? r.reservation_staff[0]?.name : r.reservation_staff?.name ?? null,
    title: r.title,
    description: r.description,
    due_date: r.due_date,
    status: r.status,
    priority: r.priority,
    task_kind: r.task_kind ?? "manual",
    linked_appointment_id: r.linked_appointment_id ?? null,
    approved: r.approved ?? true,
    source: r.source ?? "manual",
    line_sent_at: r.line_sent_at ?? null,
    created_at: r.created_at,
    completed_at: r.completed_at,
  };
}

const SELECT = "id, staff_id, title, description, due_date, status, priority, task_kind, linked_appointment_id, approved, source, line_sent_at, created_at, completed_at, reservation_staff(name)";

/**
 * 院長用：指定日の全タスク（承認待ち含む）をスタッフ別に取得。
 */
export async function listDailyTasksForDate(
  dateStr: string,
): Promise<{ success: boolean; tasks?: DailyTask[]; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  const { data, error } = await sb
    .from("staff_tasks")
    .select(SELECT)
    .eq("clinic_id", clinicId)
    .eq("due_date", dateStr)
    .order("approved", { ascending: true })
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, tasks: (data ?? []).map(mapRow) };
}

/**
 * 先生用：ログイン中の自分の「承認済み・当日」タスクを取得。
 */
export async function getMyDayTasks(
  dateStr: string,
): Promise<{ success: boolean; tasks?: DailyTask[]; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const staffId = await getMyStaffId();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };
  if (!staffId) return { success: true, tasks: [] };

  const { data, error } = await sb
    .from("staff_tasks")
    .select(SELECT)
    .eq("clinic_id", clinicId)
    .eq("staff_id", staffId)
    .eq("due_date", dateStr)
    .eq("approved", true)
    .order("status", { ascending: true })
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, tasks: (data ?? []).map(mapRow) };
}

/**
 * AI秘書：指定日の各先生の「やってほしい業務」案を自動生成。
 * approved=false / source=ai で保存し、院長承認後に先生へ表示・LINE送信される。
 * 既存の ai 生成・未承認タスク（同日）は作り直す（重複しない）。
 */
export async function generateDailyTasks(
  dateStr: string,
  extraInstruction?: string,
): Promise<{ success: boolean; created?: number; error?: string }> {
  const { clinicId, email } = await checkAdminAuth();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "GEMINI_API_KEY が未設定です（AI生成は使えません）" };

  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };

  // 各先生の出勤・予約状況
  const summary = await getDayStaffSummary(dateStr);
  if (!summary.success || !summary.summaries) {
    return { success: false, error: summary.error ?? "出勤情報の取得に失敗しました" };
  }
  // 出勤する先生のみ（受付・休みは除く）
  const working = summary.summaries.filter(
    (s) => !s.isOff && s.showInTimeline !== false && s.role !== "reception",
  );
  if (working.length === 0) return { success: false, error: "この日に出勤予定の先生がいません" };

  // 院の方針
  const { data: settings } = await sb
    .from("clinic_settings")
    .select("clinic_name, shift_policy")
    .eq("id", clinicId)
    .maybeSingle();
  const clinicName = (settings?.clinic_name as string) || "当院";

  // 各先生の状況テキスト
  const staffLines = working.map((s) => {
    const hours = s.startTime && s.endTime ? `${s.startTime}-${s.endTime}` : "時間未設定";
    const brk = s.breakStart && s.breakEnd ? ` 休憩${s.breakStart}-${s.breakEnd}` : "";
    return `- ${s.staffName}（${s.role ?? "施術"}）: 出勤${hours}${brk} / 本日の予約${s.appointmentCount}件`;
  }).join("\n");

  const prompt = `あなたは接骨院の優秀なAI秘書です。${clinicName}の${dateStr}（本日）について、出勤する各先生が「予約の合間の空き時間」や「患者さんが終わったあと」にやるべき業務を、先生ごとに1〜3個ずつ提案してください。

【出勤する先生と本日の状況】
${staffLines}

【この院で空き時間にやってほしい業務（この中から状況に合わせて選ぶ）】
- 柔整書類の確認（レセプト提出を見据えた書類チェック）
- 保険証の確認
- カルテ作業・施術記録のまとめ・カルテ整理
- 受付業務のお手伝い
- ベッドメイキング
- 細かい場所のお掃除
- トイレ掃除
- 予約の少ない時間帯のSNS投稿・ブログ下書き

【割り当ての方針】
- 「森藤」先生・「森川」先生には、柔整書類の確認や掃除などの業務を優先的に多めに割り当てる（評価を上げたいため）
- 予約が多くて余裕のない先生にはタスクを少なめ（または0）に
- kind は karte=書類/カルテ系, cleaning=掃除/ベッドメイキング系, other=受付お手伝い等, sns=SNS/ブログ
${extraInstruction ? `\n【院長からの追加指示】\n${extraInstruction}` : ""}

# 出力（JSON配列のみ・前置き不要・マークダウンのコードフェンス不要）
各要素は次の形式:
{"staff_name": "先生の名前（上のリストと完全一致）", "title": "短い業務名（20字以内）", "kind": "karte|sns|cleaning|other", "priority": "high|normal|low", "note": "ひとことの補足（任意・30字以内）"}

予約が多すぎて余裕がない先生にはタスクを少なめに。現実的で具体的に。`;

  let items: { staff_name: string; title: string; kind?: string; priority?: string; note?: string }[] = [];
  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: "gemini-2.5-flash" });
    const res = await model.generateContent(prompt);
    let text = res.response.text().trim();
    // コードフェンス除去
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) items = parsed;
  } catch (e: any) {
    console.error("[generateDailyTasks] error:", e);
    return { success: false, error: "AI生成に失敗しました（時間をおいて再度お試しください）" };
  }

  if (items.length === 0) return { success: true, created: 0 };

  // 名前 → staff_id
  const nameToId = new Map(working.map((s) => [s.staffName, s.staffId]));

  // 既存の ai 生成・未承認（同日）を削除して入れ直す
  await sb
    .from("staff_tasks")
    .delete()
    .eq("clinic_id", clinicId)
    .eq("due_date", dateStr)
    .eq("source", "ai")
    .eq("approved", false)
    .eq("status", "pending");

  const validKinds: TaskKind[] = ["karte", "sns", "cleaning", "other"];
  const validPriorities: TaskPriority[] = ["low", "normal", "high"];

  const rows = items
    .map((it) => {
      const staffId = nameToId.get(it.staff_name);
      if (!staffId || !it.title?.trim()) return null;
      const kind = validKinds.includes(it.kind as TaskKind) ? (it.kind as TaskKind) : "other";
      const priority = validPriorities.includes(it.priority as TaskPriority) ? (it.priority as TaskPriority) : "normal";
      return {
        clinic_id: clinicId,
        staff_id: staffId,
        title: it.title.trim().slice(0, 60),
        description: it.note?.trim()?.slice(0, 120) || null,
        due_date: dateStr,
        status: "pending",
        priority,
        task_kind: kind,
        approved: false,
        source: "ai",
        created_by_email: email ?? null,
      };
    })
    .filter(Boolean) as object[];

  if (rows.length === 0) return { success: true, created: 0 };

  // tenant-isolation-ignore: 各行に clinic_id を明示設定済み
  const { error } = await sb.from("staff_tasks").insert(rows);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/tasks");
  return { success: true, created: rows.length };
}

/**
 * 先生が自分でタスクを追加（「朝掃除した」「カルテ整理した」等の記録も可）。
 * 自己追加は承認不要（approved=true）。done=true で「やった記録」として即完了登録もできる。
 */
export async function addMyTask(input: {
  title: string;
  task_kind?: TaskKind;
  priority?: TaskPriority;
  done?: boolean;
  dateStr: string;
}): Promise<{ success: boolean; error?: string }> {
  const { clinicId, email } = await checkAdminAuth();
  const staffId = await getMyStaffId();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };
  if (!staffId) return { success: false, error: "スタッフ情報が見つかりません（メール紐付けをご確認ください）" };
  if (!input.title?.trim()) return { success: false, error: "業務名を入力してください" };

  const { error } = await sb.from("staff_tasks").insert({
    clinic_id: clinicId,
    staff_id: staffId,
    title: input.title.trim().slice(0, 60),
    due_date: input.dateStr,
    status: input.done ? "done" : "pending",
    completed_at: input.done ? new Date().toISOString() : null,
    priority: input.priority ?? "normal",
    task_kind: input.task_kind ?? "other",
    approved: true,
    source: "manual",
    created_by_email: email ?? null,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/dashboard");
  return { success: true };
}

/** 院長承認：1件を承認（先生に表示される）。 */
export async function approveTask(id: string): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };
  const { error } = await sb
    .from("staff_tasks")
    .update({ approved: true })
    .eq("id", id)
    .eq("clinic_id", clinicId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/dashboard");
  return { success: true };
}

/** 院長承認：指定日の未承認タスクを一括承認。 */
export async function approveAllTasksForDate(dateStr: string): Promise<{ success: boolean; approved?: number; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };
  const { data, error } = await sb
    .from("staff_tasks")
    .update({ approved: true })
    .eq("clinic_id", clinicId)
    .eq("due_date", dateStr)
    .eq("approved", false)
    .eq("status", "pending")
    .select("id");
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/dashboard");
  return { success: true, approved: data?.length ?? 0 };
}

/** タスクの完了/未完了を切り替え（先生・院長どちらも可）。 */
export async function toggleTaskDone(id: string, done: boolean): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };
  const { error } = await sb
    .from("staff_tasks")
    .update({ status: done ? "done" : "pending", completed_at: done ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("clinic_id", clinicId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/dashboard");
  return { success: true };
}

/** 手動でタスク追加（院長が先生に割当）。手動は即承認(approved=true)。 */
export async function addManualTask(input: {
  staff_id: string;
  title: string;
  due_date: string;
  priority?: TaskPriority;
  task_kind?: TaskKind;
  description?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const { clinicId, email } = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };
  if (!input.staff_id || !input.title?.trim() || !input.due_date) {
    return { success: false, error: "必須項目が不足しています" };
  }
  const { error } = await sb.from("staff_tasks").insert({
    clinic_id: clinicId,
    staff_id: input.staff_id,
    title: input.title.trim().slice(0, 60),
    description: input.description?.trim()?.slice(0, 120) || null,
    due_date: input.due_date,
    status: "pending",
    priority: input.priority ?? "normal",
    task_kind: input.task_kind ?? "manual",
    approved: true,
    source: "manual",
    created_by_email: email ?? null,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/dashboard");
  return { success: true };
}

/** タスク削除。 */
export async function deleteTask(id: string): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };
  const { error } = await sb.from("staff_tasks").delete().eq("id", id).eq("clinic_id", clinicId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/dashboard");
  return { success: true };
}

/** タスクのタイトル/優先度を編集（院長）。 */
export async function updateTask(id: string, patch: { title?: string; priority?: TaskPriority }): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const sb = getServiceClient();
  if (!sb) return { success: false, error: "サーバー設定エラー" };
  const upd: Record<string, unknown> = {};
  if (patch.title !== undefined) upd.title = patch.title.trim().slice(0, 60);
  if (patch.priority !== undefined) upd.priority = patch.priority;
  if (Object.keys(upd).length === 0) return { success: true };
  const { error } = await sb.from("staff_tasks").update(upd).eq("id", id).eq("clinic_id", clinicId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/dashboard");
  return { success: true };
}
