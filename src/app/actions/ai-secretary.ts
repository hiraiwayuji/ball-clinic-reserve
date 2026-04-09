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
    return { success: false, error: "蜿門ｾ励↓螟ｱ謨励＠縺ｾ縺励◆" };
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
    return { success: false, error: "菫晏ｭ倥↓螟ｱ謨励＠縺ｾ縺励◆" };
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
    return { success: false, error: "蜑企勁縺ｫ螟ｱ謨励＠縺ｾ縺励◆" };
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
    return { success: false, error: "蜿門ｾ励↓螟ｱ謨励＠縺ｾ縺励◆" };
  }
}

export async function generateAnalyticsComment(comparisonJson: string, customerDataJson?: string) {
  await checkAdminAuth();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "API繧ｭ繝ｼ縺瑚ｨｭ螳壹＆繧後※縺・∪縺帙ｓ" };

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `縺ゅ↑縺溘・謗･鬪ｨ髯｢縺ｮ邨悟霧蜿りｬAI縺ｧ縺吶ゆｻ･荳九・譛滄俣豈碑ｼ・ョ繝ｼ繧ｿ縺翫ｈ縺ｳ鬘ｧ螳｢螻樊ｧ繝・・繧ｿ繧定ｦ九※縲・劼髟ｷ縺ｸ縺ｮ邨悟霧繧ｳ繝｡繝ｳ繝医ｒ譌･譛ｬ隱槭〒逕滓・縺励※縺上□縺輔＞縲・
縲先ｯ碑ｼ・ョ繝ｼ繧ｿ・・SON・峨・${comparisonJson}

縲宣｡ｧ螳｢螻樊ｧ繝・・繧ｿ・・SON・峨・${customerDataJson || "縺ｪ縺・}

縲仙・蜉帙Ν繝ｼ繝ｫ縲・- 200譁・ｭ嶺ｻ･蜀・〒邁｡貎斐↓
- 濶ｯ縺九▲縺溽せ繧・縲・縺､蜈ｷ菴鍋噪縺ｫ隍偵ａ繧具ｼ域焚蟄励ｒ菴ｿ縺・ｼ・- 鬘ｧ螳｢螻､・亥ｹｴ莉｣繝ｻ諤ｧ蛻･繝ｻ譚･髯｢邨瑚ｷｯ・峨・蛯ｾ蜷代↓蝓ｺ縺･縺・◆蜈ｷ菴鍋噪縺ｪ髮・ｮ｢譁ｽ遲悶ｒ1縺､謠先｡医☆繧・- 髯｢髟ｷ繧偵後⊂繝ｼ繧九￥繧薙阪→蜻ｼ縺ｶ
- 邂・擅譖ｸ縺阪〒縺ｯ縺ｪ縺剰・辟ｶ縺ｪ莨夊ｩｱ譁・〒譖ｸ縺汁;

    const result = await model.generateContent(prompt);
    return { success: true, comment: result.response.text() };
  } catch (error) {
    console.error("Error generating analytics comment:", error);
    return { success: false, error: "逕滓・縺ｫ螟ｱ謨励＠縺ｾ縺励◆" };
  }
}

export async function generateWeeklyBlogProposal(clinicContext: string) {
  await checkAdminAuth();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "API繧ｭ繝ｼ縺瑚ｨｭ螳壹＆繧後※縺・∪縺帙ｓ" };

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const settings = await getClinicSettings();
    const snsContext = settings ? `
      縲心NS繧｢繧ｫ繧ｦ繝ｳ繝医・      - TikTok: ${settings.tiktok_url || '譛ｪ險ｭ螳・}
      - Instagram: ${settings.instagram_url || '譛ｪ險ｭ螳・}
      - YouTube: ${settings.youtube_url || '譛ｪ險ｭ螳・}
      - X: ${settings.x_url || '譛ｪ險ｭ螳・}
      
      縲舌ち繝ｼ繧ｲ繝・ヨ螻樊ｧ縲・ ${settings.target_persona || '荳闊ｬ'}
      縲仙虚逕ｻ繝医・繝ｳ縲・ ${settings.video_tone || '隕ｪ縺励∩繧・☆縺・}
      縲宣㍾轤ｹ繧ｭ繝ｼ繝ｯ繝ｼ繝峨・ ${settings.analysis_keywords?.join(', ') || '縺ｪ縺・}
      縲舌お繝ｪ繧｢縲・ ${settings.area_name || '譛ｪ險ｭ螳・}
    ` : '';

    const prompt = `
      縺ゅ↑縺溘・謗･鬪ｨ髯｢縺ｮ邨悟霧繧呈髪縺医ｋ縲瑚ｻ榊ｸｫAI縲阪〒縺吶・      莉･荳九・繧ｯ繝ｪ繝九ャ繧ｯ諠・ｱ繧定ｸ上∪縺医∽ｻ企ｱnote縺ｪ縺ｩ縺ｮ繝悶Ο繧ｰ縺ｫ謚慕ｨｿ縺吶ｋ險倅ｺ九・謠先｡医ｒ1縺､菴懈・縺励※縺上□縺輔＞縲・      
      縲舌け繝ｪ繝九ャ繧ｯ迥ｶ豕・ｼ域怙譁ｰ繝・・繧ｿ・峨・      ${clinicContext}
      
      ${snsContext}
      
      縲仙・蜉帛ｽ｢蠑・(JSON逶ｸ蠖薙・繝励Ξ繝ｼ繝ｳ繝・く繧ｹ繝医〒縲√ち繧ｰ縺ｪ縺ｩ縺ｧ蛹ｺ蛻・▲縺ｦ縺上□縺輔＞)縲・      Title: [險倅ｺ九ち繧､繝医Ν]
      Keywords: [繧ｭ繝ｼ繝ｯ繝ｼ繝・, 繧ｭ繝ｼ繝ｯ繝ｼ繝・, ...]
      ContentDraft: [險倅ｺ九・讒区・譯医ｄ蟆守ｷ壹・㍾隕√↑繝昴う繝ｳ繝医ｒ300譁・ｭ礼ｨ句ｺｦ縺ｧ]
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // 邁｡蜊倥↑繝代・繧ｹ (螳滄圀縺ｮ驕狗畑縺ｧ縺ｯJSON蠖｢蠑上ｒ謗ｨ螂ｨ)
    const title = text.match(/Title:\s*(.*)/)?.[1] || "莉企ｱ縺ｮ謠先｡郁ｨ倅ｺ・;
    const keywords = text.match(/Keywords:\s*(.*)/)?.[1]?.split(",").map(k => k.trim()) || [];
    const contentDraft = text.match(/ContentDraft:\s*([\s\S]*)/)?.[1] || text;

    const supabase = await getSupabase();
    const weekStart = new Date();
    weekStart.setHours(0,0,0,0);
    // 譛域屆譌･縺ｮ譌･莉倥↓蜷医ｏ縺帙ｋ縺ｪ縺ｩ縺ｮ隱ｿ謨ｴ繧ょ庄閭ｽ縺縺後∽ｸ譌ｦ莉頑律繧定ｵｷ轤ｹ
    
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
    return { success: false, error: "逕滓・縺ｫ螟ｱ謨励＠縺ｾ縺励◆" };
  }
}

export async function generateDailySnsTasks(dateStr: string) {
  const { clinicId } = await checkAdminAuth();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "API繧ｭ繝ｼ縺瑚ｨｭ螳壹＆繧後※縺・∪縺帙ｓ" };

  try {
    const { getBusinessContext } = await import("./sales");
    const bizContext = await getBusinessContext();
    const settings = await getClinicSettings();
    const supabase = await getSupabase();

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      縺ゅ↑縺溘・謗･鬪ｨ髯｢縺ｮ縲郡NS髮・ｮ｢繝ｻ繝槭・繧ｱ繝・ぅ繝ｳ繧ｰAI遘俶嶌AI縲阪〒縺吶・      莉･荳九・繧ｯ繝ｪ繝九ャ繧ｯ諠・ｱ繧定ｸ上∪縺医∵欠螳壹＆繧後◆譌･莉假ｼ・{dateStr}・峨↓螳溯｡後☆縺ｹ縺拘NS繧ｿ繧ｹ繧ｯ繧・縺､謠先｡医＠縺ｦ縺上□縺輔＞縲・      
      縲舌け繝ｪ繝九ャ繧ｯ縺ｮ迴ｾ迥ｶ縲・      ${bizContext.success ? bizContext.context : "蜿門ｾ怜､ｱ謨・}
      
      縲心NS險ｭ螳壹・繧ｿ繝ｼ繧ｲ繝・ヨ縲・      繧ｿ繝ｼ繧ｲ繝・ヨ: ${settings?.target_persona || "荳闊ｬ"}
      繝医・繝ｳ: ${settings?.video_tone || "隕ｪ蟇・}
      繧ｭ繝ｼ繝ｯ繝ｼ繝・ ${settings?.analysis_keywords?.join(", ") || "縺ｪ縺・}
      
      縲宣㍾隕・ｼ壹ち繧ｹ繧ｯ縺ｮ蜃ｺ蜉帛ｽ｢蠑上→蜀・ｮｹ縲・      1. 繧ｿ繧ｹ繧ｯ縺ｯ莉頑律螳溯｡後＠縺ｦ蜉ｹ譫懊′鬮倥＞繧ゅ・繧・縺､驕ｸ繧薙〒縺上□縺輔＞縲・      2. 蜷・ち繧ｹ繧ｯ縺ｫ縺ｯ縲！nstagram繧Ч縲；oogle繝薙ず繝阪せ繝励Ο繝輔ぅ繝ｼ繝ｫ遲峨√←縺薙〒縲∽ｽ輔ｒ縺吶∋縺阪°譏守｢ｺ縺ｪ縲後ち繧､繝医Ν縲阪ｒ莉倥￠縺ｦ縺上□縺輔＞縲・      3. 蜷・ち繧ｹ繧ｯ縺ｫ蠢・★縲瑚ｦ区悽・医Δ繝・Ν蜀・ｮｹ・峨阪ｒ蜷ｫ繧√※縺上□縺輔＞縲・      4. 縲瑚ｦ区悽縲阪↓縺ｯ縲∝・菴鍋噪縺ｫ縺ｩ縺ｮ繧医≧縺ｪ謚慕ｨｿ譁・↓縺吶∋縺阪°・医く繝｣繝・メ繧ｳ繝斐・縲∝・螳ｹ縲√ワ繝・す繝･繧ｿ繧ｰ萓九↑縺ｩ・峨ｒ隧ｳ邏ｰ縺ｫ譖ｸ縺・※縺上□縺輔＞縲・      
      蜃ｺ蜉帙・莉･荳九・JSON蠖｢蠑上・縺ｿ縺ｧ霑斐＠縺ｦ縺上□縺輔＞・・arkdown荳崎ｦ√√さ繝ｼ繝峨ヶ繝ｭ繝・け荳崎ｦ・ｼ峨・      [
        {
          "title": "繧ｿ繧ｹ繧ｯ縺ｮ遏ｭ縺・ち繧､繝医Ν",
          "priority": "high",
          "reference_content": "蜈ｷ菴鍋噪縺ｪ謚慕ｨｿ縺ｮ隕区悽繝ｻ讒区・譯医・繧ｭ繝｣繝・メ繧ｳ繝斐・縺ｪ縺ｩ"
        },
        ...
      ]
      窶ｻpriority縺ｯ 'high', 'medium', 'low' 縺ｮ縺・★繧後°縲・    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    
    let dailyTasks;
    try {
      // JSON繝｢繝ｼ繝会ｼ・esponseMimeType・峨ｒ菴ｿ逕ｨ縺励※縺・ｋ縺溘ａ逶ｴ謗･繝代・繧ｹ繧定ｩｦ縺ｿ繧・      dailyTasks = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("[AI_TASK_LOG] JSON parse failed, trying regex fallback", parseErr);
      // 蠢ｵ縺ｮ縺溘ａ豁｣隕剰｡ｨ迴ｾ縺ｧ縺ｮ謚ｽ蜃ｺ繧りｩｦ縺ｿ繧・      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        dailyTasks = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("AI縺ｮ蠢懃ｭ泌ｽ｢蠑上′豁｣縺励￥縺ゅｊ縺ｾ縺帙ｓ");
      }
    }

    if (!Array.isArray(dailyTasks)) {
      throw new Error("AI縺碁・蛻怜ｽ｢蠑上〒蝗樒ｭ斐＠縺ｾ縺帙ｓ縺ｧ縺励◆");
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
         throw new Error("繝・・繧ｿ繝吶・繧ｹ縺ｮ譖ｴ譁ｰ・医き繝ｩ繝霑ｽ蜉・峨′蜿肴丐縺輔ｌ縺ｦ縺・↑縺・庄閭ｽ諤ｧ縺後≠繧翫∪縺吶らｮ｡逅・・∈騾｣邨｡縺励※縺上□縺輔＞縲・);
       }
       throw error;
    }

    revalidatePath("/admin/tasks");
    return { success: true };
  } catch (error: any) {
    console.error("Error generating daily SNS tasks:", error);
    return { 
      success: false, 
      error: error.message || "AI繧ｿ繧ｹ繧ｯ縺ｮ逕滓・荳ｭ縺ｫ莠域悄縺帙〓繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆" 
    };
  }
}

/**
 * SEO/MEO Diagnosis
 */
export async function generateSEOMeoAdvice() {
  const { clinicId } = await checkAdminAuth();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "API繧ｭ繝ｼ縺瑚ｨｭ螳壹＆繧後※縺・∪縺帙ｓ" };

  try {
    const settings = await getClinicSettings();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const context = settings ? `
      縲舌け繝ｪ繝九ャ繧ｯ蝓ｺ譛ｬ諠・ｱ縲・      髯｢蜷・ ${settings.clinic_name}
      繧ｨ繝ｪ繧｢: ${settings.area_name || settings.address || '譛ｪ險ｭ螳・}
      繝帙・繝繝壹・繧ｸURL: ${settings.hp_url || '譛ｪ險ｭ螳・}
      繧ｿ繝ｼ繧ｲ繝・ヨ螻､: ${settings.target_persona || '荳闊ｬ'}
      驥咲せ繧ｭ繝ｼ繝ｯ繝ｼ繝・ ${settings.analysis_keywords?.join(', ') || '縺ｪ縺・}
      蝠・恟遽・峇: ${settings.market_area || '譛ｪ險ｭ螳・}
    ` : '諠・ｱ縺御ｸ崎ｶｳ縺励※縺・∪縺吶・;

    const prompt = `
      縺ゅ↑縺溘・謗･鬪ｨ髯｢縺ｫ迚ｹ蛹悶＠縺溘郡EO・域､懃ｴ｢繧ｨ繝ｳ繧ｸ繝ｳ譛驕ｩ蛹厄ｼ峨♀繧医・MEO・医・繝・・繧ｨ繝ｳ繧ｸ繝ｳ譛驕ｩ蛹厄ｼ峨阪・繝励Ο繧ｳ繝ｳ繧ｵ繝ｫ繧ｿ繝ｳ繝医〒縺吶・      Google縺ｮ隕也せ縺九ｉ縲∽ｸ願ｨ倥・繧ｯ繝ｪ繝九ャ繧ｯ縺後ｈ繧雁､壹￥縺ｮ譁ｰ隕乗ぅ閠・↓逋ｺ隕九＆繧後ｋ縺溘ａ縺ｮ謾ｹ蝟・ｭ悶ｒ謠先｡医＠縺ｦ縺上□縺輔＞縲・
      縲先ｧ区・繝ｫ繝ｼ繝ｫ縲・      1. 縲郡EO蟇ｾ遲厄ｼ医・繝ｼ繝繝壹・繧ｸ繝ｻ讀懃ｴ｢・峨阪→縲勲EO蟇ｾ遲厄ｼ・oogle繝槭ャ繝暦ｼ峨阪・2縺､縺ｮ繧ｫ繝・ざ繝ｪ縺ｧ蛻・￠縺ｦ縺上□縺輔＞縲・      2. 繝帙・繝繝壹・繧ｸURL縺梧署萓帙＆繧後※縺・ｋ蝣ｴ蜷医・縲√◎縺ｮ繝峨Γ繧､繝ｳ蜷阪ｄ讒区・縺九ｉ謗ｨ貂ｬ縺輔ｌ繧句・菴鍋噪謾ｹ蝟・せ・医ち繧､繝医Ν繧ｿ繧ｰ縺ｮ蟾･螟ｫ繧・せ繝槭・蟇ｾ蠢懊・驥崎ｦ∵ｧ縺ｪ縺ｩ・峨ｒ蠢・★1縺､蜷ｫ繧√※縺上□縺輔＞縲よ署萓帙＆繧後※縺・↑縺・ｴ蜷医・縲∽ｸ闊ｬ逧・↑HP菴懈・縺ｮ繧ｳ繝・ｒ莨昴∴縺ｦ縺上□縺輔＞縲・      3. 縺昴ｌ縺槭ｌ縲∵・譌･縺九ｉ縺吶＄螳溯｡後〒縺阪ｋ蜈ｷ菴鍋噪縺ｪ繧｢繧ｯ繧ｷ繝ｧ繝ｳ繧・縺､縺壹▽・郁ｨ・縺､・画署譯医＠縺ｦ縺上□縺輔＞縲・      4. 霑鷹團縺ｮ遶ｶ蜷医↓蜍昴▽縺溘ａ縺ｮ縲悟ｷｮ蛻･蛹悶・繧､繝ｳ繝医阪ｒ1縺､謖・遭縺励※縺上□縺輔＞縲・      5. 蟆る摩逕ｨ隱槭・驕ｿ縺代・劼髟ｷ蜈育函縺悟ｮ溯｡後＠繧・☆縺・ｹｳ譏薙↑險闡峨〒譖ｸ縺・※縺上□縺輔＞縲・      6. 蜈ｨ菴薙〒400譁・ｭ励・00譁・ｭ礼ｨ句ｺｦ縺ｧ縲｀arkdown蠖｢蠑上〒蜃ｺ蜉帙＠縺ｦ縺上□縺輔＞縲ゅヰ繝・ず繧・・繝ｼ繝ｫ繝峨ｒ菴ｿ縺｣縺ｦ蠑ｷ隱ｿ縺励※縺上□縺輔＞縲・      
      縲舌さ繝ｳ繝・く繧ｹ繝医・      ${context}
    `;

    const result = await model.generateContent(prompt);
    return { success: true, advice: result.response.text() };
  } catch (error: any) {
    console.error("Error generating SEO/MEO advice:", error);
    return { success: false, error: `AI險ｺ譁ｭ縺ｫ螟ｱ謨励＠縺ｾ縺励◆: ${error.message || "蜴溷屏荳肴・縺ｮ繧ｨ繝ｩ繝ｼ"}` };
  }
}

