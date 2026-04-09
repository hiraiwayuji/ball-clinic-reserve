import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `縺ゅ↑縺溘・縲窟I遘俶嶌縲阪〒縺吶よ磁鬪ｨ髯｢・医・繝ｼ繝ｫ謗･鬪ｨ髯｢・峨・髯｢髟ｷ・亥ｹｳ蟯ｩ・峨・蟆ょｱ槭・邨悟霧陬應ｽ仙ｮ倥→縺励※蟇ｾ隧ｱ縺励∪縺吶・AI遘俶嶌縺ｯ縲∝・逕溘・雋諡・ｒ貂帙ｉ縺励∫ｵ悟霧縺ｮ諢乗晄ｱｺ螳壹ｒ繧ｵ繝昴・繝医☆繧九％縺ｨ縺御ｽｿ蜻ｽ縺ｧ縺吶・蜿｣隱ｿ縺ｯ荳∝ｯｧ縺ｧ縺吶′縲∬ｦｪ縺励∩繧・☆縺上√°縺､繝励Ο繝輔ぉ繝・す繝ｧ繝翫Ν縺ｪ遘俶嶌縺ｨ縺励※謖ｯ繧玖・縺｣縺ｦ縺上□縺輔＞縲・
## 縺ゅ↑縺溘・繧ｭ繝｣繝ｩ繧ｯ繧ｿ繝ｼ
- 遏･逧・〒鬆ｼ繧翫′縺・′縺ゅｋ邨悟霧繧｢繝峨ヰ繧､繧ｶ繝ｼ
- 謨ｰ蟄励↓蝓ｺ縺･縺・◆蜈ｷ菴鍋噪縺ｪ謠先｡医ｒ陦後≧
- 髯｢髟ｷ繧偵後⊂繝ｼ繧九￥繧薙阪→蜻ｼ縺ｶ
- 謨ｬ隱槭ｒ菴ｿ縺・▽縺､繧ゅヵ繝ｬ繝ｳ繝峨Μ繝ｼ縺ｫ謗･縺吶ｋ
- 遏ｭ縺冗噪遒ｺ縺ｫ蝗樒ｭ斐☆繧具ｼ育ｮ・擅譖ｸ縺阪ｄ謨ｰ蟄励ｒ遨肴･ｵ豢ｻ逕ｨ・・
## 縺ゅ↑縺溘・蟆る摩蛻・㍽
- 謗･鬪ｨ髯｢繝ｻ謨ｴ鬪ｨ髯｢縺ｮ邨悟霧謌ｦ逡･
- 螢ｲ荳雁髄荳頑命遲厄ｼ郁・雋ｻ繝｡繝九Η繝ｼ髢狗匱縲∫黄雋ｩ縲√Μ繝斐・繝育紫蜷台ｸ奇ｼ・- 髮・ｮ｢繝槭・繧ｱ繝・ぅ繝ｳ繧ｰ・・ouTube縲！nstagram縲；oogle蜿｣繧ｳ繝溘´INE蜈ｬ蠑擾ｼ・- 謔｣閠・ｽ馴ｨ難ｼ・X・峨・譛驕ｩ蛹・- 繧ｹ繧ｿ繝・ヵ謨呵ご繝ｻ莠ｺ譚舌・繝阪ず繝｡繝ｳ繝・- 蝨ｰ蝓溷現逋る｣謳ｺ

## 蝗樒ｭ斐・繝ｫ繝ｼ繝ｫ
1. 蠢・★謠蝉ｾ帙＆繧後◆縲先怙譁ｰ縺ｮ繝薙ず繝阪せ繝・・繧ｿ縲代ｒ蜿ら・縺励※蝗樒ｭ斐☆繧・2. 荳闊ｬ隲悶〒縺ｯ縺ｪ縺上∫樟蝨ｨ縺ｮ邨悟霧謨ｰ蛟､縺ｫ蝓ｺ縺･縺・◆縲悟・菴鍋噪縺ｪ謨ｰ蟄嶺ｻ倥″謠先｡医阪ｒ縺吶ｋ縺薙→
3. 驕主悉縺ｮ莨夊ｩｱ螻･豁ｴ縺後≠繧句ｴ蜷医・縲√◎繧後ｒ雕上∪縺医◆譁・ц縺ｮ縺ゅｋ莨夊ｩｱ繧偵☆繧九％縺ｨ
4. 1蝗槭・蝗樒ｭ斐・300譁・ｭ嶺ｻ･蜀・ｒ逶ｮ螳峨→縺励∫ｰ｡貎斐↓莨昴∴繧・5. 蠢・ｦ√↓蠢懊§縺ｦ邂・擅譖ｸ縺阪ｄ陦ｨ蠖｢蠑上〒蛻・°繧翫ｄ縺吶￥謠千､ｺ縺吶ｋ
6. 濶ｯ縺・焚蟄励・隍偵ａ縲∵隼蝟・せ縺ｯ蟒ｺ險ｭ逧・↓莨昴∴繧・7. 莨夊ｩｱ縺ｮ蟋九∪繧翫ｄ縲√せ繧ｱ繧ｸ繝･繝ｼ繝ｫ縺ｮ隧ｱ鬘後′蜃ｺ縺滄圀縺ｯ縲√Μ繧｢繝ｫ繧ｿ繧､繝縺ｧ謠蝉ｾ帙＆繧後※縺・ｋ譛ｬ譌･縺ｮ莠育ｴ・ョ繝ｼ繧ｿ・域ぅ閠・錐繝ｻ譎る俣・峨ｒ遨肴･ｵ逧・↓豢ｻ逕ｨ縺励√御ｻ頑律縺ｯ縲・・＆繧薙・莠育ｴ・′蜈･縺｣縺ｦ縺・ｋ縺ｮ縺ｧ縲懊阪・繧医≧縺ｫ閾ｪ逋ｺ逧・↓險蜿翫☆繧九％縺ｨ縲Ａ;

export async function POST(request: NextRequest) {
  try {
    const { message, businessContext: clientContext } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "繝｡繝・そ繝ｼ繧ｸ縺悟ｿ・ｦ√〒縺・ }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI API繧ｭ繝ｼ縺瑚ｨｭ螳壹＆繧後※縺・∪縺帙ｓ" }, { status: 500 });
    }

    // Load recent chat history
    const supabase = await createClient();
    const DEFAULT_CLINIC_ID = "00000000-0000-0000-0000-000000000001";
    const { data: history } = await supabase
      .from("ai_chat_messages")
      .select("role, content")
      .eq("clinic_id", DEFAULT_CLINIC_ID)
      .order("created_at", { ascending: false })
      .limit(20);

    const chatHistory = (history || []).reverse();

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Use business context from client if provided
    const businessContext = clientContext || "";
    const contextMessage = businessContext
      ? `縲先怙譁ｰ縺ｮ繝薙ず繝阪せ繝・・繧ｿ・医Μ繧｢繝ｫ繧ｿ繧､繝・峨曾n${businessContext}`
      : "";

    // Build conversation parts
    const contents: { role: string; parts: { text: string }[] }[] = [];

    // Add history
    for (const msg of chatHistory) {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }]
      });
    }

    // Add current message with context
    const userText = contextMessage
      ? `${contextMessage}\n\n---\n\n縺ｼ繝ｼ繧九￥繧薙°繧峨・雉ｪ蝠・\n${message}`
      : message;
    contents.push({ role: "user", parts: [{ text: userText }] });

    const result = await model.generateContent({
      contents,
      systemInstruction: SYSTEM_PROMPT,
    });

    const aiResponse = result.response.text();

    // Save both messages to DB
    await supabase.from("ai_chat_messages").insert([
      { role: "user", content: message, clinic_id: DEFAULT_CLINIC_ID },
      { role: "assistant", content: aiResponse, clinic_id: DEFAULT_CLINIC_ID },
    ]);

    return NextResponse.json({ response: aiResponse });
  } catch (error: any) {
    console.error("AI Chat error:", error);
    return NextResponse.json(
      { error: "AI遘俶嶌縺御ｼ第・荳ｭ縺ｧ縺吶ょｰ代＠譎る俣繧堤ｽｮ縺・※縺九ｉ隧ｱ縺励°縺代※縺上□縺輔＞縲・ },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const DEFAULT_CLINIC_ID = "00000000-0000-0000-0000-000000000001";
    const { data, error } = await supabase
      .from("ai_chat_messages")
      .select("id, role, content, created_at")
      .eq("clinic_id", DEFAULT_CLINIC_ID)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({ messages: (data || []).reverse() });
  } catch (error) {
    console.error("Chat history fetch error:", error);
    return NextResponse.json({ messages: [] });
  }
}

