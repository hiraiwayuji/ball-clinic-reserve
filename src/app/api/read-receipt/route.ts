import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const CATEGORIES = ["光熱費","消耗品","備品購入","交通費","通信費","家賃","広告費","教育・研修","リース料","雑費","その他"];

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY未設定" }, { status: 500 });

  const { base64, mimeType } = await req.json();
  if (!base64) return NextResponse.json({ error: "画像がありません" }, { status: 400 });

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const today = new Date().toISOString().slice(0, 10);
  const prompt = `このレシート・領収書の画像から以下の情報をJSONで返してください。
- amount: 合計金額（税込）の数値のみ（例: 1980）
- description: 購入内容・店名（例: コンビニ消耗品、ホームセンター備品）
- category: 以下の中から最も適切なもの1つ → ${CATEGORIES.join("、")}
- expense_date: レシートに記載された日付をyyyy-MM-dd形式で。読み取れない場合は今日の日付 ${today}
- memo: その他特記事項（なければ空文字）

必ずJSON形式のみで返してください。説明文は不要です。
例: {"amount":1980,"description":"ローソン 消耗品","category":"消耗品","expense_date":"${today}","memo":""}`;

  const result = await model.generateContent([
    { inlineData: { mimeType: mimeType || "image/jpeg", data: base64 } },
    prompt,
  ]);

  const text = result.response.text().trim().replace(/```json|```/g, "").trim();
  try {
    const json = JSON.parse(text);
    return NextResponse.json(json);
  } catch {
    return NextResponse.json({ error: "解析に失敗しました", raw: text }, { status: 422 });
  }
}
