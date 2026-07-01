"use server";

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";
import { CLINIC_CONFIG } from "@/lib/clinic-config";
import { pushLineToOwners } from "@/lib/admin-notify";
import { checkAdminAuth } from "@/app/actions/auth";
import { findConsecutiveSameWeekdayOffs } from "@/lib/shift-rules";

/**
 * スタッフ月次出勤希望（休み希望アンケート）。
 * - スタッフ用フォームはログイン不要（共通リンク＋名前選択）→ service role でアクセスし PUBLIC_CLINIC_ID に限定。
 * - オーナー用一覧は checkAdminAuth（自院のみ）。
 */

export type ShiftDay = {
  available: boolean;       // true=出勤可能 / false=休み希望（明示）
  start?: string;           // "HH:mm"（出勤可能時のみ）
  end?: string;             // "HH:mm"
  note?: string;
};
export type ShiftDays = Record<string, ShiftDay>; // key = "YYYY-MM-DD"

export type ShiftStaff = { id: string; name: string; display_color: string | null };

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** フォームの名前選択用：自院のアクティブスタッフ一覧（ログイン不要） */
export async function listShiftStaff(): Promise<ShiftStaff[]> {
  const { data } = await admin()
    .from("reservation_staff")
    .select("id, name, display_color")
    .eq("clinic_id", PUBLIC_CLINIC_ID)
    .eq("is_active", true)
    .order("sort_order")
    .order("created_at");
  return (data ?? []) as ShiftStaff[];
}

/** クリニック名（フォーム見出し用） */
export async function getShiftClinicName(): Promise<string> {
  return CLINIC_CONFIG.name;
}

/** 指定スタッフ・月の既存希望を取得（プリフィル用・ログイン不要） */
export async function getShiftRequest(
  staffId: string,
  month: string,
): Promise<{ days: ShiftDays; note: string | null; submittedAt: string | null } | null> {
  if (!staffId || !/^\d{4}-\d{2}$/.test(month)) return null;
  const { data } = await admin()
    .from("staff_shift_requests")
    .select("days, note, submitted_at")
    .eq("clinic_id", PUBLIC_CLINIC_ID)
    .eq("staff_id", staffId)
    .eq("month", month)
    .maybeSingle();
  if (!data) return null;
  return {
    days: (data.days as ShiftDays) ?? {},
    note: (data.note as string | null) ?? null,
    submittedAt: (data.submitted_at as string | null) ?? null,
  };
}

/** 出勤希望を提出（upsert）→ 提出されたらオーナーへLINE通知。ログイン不要。 */
export async function submitShiftRequest(input: {
  staffId: string;
  month: string;
  days: ShiftDays;
  note?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { staffId, month, days, note } = input;
  if (!staffId || !/^\d{4}-\d{2}$/.test(month)) {
    return { success: false, error: "入力が不正です" };
  }

  // 休み希望ルール：同じ曜日を連続週で休む場合は、連絡事項に理由が必須
  const consecutiveDows = findConsecutiveSameWeekdayOffs(days);
  if (consecutiveDows.length > 0 && !(note && note.trim())) {
    return {
      success: false,
      error: `同じ曜日（${consecutiveDows.join("・")}）を続けてお休み希望にする場合は、特別な理由が必要です。\n連絡事項に理由をご記入のうえ、もう一度送信してください。`,
    };
  }

  const db = admin();

  // staffId が自院の実在アクティブスタッフかを検証（共通リンクの最低限の防御）
  const { data: staff } = await db
    .from("reservation_staff")
    .select("id, name")
    .eq("clinic_id", PUBLIC_CLINIC_ID)
    .eq("id", staffId)
    .eq("is_active", true)
    .maybeSingle();
  if (!staff) return { success: false, error: "スタッフが見つかりません。お名前を選び直してください。" };

  const nowIso = new Date().toISOString();
  const { error } = await db
    .from("staff_shift_requests")
    .upsert(
      {
        clinic_id: PUBLIC_CLINIC_ID,
        staff_id: staffId,
        month,
        days,
        note: note ?? null,
        submitted_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "clinic_id, staff_id, month" },
    );
  if (error) return { success: false, error: error.message };

  // オーナーへLINE（提出のたびに一人ずつ）
  const availableCount = Object.values(days).filter((d) => d?.available).length;
  const [y, m] = month.split("-");
  try {
    await pushLineToOwners(
      PUBLIC_CLINIC_ID,
      `🗓️ 出勤希望が届きました\n${staff.name}さん（${Number(y)}年${Number(m)}月）\n出勤可能：${availableCount}日\n管理画面の「出勤調整」でご確認ください。`,
    );
  } catch (e) {
    console.error("[shift-request] owner LINE notify failed:", e);
  }
  return { success: true };
}

// ── オーナー用（管理画面・自院のみ） ───────────────────────────────

export type ShiftSubmission = {
  staffId: string;
  staffName: string;
  displayColor: string | null;
  days: ShiftDays;
  note: string | null;
  submittedAt: string | null;
};

/** 自院の指定月の全提出＋未提出スタッフを返す（オーナー出勤調整ページ用） */
export async function listShiftCoordination(month: string): Promise<{
  success: boolean;
  submissions?: ShiftSubmission[];
  unsubmitted?: ShiftStaff[];
  error?: string;
}> {
  const { clinicId } = await checkAdminAuth();
  if (!/^\d{4}-\d{2}$/.test(month)) return { success: false, error: "月の指定が不正です" };
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data: staffRows } = await supabase
    .from("reservation_staff")
    .select("id, name, display_color")
    .eq("clinic_id", clinicId)
    .eq("is_active", true)
    .order("sort_order")
    .order("created_at");
  const staff = (staffRows ?? []) as ShiftStaff[];

  const { data: reqRows } = await supabase
    .from("staff_shift_requests")
    .select("staff_id, days, note, submitted_at")
    .eq("clinic_id", clinicId)
    .eq("month", month);
  const byStaff = new Map<string, { days: ShiftDays; note: string | null; submittedAt: string | null }>();
  for (const r of reqRows ?? []) {
    byStaff.set(r.staff_id as string, {
      days: (r.days as ShiftDays) ?? {},
      note: (r.note as string | null) ?? null,
      submittedAt: (r.submitted_at as string | null) ?? null,
    });
  }

  const submissions: ShiftSubmission[] = [];
  const unsubmitted: ShiftStaff[] = [];
  for (const s of staff) {
    const row = byStaff.get(s.id);
    if (row && row.submittedAt) {
      submissions.push({
        staffId: s.id,
        staffName: s.name,
        displayColor: s.display_color,
        days: row.days,
        note: row.note,
        submittedAt: row.submittedAt,
      });
    } else {
      unsubmitted.push(s);
    }
  }
  return { success: true, submissions, unsubmitted };
}

// ── Phase3: 軸設定・AI出勤表生成・確定（予約ブロック反映） ──────────────

const SHIFT_LEAVE_NOTE = "出勤希望アンケートより自動反映"; // 自動生成 leave の目印
const SHIFT_WORK_NOTE  = "出勤希望アンケートより時間反映";  // 自動生成 work の目印

/** 出勤表の軸・方針（オーナーの自由記述） */
export async function getShiftPolicy(): Promise<string> {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data } = await supabase.from("clinic_settings").select("shift_policy").eq("id", clinicId).maybeSingle();
  return (data?.shift_policy as string | null) ?? "";
}

export async function setShiftPolicy(policy: string): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { error } = await supabase.from("clinic_settings").update({ shift_policy: policy }).eq("id", clinicId);
  return error ? { success: false, error: error.message } : { success: true };
}

/**
 * AI出勤表の「確認用ドラフト」を月ごとに保存/取得する（Phase1）。
 * ここに保存された案は "確認用" であり、予約には自動反映しない。
 * 予約反映は confirmShiftLeaves（別操作）のまま。
 */
export type ShiftDraft = { md: string; status: string; updatedAt: string | null; updatedBy: string | null };

export async function getShiftDraft(month: string): Promise<ShiftDraft | null> {
  const { clinicId } = await checkAdminAuth();
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data } = await supabase.from("clinic_settings").select("shift_drafts").eq("id", clinicId).maybeSingle();
  const drafts = (data?.shift_drafts as Record<string, { md?: string; status?: string; updated_at?: string; updated_by?: string }> | null) ?? {};
  const d = drafts[month];
  if (!d || typeof d.md !== "string") return null;
  return { md: d.md, status: d.status ?? "draft", updatedAt: d.updated_at ?? null, updatedBy: d.updated_by ?? null };
}

export async function saveShiftDraft(month: string, md: string): Promise<{ success: boolean; error?: string }> {
  const { clinicId, email } = await checkAdminAuth();
  if (!/^\d{4}-\d{2}$/.test(month)) return { success: false, error: "月の指定が不正です" };
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  // 既存の月別マップを読んで対象月だけ差し替える（他の月を消さない）
  const { data, error: readErr } = await supabase.from("clinic_settings").select("shift_drafts").eq("id", clinicId).maybeSingle();
  if (readErr) return { success: false, error: readErr.message };
  const drafts: Record<string, unknown> = { ...((data?.shift_drafts as Record<string, unknown> | null) ?? {}) };
  drafts[month] = { md, status: "draft", updated_at: new Date().toISOString(), updated_by: email ?? null };
  const { error } = await supabase.from("clinic_settings").update({ shift_drafts: drafts }).eq("id", clinicId);
  return error ? { success: false, error: error.message } : { success: true };
}

/** 出勤希望＋軸からAIで出勤表案（マークダウン）を生成。extraInstruction で相談・再調整。 */
export type ShiftChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * AIで出勤表がうまく作れない時、調整作業をぼーるくん（開発側）へ回す。
 * 月・方針・これまでのチャットのやりとりを記録し、後でぼーるくんが確認して対応する。
 */
export async function requestShiftDevAssist(
  month: string,
  note: string,
  chatHistory?: ShiftChatMessage[],
): Promise<{ success: boolean; error?: string }> {
  const { clinicId, email } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("clinic_settings").select("clinic_name, shift_policy").eq("id", clinicId).maybeSingle();

  const { error } = await supabase.from("dev_assist_requests").insert({
    clinic_id: clinicId,
    kind: "shift",
    title: `${month} の出勤表調整の依頼`,
    payload: {
      month,
      note: note?.slice(0, 1000) ?? "",
      clinic_name: settings?.clinic_name ?? null,
      shift_policy: settings?.shift_policy ?? null,
      chat: (chatHistory ?? []).slice(-12),
    },
    created_by_email: email ?? null,
  });
  if (error) return { success: false, error: error.message };

  // 院長LINEにも控えを通知（ぼーるくんへ回したことが分かるように）
  try {
    await pushLineToOwners(
      clinicId,
      `🛠 出勤表の調整を「ぼーるくん」に依頼しました。\n対象：${month}\n${note ? `内容：${note.slice(0, 200)}\n` : ""}確認後に対応します。`,
    );
  } catch { /* 通知失敗は致命的でないため握りつぶす */ }

  return { success: true };
}

export async function generateShiftFromRequests(
  month: string,
  extraInstruction?: string,
  chatHistory?: ShiftChatMessage[],
): Promise<{ success: boolean; draftMarkdown?: string; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  if (!/^\d{4}-\d{2}$/.test(month)) return { success: false, error: "月の指定が不正です" };
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "GEMINI_API_KEY が未設定です（AI生成は使えません）" };

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const [y, m] = month.split("-").map(Number);

  const [{ data: staffRows }, { data: reqRows }, { data: settings }] = await Promise.all([
    supabase.from("reservation_staff").select("id, name, role").eq("clinic_id", clinicId).eq("is_active", true).order("sort_order"),
    supabase.from("staff_shift_requests").select("staff_id, days, note, submitted_at").eq("clinic_id", clinicId).eq("month", month),
    supabase.from("clinic_settings").select("clinic_name, business_open_weekday, business_close_weekday, business_open_saturday, business_close_saturday, closed_weekdays, shift_policy").eq("id", clinicId).maybeSingle(),
  ]);
  const staff = (staffRows ?? []) as { id: string; name: string; role: string | null }[];
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const submitted = new Map<string, { days: ShiftDays; note: string | null }>();
  for (const r of reqRows ?? []) {
    if (r.submitted_at) submitted.set(r.staff_id as string, { days: (r.days as ShiftDays) ?? {}, note: (r.note as string | null) ?? null });
  }
  if (submitted.size === 0) return { success: false, error: "提出済みの出勤希望がありません。先にスタッフに提出してもらってください。" };

  // スタッフ別の希望を整形
  const lines: string[] = [];
  for (const s of staff) {
    const sub = submitted.get(s.id);
    if (!sub) { lines.push(`${s.name}（${s.role ?? "—"}）: 未提出`); continue; }
    const work = Object.entries(sub.days).filter(([, d]) => d.available).map(([k, d]) => `${k.slice(5)}(${d.start ?? "終日"}-${d.end ?? ""})`);
    const off = Object.entries(sub.days).filter(([, d]) => !d.available).map(([k]) => k.slice(5));
    lines.push(`${s.name}（${s.role ?? "—"}）: 出勤可=${work.join(",") || "なし"} / 休み希望=${off.join(",") || "なし"}${sub.note ? ` / 連絡:${sub.note}` : ""}`);
  }

  const policy = (settings?.shift_policy as string | null)?.trim();
  const clinicName = (settings?.clinic_name as string) || "当院";
  const prompt = `あなたは接骨院のシフト作成が得意な経営支援AIです。${y}年${m}月のスタッフ出勤表の案を作ってください。

【院名】${clinicName}
【営業時間 平日】${settings?.business_open_weekday ?? "9:00"}-${settings?.business_close_weekday ?? "20:00"} / 土 ${settings?.business_open_saturday ?? "9:00"}-${settings?.business_close_saturday ?? "18:00"}
【定休曜日(0=日…6=土)】${settings?.closed_weekdays ?? "0,3"}

【オーナーの方針・軸】
${policy || "（特に指定なし。各日の人員バランスを優先）"}

【スタッフの出勤希望（${m}月）】
${lines.join("\n")}
${extraInstruction ? `\n【追加の相談・指示】\n${extraInstruction}` : ""}

# 出力（日本語マークダウン・前置き不要・本文のみ）
## 全体サマリ（3-5行：営業日の人員バランス、薄い日、方針の反映状況）
## スタッフ別 出勤案（各人：出勤する日と時間／休みの日。出勤希望と方針を尊重）
## ⚠ 気づき（人員が薄い日・休み希望の重なり・方針と希望の衝突などを箇条書き）
## 提案（調整案）`;

  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: "gemini-2.5-flash" });

    if (chatHistory && chatHistory.length > 0) {
      // マルチターン：既存のチャット履歴を Gemini に渡す
      const history = chatHistory.map((msg) => ({
        role: msg.role === "assistant" ? "model" as const : "user" as const,
        parts: [{ text: msg.content }],
      }));
      const chat = model.startChat({ history });
      const userMsg = extraInstruction?.trim() || "前回の内容を踏まえて、出勤表を改善してください。";
      const res = await chat.sendMessage(userMsg);
      return { success: true, draftMarkdown: res.response.text().trim() };
    } else {
      // 初回：フルプロンプトで生成
      const res = await model.generateContent(prompt);
      return { success: true, draftMarkdown: res.response.text().trim() };
    }
  } catch (e: any) {
    console.error("[generateShiftFromRequests] error:", e);
    return { success: false, error: e?.message ?? "AI生成に失敗しました" };
  }
}

/** 確定：各スタッフの「休み希望(available:false)」の日を承認済みリーブとして予約ブロックに反映。 */
export async function confirmShiftLeaves(month: string): Promise<{ success: boolean; written?: number; error?: string }> {
  const { clinicId, email } = await checkAdminAuth();
  if (!/^\d{4}-\d{2}$/.test(month)) return { success: false, error: "月の指定が不正です" };
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data: reqRows } = await supabase
    .from("staff_shift_requests").select("staff_id, days, submitted_at").eq("clinic_id", clinicId).eq("month", month);
  const offByStaff: { staff_id: string; date: string }[] = [];
  for (const r of reqRows ?? []) {
    if (!r.submitted_at) continue;
    for (const [date, d] of Object.entries((r.days as ShiftDays) ?? {})) {
      if (d && d.available === false) offByStaff.push({ staff_id: r.staff_id as string, date });
    }
  }

  const monthStart = `${month}-01`;
  const [yy, mm] = month.split("-").map(Number);
  const monthEnd = `${month}-${String(new Date(yy, mm, 0).getDate()).padStart(2, "0")}`;

  // 出勤日の時間 override 候補（available=true かつ start/end あり）
  const workByStaff: { staff_id: string; date: string; start_time: string; end_time: string }[] = [];
  for (const r of reqRows ?? []) {
    if (!r.submitted_at) continue;
    for (const [date, d] of Object.entries((r.days as ShiftDays) ?? {})) {
      if (d && d.available === true && d.start && d.end) {
        workByStaff.push({ staff_id: r.staff_id as string, date, start_time: d.start, end_time: d.end });
      }
    }
  }

  // 既存の自動反映分（この月）を一旦消してから入れ直す（再確定で重複しない）
  await Promise.all([
    supabase.from("staff_working_overrides")
      .delete().eq("clinic_id", clinicId).eq("kind", "leave").eq("note", SHIFT_LEAVE_NOTE)
      .gte("date", monthStart).lte("date", monthEnd),
    supabase.from("staff_working_overrides")
      .delete().eq("clinic_id", clinicId).eq("kind", "work").eq("note", SHIFT_WORK_NOTE)
      .gte("date", monthStart).lte("date", monthEnd),
  ]);

  const insertRows: object[] = [];

  // 休み希望 → leave (blocks_booking=true)
  for (const o of offByStaff) {
    insertRows.push({
      clinic_id: clinicId, staff_id: o.staff_id, date: o.date,
      kind: "leave", status: "approved", blocks_booking: true,
      note: SHIFT_LEAVE_NOTE, created_by_email: email ?? null,
    });
  }
  // 出勤時間 → work (blocks_booking=false)
  for (const o of workByStaff) {
    insertRows.push({
      clinic_id: clinicId, staff_id: o.staff_id, date: o.date,
      kind: "work", status: "approved", blocks_booking: false,
      start_time: o.start_time, end_time: o.end_time,
      note: SHIFT_WORK_NOTE, created_by_email: email ?? null,
    });
  }

  if (insertRows.length === 0) return { success: true, written: 0 };

  // tenant-isolation-ignore: insert する各行に clinic_id を明示設定済み
  const { error } = await supabase.from("staff_working_overrides").insert(insertRows);
  if (error) return { success: false, error: error.message };
  return { success: true, written: offByStaff.length };
}

/** 自動運用（1ヶ月前送信・締切リマインド）のON/OFF状態 */
export async function getShiftAutoEnabled(): Promise<boolean> {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data } = await supabase
    .from("clinic_settings").select("shift_request_enabled").eq("id", clinicId).maybeSingle();
  return !!data?.shift_request_enabled;
}

/** 自動運用のON/OFF切替（オーナー） */
export async function setShiftAutoEnabled(enabled: boolean): Promise<{ success: boolean; error?: string }> {
  const { clinicId } = await checkAdminAuth();
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { error } = await supabase
    .from("clinic_settings").update({ shift_request_enabled: enabled }).eq("id", clinicId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
