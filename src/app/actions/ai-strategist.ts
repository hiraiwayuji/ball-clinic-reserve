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

export async function generateAnalyticsComment(comparisonJson: string) {
  await checkAdminAuth();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "APIキーが設定されていません" };

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `あなたは接骨院の経営参謀AIです。以下の期間比較データを見て、院長への経営コメントを日本語で生成してください。

【比較データ（JSON）】
${comparisonJson}

【出力ルール】
- 200文字以内で簡潔に
- 良かった点を1〜2つ具体的に褒める（数字を使う）
- 今後伸ばすべきポイントを1つ提案する
- 院長を「ぼーるくん」と呼ぶ
- 箇条書きではなく自然な会話文で書く`;

    const result = await model.generateContent(prompt);
    return { success: true, comment: result.response.text() };
  } catch (error) {
    console.error("Error generating analytics comment:", error);
    return { success: false, error: "生成に失敗しました" };
  }
}

export async function generateWeeklyBlogProposal(clinicContext: string) {
  await checkAdminAuth();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "APIキーが設定されていません" };

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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

export async function generateDailySnsTasks(dateStr: string) {
  const { clinicId } = await checkAdminAuth();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "APIキーが設定されていません" };

  try {
    const { getBusinessContext } = await import("./sales");
    const bizContext = await getBusinessContext();
    const settings = await getClinicSettings();
    const supabase = await getSupabase();

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      あなたは接骨院の「SNS集客・マーケティング軍師AI」です。
      以下のクリニック情報を踏まえ、指定された日付（${dateStr}）に実行すべきSNSタスクを5つ提案してください。
      
      【クリニックの現状】
      ${bizContext.success ? bizContext.context : "取得失敗"}
      
      【SNS設定・ターゲット】
      ターゲット: ${settings?.target_persona || "一般"}
      トーン: ${settings?.video_tone || "親密"}
      キーワード: ${settings?.analysis_keywords?.join(", ") || "なし"}
      
      【重要：タスクの出力形式と内容】
      1. タスクは今日実行して効果が高いものを5つ選んでください。
      2. 各タスクには、InstagramやX、Googleビジネスプロフィール等、どこで、何をすべきか明確な「タイトル」を付けてください。
      3. 各タスクに必ず「見本（モデル内容）」を含めてください。
      4. 「見本」には、具体的にどのような投稿文にすべきか（キャッチコピー、内容、ハッシュタグ例など）を詳細に書いてください。
      
      出力は以下のJSON形式のみで返してください（Markdown不要、コードブロック不要）。
      [
        {
          "title": "タスクの短いタイトル",
          "priority": "high",
          "reference_content": "具体的な投稿の見本・構成案・キャッチコピーなど"
        },
        ...
      ]
      ※priorityは 'high', 'medium', 'low' のいずれか。
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    
    let dailyTasks;
    try {
      // JSONモード（responseMimeType）を使用しているため直接パースを試みる
      dailyTasks = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("[AI_TASK_LOG] JSON parse failed, trying regex fallback", parseErr);
      // 念のため正規表現での抽出も試みる
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        dailyTasks = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("AIの応答形式が正しくありません");
      }
    }

    if (!Array.isArray(dailyTasks)) {
      throw new Error("AIが配列形式で回答しませんでした");
    }

    const insertData = dailyTasks.map((t: any) => ({
      clinic_id: clinicId,
      task_date: dateStr,
      task_name: t.title,
      title: t.title,
      status: 'pending',
      priority: t.priority,
      reference_content: t.reference_content
    }));

    const { error } = await supabase.from("daily_tasks").insert(insertData);
    if (error) {
       console.error("[AI_TASK_LOG] Database insert error:", error);
       if (error.code === '42703') {
         throw new Error("データベースの更新（カラム追加）が反映されていない可能性があります。管理者へ連絡してください。");
       }
       throw error;
    }

    revalidatePath("/admin/tasks");
    return { success: true };
  } catch (error: any) {
    console.error("Error generating daily SNS tasks:", error);
    return { 
      success: false, 
      error: error.message || "AIタスクの生成中に予期せぬエラーが発生しました" 
    };
  }
}
