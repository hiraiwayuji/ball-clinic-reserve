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
        .update({ content, updated_at: new Date().toISOString() }).eq("id", id);
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
  await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.from("ai_memos").delete().eq("id", id);
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
  };
}
