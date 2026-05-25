"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/app/actions/auth";
import { revalidatePath } from "next/cache";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getClinicSettings } from "./settings";
import { CLINIC_CONFIG } from "@/lib/clinic-config";

async function getSupabase() { return await createClient(); }

export async function getAIMemos() {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("ai_memos").select("*")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error fetching AI memos:", error);
    return { success: false, error: "取得に失敗しました" };
  }
}

export async function upsertAIMemo(content: string, id?: string) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    if (id) {
      const { error } = await supabase.from("ai_memos")
        .update({ content, updated_at: new Date().toISOString() }).eq("id", id).eq("clinic_id", clinicId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("ai_memos")
        .insert([{ content, clinic_id: clinicId }]);
      if (error) throw error;
    }
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "保存に失敗しました" };
  }
}

export async function deleteAIMemo(id: string) {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.from("ai_memos").delete().eq("id", id).eq("clinic_id", clinicId);
    if (error) throw error;
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "削除に失敗しましました" };
  }
}

export async function getWeeklyBlogProposals() {
  const { clinicId } = await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("ai_blog_proposals").select("*")
      .eq("clinic_id", clinicId)
      .order("week_start", { ascending: false });
    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error(error);
    return { success: false, error: "取得に失敗しました" };
  }
}

export async function generateAnalyticsComment(comparisonJson: string, customerDataJson?: string) {
  await checkAdminAuth();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "APIキーが未設定です" };
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const noData = "なし";
    const prompt = `あなたは接骨院の経営戦略AIです。比較データと顧客属性データを見て、院長への経営コメントを日本語で生成してください。比較(JSON): ${comparisonJson}. 顧客属性(JSON): ${customerDataJson || noData}. 出力: 200文字以内、院長を「${CLINIC_CONFIG.ownerNickname}」と呼び、無駄な前置き文なしで書く。`;
    const result = await model.generateContent(prompt);
    return { success: true, comment: result.response.text() };
  } catch (error) {
    console.error(error);
    return { success: false, error: "生成に失敗しました" };
  }
}

export async function generateWeeklyBlogProposal(clinicContext: string) {
  const { clinicId } = await checkAdminAuth();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "APIキーが未設定です" };
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const settings = await getClinicSettings();
    const notSet = "未設定";
    const sns = settings
      ? `TikTok:${settings.tiktok_url || notSet} / Instagram:${settings.instagram_url || notSet} / ターゲット:${settings.target_persona || "一般"}`
      : "";
    const prompt = `接骨院の軍師AIとして、noteなどのブログ記事の提案を1つ生成してください。クリニック: ${clinicContext}. ${sns}. 出力形式: Title:[タイトル] Keywords:[キーワード] ContentDraft:[概要300字]`;
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const title = text.match(/Title:\s*(.*)/)?.[1] || "提案記事";
    const keywords = text.match(/Keywords:\s*(.*)/)?.[1]?.split(",").map((k: string) => k.trim()) || [];
    const contentDraft = text.match(/ContentDraft:\s*([\s\S]*)/)?.[1] || text;
    const supabase = await getSupabase();
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    const { data, error } = await supabase.from("ai_blog_proposals").insert([{
      week_start: weekStart.toISOString().split("T")[0], title,
      content_draft: contentDraft, keywords, status: "proposed",
      clinic_id: clinicId,
    }]).select().single();
    if (error) throw error;
    revalidatePath("/admin/dashboard");
    return { success: true, data };
  } catch (error) {
    console.error(error);
    return { success: false, error: "生成に失敗しました" };
  }
}

export async function generateDailySnsTasks(dateStr: string) {
  const { clinicId } = await checkAdminAuth();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "APIキーが未設定です" };
  try {
    const { getBusinessContext } = await import("./sales");
    const bizContext = await getBusinessContext();
    const settings = await getClinicSettings();
    const supabase = await getSupabase();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });
    const bizCtx = (bizContext as any).success ? (bizContext as any).context : "取得不可";
    const prompt = `接骨院のSNSマーケティングAIです。対象日: ${dateStr}。ターゲット: ${settings?.target_persona || "一般"}。現状: ${bizCtx}。実行效果の高いSNSタスクを1つJSON配列で返してください: [{title,priority,reference_content}]。priorityは high/medium/low。`;
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    let dailyTasks;
    try { dailyTasks = JSON.parse(responseText); }
    catch {
      const m = responseText.match(/\[[\s\S]*\]/);
      if (m) { dailyTasks = JSON.parse(m[0]); }
      else { throw new Error("応答形式エラー"); }
    }
    if (!Array.isArray(dailyTasks)) throw new Error("予期しない形式");
    const insertData = dailyTasks.map((t: any) => ({
      clinic_id: clinicId, task_date: dateStr, task_name: t.title,
      title: t.title, status: "pending", priority: t.priority, reference_content: t.reference_content,
    }));
    // tenant-isolation-ignore: insertData の各行に clinic_id を埋め込み済み（L158）
    const { error } = await supabase.from("daily_tasks").insert(insertData);
    if (error) {
      if (error.code === "42703") throw new Error("DBカラムエラー。管理者に連絡してください。");
      throw error;
    }
    revalidatePath("/admin/tasks");
    return { success: true };
  } catch (error: any) {
    console.error(error);
    return { success: false, error: error.message || "AIタスク生成に失敗" };
  }
}

export async function generateSEOMeoAdvice() {
  const { clinicId } = await checkAdminAuth();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "APIキーが未設定です" };
  try {
    const supabase = await getSupabase();
    const settings = await getClinicSettings();
    const notSet = "未設定";

    // JST今日
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const dateStr = jstNow.toISOString().split("T")[0];
    const year = jstNow.getUTCFullYear();
    const month = jstNow.getUTCMonth() + 1;
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const startOfMonth = `${monthStr}-01`;
    const endOfMonth = new Date(year, month, 0).toISOString().split("T")[0];

    // 今月の来院数
    let monthVisits = 0;
    let newVisits = 0;
    try {
      const { data } = await supabase
        .from("appointments")
        .select("id, is_first_visit")
        .eq("clinic_id", clinicId)
        .gte("start_time", `${startOfMonth}T00:00:00+09:00`)
        .lte("start_time", `${endOfMonth}T23:59:59+09:00`)
        .neq("status", "cancelled");
      monthVisits = data?.length ?? 0;
      newVisits = data?.filter((a) => a.is_first_visit).length ?? 0;
    } catch {}

    // 先月の来院数
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
    const prevStart = `${prevMonthStr}-01`;
    const prevEnd = new Date(prevYear, prevMonth, 0).toISOString().split("T")[0];
    let prevMonthVisits = 0;
    try {
      const { data } = await supabase
        .from("appointments")
        .select("id")
        .eq("clinic_id", clinicId)
        .gte("start_time", `${prevStart}T00:00:00+09:00`)
        .lte("start_time", `${prevEnd}T23:59:59+09:00`)
        .neq("status", "cancelled");
      prevMonthVisits = data?.length ?? 0;
    } catch {}

    // 今月の売上
    let monthRevenue = 0;
    try {
      const { data } = await supabase
        .from("cash_sales")
        .select("treatment_fee")
        .eq("clinic_id", clinicId)
        .gte("sale_date", startOfMonth)
        .lte("sale_date", endOfMonth);
      monthRevenue = data?.reduce((s, r) => s + (r.treatment_fee ?? 0), 0) ?? 0;
    } catch {}

    // 最近のAIメモ（最新3件）
    let memoText = "なし";
    try {
      const { data } = await supabase
        .from("ai_memos")
        .select("content, created_at")
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false })
        .limit(3);
      if (data && data.length > 0) {
        memoText = data
          .map((m) => `・${m.content.slice(0, 100)}`)
          .join("\n");
      }
    } catch {}

    const visitTrend = prevMonthVisits > 0
      ? monthVisits > prevMonthVisits
        ? `先月(${prevMonthVisits}件)より増加中`
        : monthVisits < prevMonthVisits
        ? `先月(${prevMonthVisits}件)より減少中`
        : "先月と同水準"
      : "比較データなし";

    const ctx = `
【院の基本情報】
院名: ${settings?.clinic_name || notSet}
エリア: ${settings?.area_name || settings?.address || notSet}
ターゲット: ${settings?.target_persona || "一般"}
HP URL: ${settings?.hp_url || notSet}
分析キーワード: ${settings?.analysis_keywords?.join("、") || notSet}

【今月の経営数値（${monthStr}）】
来院件数: ${monthVisits}件（うち初診: ${newVisits}件 / 再診: ${monthVisits - newVisits}件）
前月比トレンド: ${visitTrend}
今月の自費売上: ¥${monthRevenue.toLocaleString()}

【最近のAIメモ（院長・スタッフの気づき）】
${memoText}
`.trim();

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `あなたは接骨院専門のSEO/MEOコンサルタントです。
以下の実際の経営データとメモをもとに、この院固有の状況に合わせたSEO・MEO改善アドバイスを提案してください。

${ctx}

【出力ルール】
- 来院数の増減トレンド・初診比率・メモの内容を必ず根拠として言及すること
- 汎用的なアドバイスではなく、この院の数字に基づいた具体的な施策にすること
- 以下の3カテゴリで各2〜3アクションを提示すること
  1. SEO（ホームページ・ブログ・note）
  2. MEO（Googleマップ・口コミ対策）
  3. SNS・LINE集客（来院数トレンドを踏まえた短期施策）
- Markdown形式、600字以内`;

    const result = await model.generateContent(prompt);
    return { success: true, advice: result.response.text() };
  } catch (error: any) {
    console.error(error);
    return { success: false, error: "AI診断失敗: " + (error.message || "") };
  }
}

// ─── 朝のブリーフィング用コンテキスト取得 ───────────────────────────────────
export async function getBriefingContext() {
  const { clinicId } = await checkAdminAuth();
  const supabase = await getSupabase();
  const apiKey = process.env.GEMINI_API_KEY;

  // JST日時
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dayOfWeek = jst.getUTCDay(); // 0=日 1=月
  const dayOfMonth = jst.getUTCDate();
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth() + 1;
  const todayStr = jst.toISOString().split("T")[0];

  const isWeekStart = dayOfWeek === 1; // 月曜
  const isMonthStart = dayOfMonth <= 2; // 月初め2日以内

  // ── 休診日判定 ──────────────────────────────────────────────────
  // 定休日: 水(3)・日(0) をデフォルトとして設定する
  const WEEKLY_CLOSED_DAYS = [0, 3]; // Sun=0, Wed=3
  const isWeeklyClosed = WEEKLY_CLOSED_DAYS.includes(dayOfWeek);

  // clinic_holidays テーブルで今日が特別休診日かチェック
  let isSpecialHoliday = false;
  let holidayDescription: string | null = null;
  try {
    const { data } = await supabase
      .from("clinic_holidays")
      .select("description")
      .eq("clinic_id", clinicId)
      .eq("date", todayStr)
      .single();
    if (data) {
      isSpecialHoliday = true;
      holidayDescription = data.description ?? "臨時休診";
    }
  } catch {}

  const isClosedDay = isWeeklyClosed || isSpecialHoliday;
  const closedDayReason = isSpecialHoliday
    ? (holidayDescription ?? "臨時休診")
    : dayOfWeek === 0 ? "日曜定休" : "水曜定休";

  // 翌日の予約数（休診日は翌営業日の準備情報として表示）
  let tomorrowAppointmentsCount = 0;
  if (isClosedDay) {
    try {
      const tomorrow = new Date(jst.getTime() + 86400000);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];
      const { count } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .gte("start_time", `${tomorrowStr}T00:00:00+09:00`)
        .lte("start_time", `${tomorrowStr}T23:59:59+09:00`)
        .neq("status", "cancelled");
      tomorrowAppointmentsCount = count ?? 0;
    } catch {}
  }

  // 未入力経費（pending_expenses）の件数
  let pendingExpensesCount = 0;
  try {
    const { count } = await supabase
      .from("pending_expenses")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("status", "unprocessed");
    pendingExpensesCount = count ?? 0;
  } catch {}

  // 日付ユーティリティ
  const toJstDate = (d: Date) => d.toISOString().split("T")[0];
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

  // 今週（月〜今日）と先週の範囲
  const weekStartDate = addDays(jst, -(dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const prevWeekStart = addDays(weekStartDate, -7);
  const prevWeekEnd = addDays(weekStartDate, -1);

  // 今月・先月・去年同月の範囲
  const thisMonthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const thisMonthEnd = new Date(year, month, 0).toISOString().split("T")[0];
  const prevM = month === 1 ? 12 : month - 1;
  const prevY = month === 1 ? year - 1 : year;
  const prevMonthStart = `${prevY}-${String(prevM).padStart(2, "0")}-01`;
  const prevMonthEnd = new Date(prevY, prevM, 0).toISOString().split("T")[0];
  const lastYearSameStart = `${year - 1}-${String(month).padStart(2, "0")}-01`;
  const lastYearSameEnd = new Date(year - 1, month, 0).toISOString().split("T")[0];

  // 今週の来院数
  let thisWeekVisits = 0;
  let thisWeekNew = 0;
  try {
    const { data } = await supabase
      .from("appointments").select("id, is_first_visit")
      .eq("clinic_id", clinicId)
      .gte("start_time", `${toJstDate(weekStartDate)}T00:00:00+09:00`)
      .lte("start_time", `${toJstDate(jst)}T23:59:59+09:00`)
      .neq("status", "cancelled");
    thisWeekVisits = data?.length ?? 0;
    thisWeekNew = data?.filter((a) => a.is_first_visit).length ?? 0;
  } catch {}

  // 先週の来院数
  let prevWeekVisits = 0;
  try {
    const { data } = await supabase
      .from("appointments").select("id")
      .eq("clinic_id", clinicId)
      .gte("start_time", `${toJstDate(prevWeekStart)}T00:00:00+09:00`)
      .lte("start_time", `${toJstDate(prevWeekEnd)}T23:59:59+09:00`)
      .neq("status", "cancelled");
    prevWeekVisits = data?.length ?? 0;
  } catch {}

  // 今月・先月
  let thisMonthVisits = 0;
  let prevMonthVisits = 0;
  let lastYearSameVisits = 0;
  try {
    const [tm, pm, ly] = await Promise.all([
      supabase.from("appointments").select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .gte("start_time", `${thisMonthStart}T00:00:00+09:00`)
        .lte("start_time", `${thisMonthEnd}T23:59:59+09:00`)
        .neq("status", "cancelled"),
      supabase.from("appointments").select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .gte("start_time", `${prevMonthStart}T00:00:00+09:00`)
        .lte("start_time", `${prevMonthEnd}T23:59:59+09:00`)
        .neq("status", "cancelled"),
      supabase.from("appointments").select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .gte("start_time", `${lastYearSameStart}T00:00:00+09:00`)
        .lte("start_time", `${lastYearSameEnd}T23:59:59+09:00`)
        .neq("status", "cancelled"),
    ]);
    thisMonthVisits = tm.count ?? 0;
    prevMonthVisits = pm.count ?? 0;
    lastYearSameVisits = ly.count ?? 0;
  } catch {}

  // 最新AIメモ
  let latestMemo: string | null = null;
  try {
    const { data } = await supabase
      .from("ai_memos").select("content")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .limit(1).single();
    latestMemo = data?.content?.slice(0, 120) ?? null;
  } catch {}

  // ── 来月シフト準備状況の判定（20日以降のみ表示） ─────────────────────
  // 毎月20日を過ぎたら「来月の休み希望・シフト未準備」を検知して
  // オーナーにリマインドする。判定材料:
  //   - 来月の staff_working_overrides が全くないスタッフが何人いるか
  //   - 0人なら全員から休み希望が出ている扱い、>0 なら未提出として催促
  let shiftReminder: {
    needed: boolean;
    nextMonthLabel: string;
    missingStaffCount: number;
    totalStaff: number;
    daysUntilNextMonth: number;
    pendingCount: number;
  } | null = null;
  if (dayOfMonth >= 20) {
    try {
      // 来月の範囲
      const nm = month === 12 ? 1 : month + 1;
      const nmYear = month === 12 ? year + 1 : year;
      const nextMonthStart = `${nmYear}-${String(nm).padStart(2, "0")}-01`;
      const nextMonthEnd = new Date(nmYear, nm, 0).toISOString().split("T")[0];

      // 全アクティブスタッフ
      const { data: staffList } = await supabase
        .from("reservation_staff")
        .select("id")
        .eq("clinic_id", clinicId)
        .eq("is_active", true);
      const totalStaff = staffList?.length ?? 0;

      // 来月分の overrides（休み希望 or 既決のシフト）が登録されている staff
      const { data: overrides } = await supabase
        .from("staff_working_overrides")
        .select("staff_id, status")
        .eq("clinic_id", clinicId)
        .gte("date", nextMonthStart)
        .lte("date", nextMonthEnd);
      const staffWithOverrides = new Set((overrides ?? []).map((o: any) => o.staff_id));
      const missingStaffCount = Math.max(0, totalStaff - staffWithOverrides.size);
      const pendingCount = (overrides ?? []).filter((o: any) => o.status === "pending").length;

      // 来月までの日数
      const endOfMonth = new Date(year, month, 0).getDate();
      const daysUntilNextMonth = Math.max(0, endOfMonth - dayOfMonth + 1);

      shiftReminder = {
        needed: totalStaff > 0 && (missingStaffCount > 0 || pendingCount > 0),
        nextMonthLabel: `${nmYear}年${nm}月`,
        missingStaffCount,
        totalStaff,
        daysUntilNextMonth,
        pendingCount,
      };
    } catch (e) {
      console.warn("[ai-secretary] shiftReminder calc failed:", e);
    }
  }

  // Gemini で朝のアドバイス＋SNS提言を並列生成
  let aiAdvice: string | null = null;
  let snsAdvice: string | null = null;
  if (apiKey) {
    try {
      const settings = await getClinicSettings();
      const weekDiff = prevWeekVisits > 0
        ? Math.round(((thisWeekVisits - prevWeekVisits) / prevWeekVisits) * 100)
        : 0;
      const monthDiff = lastYearSameVisits > 0
        ? Math.round(((thisMonthVisits - lastYearSameVisits) / lastYearSameVisits) * 100)
        : 0;

      const briefCtx = [
        `院名: ${settings?.clinic_name || "接骨院"}`,
        `今週の来院: ${thisWeekVisits}件（先週比${weekDiff > 0 ? "+" : ""}${weekDiff}%）`,
        `今月の来院: ${thisMonthVisits}件（去年同月比${monthDiff > 0 ? "+" : ""}${monthDiff}%）`,
        `今週の初診数: ${thisWeekNew}名`,
        isWeekStart ? "本日は週初めです。" : "",
        isMonthStart ? "本日は月初めです。" : "",
        shiftReminder?.needed
          ? `※${shiftReminder.nextMonthLabel}のシフト準備が未完了です（${shiftReminder.missingStaffCount}/${shiftReminder.totalStaff}名分の休み希望が未提出、月末まで${shiftReminder.daysUntilNextMonth}日）。スタッフに来月の休み希望提出を促し、シフト作成を始めてください。`
          : "",
        latestMemo ? `最近のメモ: ${latestMemo}` : "",
      ].filter(Boolean).join(" / ");

      const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
      const snsCtx = [
        `今週の来院: ${thisWeekVisits}件`,
        prevWeekVisits > 0 ? `先週比: ${weekDiff > 0 ? "+" : ""}${weekDiff}%` : "",
        `今週の初診: ${thisWeekNew}名`,
        `今日: ${dayNames[dayOfWeek]}曜日`,
        isWeekStart ? "週初め" : "",
        isMonthStart ? "月初め" : "",
        settings?.target_persona ? `ターゲット: ${settings.target_persona}` : "",
      ].filter(Boolean).join(" / ");

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const morningAdvicePrompt = isClosedDay
        ? `あなたは接骨院の専属AI秘書です。今日は${closedDayReason}の休診日です。翌日の予約は${tomorrowAppointmentsCount}件あります。未処理の経費が${pendingExpensesCount}件あります。院長への休日のひと言を1〜2文で生成してください。「明日の準備」「事務作業」「集計確認」のいずれかを前向きに提案してください。敬語で。\nデータ: ${briefCtx}`
        : `あなたは接骨院の専属AI秘書です。以下のデータをもとに、院長への朝のひと言アドバイスを1〜2文で生成してください。数字を必ず1つ使い、具体的で前向きな内容にしてください。敬語で。\nデータ: ${briefCtx}`;

      const [adviceResult, snsResult] = await Promise.all([
        model.generateContent(morningAdvicePrompt),
        model.generateContent(
          `あなたは接骨院のSNS・LINE集客の専門家です。以下の院のデータをもとに、今日（または今週）取るべき具体的なSNS・LINE配信アクションを1つだけ、2〜3文で提案してください。
ルール:
- 来院数が少ない/減っている場合は集客系アクション（LINE動画配信・キャンペーン告知など）
- 来院数が多い/増えている場合は口コミ・紹介促進系アクション
- 月初めの場合はその月のSNS投稿テーマ提案
- 週初め（月曜）の場合は今週のLINE配信タイミングの提案
- 具体的なコンテンツ例（動画テーマ・文言例など）を1つ含めること
- 敬語で、前置き不要で結論から始めること
データ: ${snsCtx}`
        ),
      ]);

      aiAdvice = adviceResult.response.text().trim();
      snsAdvice = snsResult.response.text().trim();
    } catch {}
  }

  return {
    isWeekStart,
    isMonthStart,
    dayOfWeek,
    thisWeekVisits,
    thisWeekNew,
    prevWeekVisits,
    thisMonthVisits,
    prevMonthVisits,
    lastYearSameVisits,
    month,
    latestMemo,
    aiAdvice,
    snsAdvice,
    // 休診日フィールド
    isClosedDay,
    closedDayReason,
    tomorrowAppointmentsCount,
    pendingExpensesCount,
    // 来月シフト準備状況（20日以降のみ非null）
    shiftReminder,
  };
}

// ─── AI シフト案生成 ──────────────────────────────────────────────────
/**
 * 指定月（デフォルト：来月）のシフト草案を Gemini で生成。
 *
 * 材料:
 *   - reservation_staff（全アクティブスタッフ）
 *   - staff_working_hours（曜日別の基本勤務時間）
 *   - staff_working_overrides（来月分の休み希望・既決のスポット予定）
 *   - clinic_settings（営業時間、定休日）
 *
 * 出力:
 *   - draftMarkdown: スタッフ別の来月シフト提案（マークダウン）
 *   - warnings: AI が気付いた懸念点（穴・偏り・無理など）
 *
 * 注意: 自動で DB に書き込まない。オーナーが内容確認したうえで手動反映。
 */
export type ShiftDraftResult = {
  success: boolean;
  monthLabel?: string;
  draftMarkdown?: string;
  warnings?: string[];
  totalStaff?: number;
  approvedLeaveCount?: number;
  pendingLeaveCount?: number;
  error?: string;
};

export async function generateShiftDraft(monthStr?: string): Promise<ShiftDraftResult> {
  const { clinicId } = await checkAdminAuth();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "GEMINI_API_KEY が未設定です" };

  const supabase = await getSupabase();

  // 対象月の決定（デフォルト：来月）
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const [year, month] = monthStr
    ? monthStr.split("-").map(n => parseInt(n, 10))
    : (() => {
        const m = jst.getUTCMonth() + 1;
        return m === 12
          ? [jst.getUTCFullYear() + 1, 1]
          : [jst.getUTCFullYear(), m + 1];
      })();
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = new Date(year, month, 0).toISOString().split("T")[0];
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthLabel = `${year}年${month}月`;

  // 並列でデータ取得
  const [staffRes, hoursRes, overridesRes, settings] = await Promise.all([
    supabase
      .from("reservation_staff")
      .select("id, name, role, available_for_online_booking, birth_date")
      .eq("clinic_id", clinicId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("staff_working_hours")
      .select("staff_id, day_of_week, start_time, end_time, break_start, break_end"),
    supabase
      .from("staff_working_overrides")
      .select("staff_id, date, kind, start_time, end_time, status, note")
      .eq("clinic_id", clinicId)
      .gte("date", monthStart)
      .lte("date", monthEnd),
    getClinicSettings(),
  ]);

  if (staffRes.error) return { success: false, error: staffRes.error.message };

  const staff = staffRes.data ?? [];
  const allHours = hoursRes.data ?? [];
  const overrides = overridesRes.data ?? [];
  const totalStaff = staff.length;

  if (totalStaff === 0) {
    return { success: false, error: "アクティブなスタッフが登録されていません" };
  }

  // スタッフ名解決
  const staffIdToName = new Map(staff.map((s: any) => [s.id, s.name]));
  const hoursByStaff = new Map<string, any[]>();
  for (const h of allHours) {
    if (!hoursByStaff.has(h.staff_id)) hoursByStaff.set(h.staff_id, []);
    hoursByStaff.get(h.staff_id)!.push(h);
  }

  // 休み希望をスタッフ別に集計
  const approvedLeaveDates: Record<string, string[]> = {};
  const pendingLeaveDates: Record<string, string[]> = {};
  const otherOverrides: Record<string, { date: string; kind: string; note?: string | null }[]> = {};
  let approvedLeaveCount = 0;
  let pendingLeaveCount = 0;

  for (const o of overrides) {
    const name = staffIdToName.get(o.staff_id) ?? "不明";
    if (o.kind === "leave") {
      if (o.status === "approved") {
        (approvedLeaveDates[name] ??= []).push(o.date);
        approvedLeaveCount++;
      } else if (o.status === "pending") {
        (pendingLeaveDates[name] ??= []).push(o.date);
        pendingLeaveCount++;
      }
    } else {
      (otherOverrides[name] ??= []).push({ date: o.date, kind: o.kind, note: o.note });
    }
  }

  // スタッフ別の基本勤務時間を要約
  const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];
  const staffHoursSummary = staff.map((s: any) => {
    const hours = hoursByStaff.get(s.id) ?? [];
    const summary = hours
      .map((h: any) => `${DAY_NAMES[h.day_of_week]}:${h.start_time?.slice(0, 5) ?? "-"}-${h.end_time?.slice(0, 5) ?? "-"}`)
      .join(", ");
    return `${s.name}(${s.role ?? "—"}): ${summary || "基本勤務時間未設定"}`;
  }).join("\n");

  // プロンプト構築
  const closedDays = settings?.closed_weekdays ?? "0,3"; // 既定: 日(0), 水(3)
  const clinicName = settings?.clinic_name ?? "院";

  const prompt = `あなたは接骨院・整骨院の経営支援AIで、特にスタッフのシフト作成が得意です。
以下のデータから、${monthLabel}（${daysInMonth}日間）のスタッフシフト案を作成してください。

【院名】${clinicName}
【営業時間（平日）】${settings?.business_open_weekday ?? "9:00"} - ${settings?.business_close_weekday ?? "20:00"}
【営業時間（土曜）】${settings?.business_open_saturday ?? "9:00"} - ${settings?.business_close_saturday ?? "18:00"}
【定休曜日（0=日, 1=月, ..., 6=土）】${closedDays}

【全スタッフ ${totalStaff} 名と基本勤務時間】
${staffHoursSummary}

【${monthLabel}の承認済み休み（必ず休みで確定）】
${Object.keys(approvedLeaveDates).length > 0
  ? Object.entries(approvedLeaveDates).map(([n, dates]) => `${n}: ${dates.join(", ")}`).join("\n")
  : "なし"}

【${monthLabel}の承認待ち希望（オーナーに承認を促す対象）】
${Object.keys(pendingLeaveDates).length > 0
  ? Object.entries(pendingLeaveDates).map(([n, dates]) => `${n}: ${dates.join(", ")}`).join("\n")
  : "なし"}

【${monthLabel}のその他のスポット予定（ミーティング・研修等）】
${Object.keys(otherOverrides).length > 0
  ? Object.entries(otherOverrides).map(([n, items]) => `${n}: ${items.map(i => `${i.date}(${i.kind}${i.note ? `:${i.note}` : ""})`).join(", ")}`).join("\n")
  : "なし"}

# 出力要件

以下のフォーマットで日本語マークダウンで返してください。冒頭の前置きやコードブロックは不要、本文のみ。

## 全体サマリ
（営業日数、勤務予定の総スタッフ・日数、人員配置の偏り、留意点を3-5行で）

## スタッフ別 ${monthLabel} シフト案
（各スタッフの推奨シフトを「曜日 + 時間帯」または「日付指定」で記述。承認済み休みは必ず反映。承認待ち希望も基本尊重）

### スタッフ名
- 出勤予定: 月-火-木-金-土（9:00-20:00）／例: 6/3, 6/10 などの特記事項
- 休み: 6/4, 6/11（承認済み）, 6/18（希望中）
- 注意点: （あれば1-2行）

（全スタッフ分を繰り返す）

## ⚠ 留意点・気づき
- （人員が薄い日、休み希望が重なる日、新規予約に影響しそうな日などを箇条書き）

## 提案アクション
- 承認待ちの希望に対しての承認推奨/再調整提案
- 必要であれば臨時スタッフの追加検討提案
`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const draftMarkdown = result.response.text().trim();

    // 簡易 warnings 抽出（「⚠ 留意点」セクションから箇条書き行を拾う）
    const warnings: string[] = [];
    const warnMatch = draftMarkdown.match(/## ⚠?\s*留意点[\s\S]+?(?=##|$)/);
    if (warnMatch) {
      warnings.push(
        ...warnMatch[0]
          .split("\n")
          .filter(line => line.trim().startsWith("-"))
          .map(line => line.replace(/^[-・]\s*/, "").trim())
          .filter(Boolean)
      );
    }

    return {
      success: true,
      monthLabel,
      draftMarkdown,
      warnings,
      totalStaff,
      approvedLeaveCount,
      pendingLeaveCount,
    };
  } catch (e: any) {
    console.error("[generateShiftDraft] error:", e);
    return { success: false, error: e?.message ?? "AI 提案の生成に失敗しました" };
  }
}
