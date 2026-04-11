import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `\u3042\u306a\u305f\u306f\u3001AI\u79d8\u66f8\u3067\u3059\u3002\u63a5\u9aa8\u9662\uff08\u307e\u305f\u306f\u9492\u7099\u63a5\u9aa8\u9662\uff09\u306e\u9662\u9577\u306e\u7d4c\u55b6\u6226\u7565\u88dc\u4f50\u3068\u3057\u3066\u5bfe\u8a71\u3057\u307e\u3059\u3002AI\u79d8\u66f8\u306f\u3001\u751f\u7523\u6027\u306e\u5411\u4e0a\u3092\u524d\u63d0\u3068\u3057\u3001\u7d4c\u55b6\u306e\u9054\u6210\u5b89\u5b9a\u3092\u30b5\u30dd\u30fc\u30c8\u3059\u308b\u3053\u3068\u304c\u4f7f\u547d\u3067\u3059\u3002\u8fd4\u7b54\u306f\u4e01\u5be7\u3067\u3059\u304c\u3001\u89aa\u3057\u307f\u3084\u3059\u304f\u3001\u304b\u3064\u30d7\u30ed\u30d5\u30a7\u30c3\u30b7\u30e7\u30ca\u30eb\u306a\u79d8\u66f8\u3068\u3057\u3066\u632f\u308b\u821e\u3063\u3066\u304f\u3060\u3055\u3044\u3002

## \u3042\u306a\u305f\u306e\u30ad\u30e3\u30e9\u30af\u30bf\u30fc
- \u6a5f\u8ee2\u304c\u5229\u304d\u3001\u983c\u308a\u304c\u3044\u304c\u3042\u308b\u7d4c\u55b6\u30a2\u30c9\u30d0\u30a4\u30b6\u30fc
- \u6570\u5b57\u306b\u57fa\u3065\u3044\u305f\u5177\u4f53\u7684\u306a\u63d0\u8a00\u3092\u884c\u3046
- \u9662\u9577\u3092\u300c\u307c\u30fc\u308b\u304f\u3093\u300d\u3068\u547c\u3076
- \u656c\u8a9e\u3092\u4f7f\u3044\u3064\u3064\u3082\u30d5\u30ec\u30f3\u30c9\u30ea\u30fc\u306b\u63a5\u3059\u308b
- \u6587\u5b57\u6570\u306f\u53b3\u5bc6\u306b\u5236\u9650\u3059\u308b\uff08\u8868\u3084\u6570\u5b57\u3092\u7a4d\u6975\u7684\u306b\u4f7f\u7528\uff09

## \u3042\u306a\u305f\u306e\u5c02\u9580\u9818\u57df
- \u63a5\u9aa8\u9662\u30fb\u9492\u7099\u63a5\u9aa8\u9662\u306e\u7d4c\u55b6\u6226\u7565
- \u58f2\u4e0a\u5411\u4e0a\u30fb\u65b0\u60a3\u7372\u5f97\uff08\u81ea\u8cbb\u30e1\u30cb\u30e5\u30fc\u958b\u767a\u3001\u5024\u4e0a\u3052\u3001\u30ea\u30d4\u30fc\u30c8\u7387\u5411\u4e0a\uff09
- \u96c6\u60a3\u30de\u30fc\u30b1\u30c6\u30a3\u30f3\u30b0\uff08YouTube\u3001Instagram\u3001Google\u53e3\u30b3\u30df\u3001LINE\u516c\u5f0f\uff09
- \u60a3\u8005\u5bfe\u5fdc\uff08SNS\u306e\u6700\u9069\u5316\uff09
- \u30b9\u30bf\u30c3\u30d5\u6570\u306e\u76ee\u5b89\u30fb\u4eba\u4e8b\u30fb\u63a1\u7528
- \u4fdd\u967a\u73fe\u7269\u7d66\u4ed8

## \u632f\u308b\u821e\u3044\u306e\u30eb\u30fc\u30eb
1. \u5fc5\u305a\u53c2\u7167\u3055\u308c\u305f\u300c\u6700\u65b0\u306e\u30d3\u30b8\u30cd\u30b9\u30c7\u30fc\u30bf\u300d\u3092\u6d3b\u7528\u3057\u3066\u632f\u308b\u821e\u3046
2. \u4e00\u822c\u8ad6\u3067\u306f\u306a\u304f\u3001\u73fe\u5728\u306e\u7d4c\u55b6\u6570\u5024\u306b\u57fa\u3065\u3044\u305f\u300c\u5177\u4f53\u7684\u306a\u6570\u5b57\u4ed8\u304d\u63d0\u8a00\u300d\u3092\u3059\u308b\u3053\u3068
3. \u60a3\u8005\u306e\u4e88\u7d04\u60c5\u5831\u304c\u3042\u308b\u5834\u5408\u306f\u3001\u305d\u308c\u3092\u8e0f\u307e\u3048\u305f\u610f\u8b58\u306e\u3042\u308b\u5bfe\u5fdc\u3092\u3059\u308b\u3053\u3068
4. 1\u56de\u306e\u632f\u308b\u821e\u3044\u306f300\u6587\u5b57\u4ee5\u5185\u3092\u76ee\u6a19\u3068\u3057\u3066\u7c21\u6f54\u306b\u7b54\u3048\u308b
5. \u5fc5\u8981\u306b\u5fdc\u3058\u3066\u8868\u30fb\u7b87\u6761\u66f8\u304d\u3084\u8868\u5f62\u5f0f\u3067\u5206\u304b\u308a\u3084\u3059\u304f\u8868\u73fe\u3059\u308b
6. \u9577\u3044\u6587\u7ae0\u306f\u4e2d\u898b\u51fa\u3057\u3092\u7a4d\u6975\u7684\u306b\u4f7f\u3046
7. \u4e88\u7d04\u306e\u59cb\u307e\u308a\u3084\u3001\u30b9\u30b1\u30b8\u30e5\u30fc\u30eb\u306e\u8a73\u7d30\u304c\u51fa\u305f\u5834\u5408\u306f\u3001\u30ea\u30a2\u30eb\u30bf\u30a4\u30e0\u3067\u53c2\u7167\u3055\u308c\u3066\u3044\u308b\u672c\u65e5\u306e\u4e88\u7d04\u30c7\u30fc\u30bf\uff08\u60a3\u8005\u6c0f\u540d\u30fb\u6642\u9593\uff09\u3092\u7a4d\u6975\u7684\u306b\u6d3b\u7528\u3057\u3001\u300c\u4eca\u65e5\u306f\u25cb\u25cb\u3055\u3093\u306e\u4e88\u7d04\u304c\u5165\u3063\u3066\u3044\u308b\u306e\u3067\u3001\u300d\u306e\u3088\u3046\u306b\u81ea\u7136\u306b\u8a00\u53ca\u3059\u308b\u3053\u3068\u3002`;

export async function POST(request: NextRequest) {
  try {
    const { message, businessContext: clientContext } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "\u30e1\u30c3\u30bb\u30fc\u30b8\u304c\u5fc5\u8981\u3067\u3059" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI API\u30ad\u30fc\u304c\u8a2d\u5b9a\u3055\u308c\u3066\u3044\u307e\u305b\u3093" }, { status: 500 });
    }

    // Load recent chat history
    const supabase = await createClient();
    const DEFAULT_CLINIC_ID = "00000000-0000-0000-0000-000000000001";

    // 自動配信設定・本日予約件数を取得してコンテキストに追加
    const { data: clinicSettings } = await supabase
      .from("clinic_settings")
      .select("auto_remind_enabled, auto_remind_time")
      .eq("id", DEFAULT_CLINIC_ID)
      .maybeSingle();

    const today = new Date();
    const todayJST = new Date(today.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const todayStr = `${todayJST.getFullYear()}-${String(todayJST.getMonth()+1).padStart(2,"0")}-${String(todayJST.getDate()).padStart(2,"0")}`;
    const { count: todayApptCount } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", DEFAULT_CLINIC_ID)
      .gte("start_time", `${todayStr}T00:00:00+09:00`)
      .lte("start_time", `${todayStr}T23:59:59+09:00`)
      .neq("status", "cancelled");

    const autoRemindCtx = clinicSettings?.auto_remind_enabled
      ? `当日リマインド自動配信: ON（毎日${clinicSettings.auto_remind_time}に自動送信）`
      : "当日リマインド自動配信: OFF（手動配信のみ）";

    const systemReminderNote = `\n\n## 本日の予約・配信状況\n- 本日の予約件数: ${todayApptCount ?? 0}件\n- ${autoRemindCtx}`;
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
      ? `\u300c\u6700\u65b0\u306e\u30d3\u30b8\u30cd\u30b9\u30c7\u30fc\u30bf\uff08\u30ea\u30a2\u30eb\u30bf\u30a4\u30e0\uff09\u300d\n${businessContext}`
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
      ? `${contextMessage}\n\n---\n\n\u307c\u30fc\u308b\u304f\u3093\u304b\u3089\u306e\u8cea\u554f\n${message}`
      : message;
    contents.push({ role: "user", parts: [{ text: userText }] });

    const result = await model.generateContent({
      contents,
      systemInstruction: SYSTEM_PROMPT + systemReminderNote,
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
      { error: "AI\u79d8\u66f8\u304c\u5fdc\u7b54\u4e2d\u3067\u3059\u3002\u5c11\u3057\u6642\u9593\u3092\u304a\u3044\u3066\u304b\u3089\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002" },
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
