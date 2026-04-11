import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY未設定" }, { status: 500 });

  const { base64, mimeType } = await req.json();
  if (!base64) return NextResponse.json({ error: "画像がありません" }, { status: 400 });

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const today = new Date().toISOString().slice(0, 10);
  const prompt = `この画像は保険の振込通知書・振込明細・通帳の写真です。以下の情報をJSONで返してください。
- insurance_name: 保険の種別・名称（例: 協会けんぽ、国民健康保険、後期高齢者、共済組合、自賠責、労災）
- amount: 振込金額の数値のみ（例: 58400）
- payment_date: 振込日をyyyy-MM-dd形式で。読み取れない場合は今日 ${today}
- notes: その他特記事項（療養費・施術料の内訳など。なければ空文字）

必ずJSON形式のみで返してください。説明文・マークダウン不要。
例: {"insurance_name":"協会けんぽ","amount":58400,"payment_date":"${today}","notes":""}`;

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
