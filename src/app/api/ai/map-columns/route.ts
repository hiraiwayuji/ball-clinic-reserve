import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export type TargetSchema = "expenses" | "insurance";

export type ColumnMapping = {
  colIndex: number;
  dbField: string;
  confidence: number;
  reason: string;
};

export type MappingResponse = {
  mappings: ColumnMapping[];
  unmapped: number[];
  warnings: string[];
};

const SCHEMA_FIELDS: Record<TargetSchema, { field: string; description: string; required: boolean }[]> = {
  expenses: [
    { field: "expense_date", description: "日付（支払日、発生日、計上日など）", required: true },
    { field: "category",     description: "カテゴリ・科目（勘定科目、費目、種別など）", required: true },
    { field: "description",  description: "内容・品名（摘要、品目、商品名、内容など）", required: true },
    { field: "amount",       description: "金額（支払額、税込額、円、費用など）", required: true },
    { field: "memo",         description: "備考・メモ（任意）", required: false },
  ],
  insurance: [
    { field: "payment_month",  description: "対象月（請求月、診療月、YYYY/MM形式）", required: true },
    { field: "insurance_name", description: "保険組合名・機関名（支払元、保険者名など）", required: true },
    { field: "amount",         description: "金額（入金額、支払額、円）", required: true },
    { field: "payment_date",   description: "入金日・振込日（任意）", required: false },
    { field: "notes",          description: "備考・メモ（任意）", required: false },
  ],
};

export async function POST(req: NextRequest) {
  try {
    const { headers, sampleRows, targetSchema } = (await req.json()) as {
      headers: string[];
      sampleRows: string[][];
      targetSchema: TargetSchema;
    };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "APIキー未設定" }, { status: 500 });

    const fields = SCHEMA_FIELDS[targetSchema];
    const fieldDescriptions = fields
      .map((f) => `- ${f.field}: ${f.description}${f.required ? "（必須）" : "（任意）"}`)
      .join("\n");

    const prompt = `あなたは会計データのエキスパートです。
Excelのヘッダー行とサンプルデータを分析し、各列をデータベースフィールドにマッピングしてください。

【Excelヘッダー（列インデックス: 列名）】:
${headers.map((h, i) => `${i}: "${h}"`).join("\n")}

【サンプルデータ（最大3行）】:
${sampleRows.map((row, i) => `行${i + 1}: ${row.map((cell, j) => `列${j}="${cell}"`).join(", ")}`).join("\n")}

【マッピング先フィールド】:
${fieldDescriptions}

ルール:
- 同じフィールドに複数の列をマッピングしないこと
- 判断できない列はunmappedに含めること
- confidenceは0.0〜1.0で、0.7未満は要確認とする
- 列名が日本語・英語・略語のいずれでも対応すること

以下のJSON形式のみで返答し、説明文は一切不要:
{
  "mappings": [
    { "colIndex": 0, "dbField": "expense_date", "confidence": 0.95, "reason": "「日付」という列名から判断" }
  ],
  "unmapped": [],
  "warnings": []
}`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "AI応答のパースに失敗しました" }, { status: 500 });
    }

    const parsed: MappingResponse = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("[map-columns]", error);
    return NextResponse.json({ error: "マッピングに失敗しました" }, { status: 500 });
  }
}
