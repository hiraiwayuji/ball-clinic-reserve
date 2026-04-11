"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/app/actions/auth";
import { revalidatePath } from "next/cache";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getClinicSettings } from "./settings";

async function getSupabase() { return await createClient(); }

export async function getAIMemos() {
  await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("ai_memos").select("*")
      .eq("clinic_id", "00000000-0000-0000-0000-000000000001")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error fetching AI memos:", error);
    return { success: false, error: "取得に失敗しました" };
  }
}

export async function upsertAIMemo(content: string, id?: string) {
  await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    if (id) {
      const { error } = await supabase.from("ai_memos")
        .update({ content, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("ai_memos")
        .insert([{ content, clinic_id: "00000000-0000-0000-0000-000000000001" }]);
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
  await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("ai_blog_proposals").select("*")
      .eq("clinic_id", "00000000-0000-0000-0000-000000000001")
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
    const prompt = `あなたは接骨院の経営戦略AIです。比較データと顧客属性データを見て、院長への経営コメントを日本語で生成してください。比較(JSON): ${comparisonJson}. 顧客属性(JSON): ${customerDataJson || noData}. 出力: 200文字以内、院長を「ぼーるくん」と呼び、無駄な前置き文なしで書く。`;
    const result = await model.generateContent(prompt);
    return { success: true, comment: result.response.text() };
  } catch (error) {
    console.error(error);
    return { success: false, error: "生成に失敗しました" };
  }
}

export async function generateWeeklyBlogProposal(clinicContext: string) {
  await checkAdminAuth();
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
      clinic_id: "00000000-0000-0000-0000-000000000001",
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
  const { clinicId: _clinicId } = await checkAdminAuth();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "APIキーが未設定です" };
  try {
    const settings = await getClinicSettings();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const notSet = "未設定";
    const ctx = settings
      ? `院名:${settings.clinic_name} エリア:${settings.area_name || notSet} HP:${settings.hp_url || notSet} ターゲット:${settings.target_persona || "一般"}`
      : "情報未登録";
    const prompt = `接骨院のSEO/MEOコンサルタントとして、Googleから新規患者が来院しやすくなる改善策を提案してください。コンテキスト: ${ctx}。SEOとMEOの2カテゴリで具体的なアクションを各２つ。Markdown形式400字以内。`;
    const result = await model.generateContent(prompt);
    return { success: true, advice: result.response.text() };
  } catch (error: any) {
    console.error(error);
    return { success: false, error: "AI診断失敗: " + (error.message || "") };
  }
}