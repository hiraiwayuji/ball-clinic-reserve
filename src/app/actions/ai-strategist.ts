"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/app/actions/auth";
import { revalidatePath } from "next/cache";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getClinicSettings } from "./settings";

async function getSupabase() {
  return await createClient();
}

/**
 * AI Memos
 */
export async function getAIMemos() {
  await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("ai_memos")
      .select("*")
      .eq("clinic_id", '00000000-0000-0000-0000-000000000001')
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
      const { error } = await supabase
        .from("ai_memos")
        .update({ content, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("ai_memos")
        .insert([{ 
          content,
          clinic_id: '00000000-0000-0000-0000-000000000001'
        }]);
      if (error) throw error;
    }
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error upserting AI memo:", error);
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
    console.error("Error deleting AI memo:", error);
    return { success: false, error: "削除に失敗しました" };
  }
}

/**
 * Weekly Blog Proposals
 */
export async function getWeeklyBlogProposals() {
  await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("ai_blog_proposals")
      .select("*")
      .eq("clinic_id", '00000000-0000-0000-0000-000000000001')
      .order("week_start", { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error fetching blog proposals:", error);
    return { success: false, error: "取得に失敗しました" };
  }
}

export async function generateWeeklyBlogProposal(clinicContext: string) {
  await checkAdminAuth();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "APIキーが設定されていません" };

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const settings = await getClinicSettings();
    const snsContext = settings ? `
      【SNSアカウント】
      - TikTok: ${settings.tiktok_url || '未設定'}
      - Instagram: ${settings.instagram_url || '未設定'}
      - YouTube: ${settings.youtube_url || '未設定'}
      - X: ${settings.x_url || '未設定'}
      
      【ターゲット属性】: ${settings.target_persona || '一般'}
      【動画トーン】: ${settings.video_tone || '親しみやすい'}
      【重点キーワード】: ${settings.analysis_keywords?.join(', ') || 'なし'}
      【エリア】: ${settings.area_name || '未設定'}
    ` : '';

    const prompt = `
      あなたは接骨院の経営を支える「軍師AI」です。
      以下のクリニック情報を踏まえ、今週noteなどのブログに投稿する記事の提案を1つ作成してください。
      
      【クリニック状況（最新データ）】
      ${clinicContext}
      
      ${snsContext}
      
      【出力形式 (JSON相当のプレーンテキストで、タグなどで区切ってください)】
      Title: [記事タイトル]
      Keywords: [キーワード1, キーワード2, ...]
      ContentDraft: [記事の構成案や導線、重要なポイントを300文字程度で]
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // 簡単なパース (実際の運用ではJSON形式を推奨)
    const title = text.match(/Title:\s*(.*)/)?.[1] || "今週の提案記事";
    const keywords = text.match(/Keywords:\s*(.*)/)?.[1]?.split(",").map(k => k.trim()) || [];
    const contentDraft = text.match(/ContentDraft:\s*([\s\S]*)/)?.[1] || text;

    const supabase = await getSupabase();
    const weekStart = new Date();
    weekStart.setHours(0,0,0,0);
    // 月曜日の日付に合わせるなどの調整も可能だが、一旦今日を起点
    
    const { data, error } = await supabase
      .from("ai_blog_proposals")
      .insert([{
        week_start: weekStart.toISOString().split('T')[0],
        title,
        content_draft: contentDraft,
        keywords,
        status: 'proposed',
        clinic_id: '00000000-0000-0000-0000-000000000001'
      }])
      .select()
      .single();

    if (error) throw error;
    revalidatePath("/admin/dashboard");
    return { success: true, data };
  } catch (error) {
    console.error("Error generating blog proposal:", error);
    return { success: false, error: "生成に失敗しました" };
  }
}
