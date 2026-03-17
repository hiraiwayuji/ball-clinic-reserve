import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getBusinessContext } from "@/app/actions/sales";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `あなたは「経営軍師AI」です。接骨院（ボール接骨院）の院長であるぼーるくんの専属・経営参謀として対話します。

## あなたのキャラクター
- 知的で頼りがいがある経営アドバイザー
- 数字に基づいた具体的な提案を行う
- 院長を「ぼーるくん」と呼ぶ
- 敬語を使いつつもフレンドリーに接する
- 短く的確に回答する（箇条書きや数字を積極活用）

## あなたの専門分野
- 接骨院・整骨院の経営戦略
- 売上向上施策（自費メニュー開発、物販、リピート率向上）
- 集客マーケティング（YouTube、Instagram、Google口コミ、LINE公式）
- 患者体験（CX）の最適化
- スタッフ教育・人材マネジメント
- 地域医療連携

## 回答のルール
1. 必ず提供された【最新のビジネスデータ】を参照して回答する
2. 一般論ではなく、現在の経営数値に基づいた「具体的な数字付き提案」をすること
3. 過去の会話履歴がある場合は、それを踏まえた文脈のある会話をすること
4. 1回の回答は300文字以内を目安とし、簡潔に伝える
5. 必要に応じて箇条書きや表形式で分かりやすく提示する
6. 良い数字は褒め、改善点は建設的に伝える
7. 会話の始まりや、スケジュールの話題が出た際は、リアルタイムで提供されている本日の予約データ（患者名・時間）を積極的に活用し、「今日は〇〇さんの予約が入っているので〜」のように自発的に言及すること。`;

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "メッセージが必要です" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI APIキーが設定されていません" }, { status: 500 });
    }

    // 1. Gather business context
    const contextRes = await getBusinessContext();
    const businessContext = contextRes.context || "データ取得に失敗しました";

    // 2. Load recent chat history
    const supabase = await createClient();
    const { data: history } = await supabase
      .from("ai_chat_messages")
      .select("role, content")
      .order("created_at", { ascending: false })
      .limit(20);

    const chatHistory = (history || []).reverse();

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const contextMessage = `【最新のビジネスデータ（リアルタイム）】\n${businessContext}`;

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
    contents.push({
      role: "user",
      parts: [{ text: `${contextMessage}\n\n---\n\nぼーるくんからの質問:\n${message}` }]
    });

    const result = await model.generateContent({
      contents,
      systemInstruction: SYSTEM_PROMPT,
    });

    const aiResponse = result.response.text();

    // 4. Save both messages to DB
    await supabase.from("ai_chat_messages").insert([
      { role: "user", content: message },
      { role: "assistant", content: aiResponse },
    ]);

    return NextResponse.json({ response: aiResponse });
  } catch (error: any) {
    console.error("AI Chat error:", error);
    return NextResponse.json(
      { error: "軍師が休憩中です。少し時間を置いてから話しかけてください。" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ai_chat_messages")
      .select("id, role, content, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({ messages: (data || []).reverse() });
  } catch (error) {
    console.error("Chat history fetch error:", error);
    return NextResponse.json({ messages: [] });
  }
}
