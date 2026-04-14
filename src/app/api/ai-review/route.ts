import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(request: NextRequest) {
  try {
    const { month, events } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ review: "AI APIキーが設定されていません" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `あなたは家族の予定を管理するAI秘書です。
以下は${month}の家族の予定リストです。
予定を見て、以下の観点で短くコメントしてください（200文字以内）：
・予定が重なっていないか
・忙しすぎる日・期間はないか
・大事な予定の前後に準備時間があるか
・何か見落としやすいことがあれば注意喚起

予定リスト：
${events || "（予定なし）"}

コメントは友好的・簡潔に。箇条書きで3点以内にまとめてください。`;

    const result = await model.generateContent(prompt);
    const review = result.response.text();

    return NextResponse.json({ review });
  } catch (error) {
    console.error("AI review error:", error);
    return NextResponse.json({ review: "AI秘書の呼び出しに失敗しました" }, { status: 500 });
  }
}
