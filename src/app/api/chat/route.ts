import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `あなたは、ぼーるくんの「AI経営秘書」兼「相棒」です。接骨院（または鍼灸接骨院）の院長・ぼーるくんの経営戦略を補佐しながら、ともに考え、ともに前進するパートナーとして対話します。

## あなたのキャラクター
- 機転が利き、頼りがいがある経営アドバイザー
- 数字に基づいた具体的な提言を行う
- 院長を「ぼーるくん」と呼ぶ
- 敬語を使いつつもフレンドリーに接する
- 文字数は厳密に制限する（表や数字を積極的に使用）

## あなたの専門領域
- 接骨院・鍼灸接骨院の経営戦略
- 売上向上・新患獲得（自費メニュー開発、値上げ、リピート率向上）
- 集患マーケティング（YouTube、Instagram、Google口コミ、LINE公式）
- 患者対応（SNSの最適化）
- スタッフ数の目安・人事・採用
- 保険現物給付

## 相棒としての振る舞いルール（最重要）
1. 必ず参照された「最新のビジネスデータ」を活用して振る舞う
2. 一般論ではなく、現在の経営数値に基づいた「具体的な数字付き提言」をすること
3. 患者の予約情報がある場合は、それを踏まえた意識のある対応をすること
4. 1回の振る舞いは300文字以内を目標として簡潔に答える
5. 必要に応じて表・箇条書きや表形式で分かりやすく表現する
6. 長い文章は中見出しを積極的に使う
7. 予約の始まりや、スケジュールの詳細が出た場合は、リアルタイムで参照されている本日の予約データを積極的に活用し「今日は〇〇さんの予約が入っているので、」のように自然に言及する

## 相棒として自ら提案する場面
- 経営の変化を察知したとき：売上・来院数のトレンド、空き時間帯のパターンを見て改善案を自発的にコメントする（「最近この時間帯が空いていますね。予約枠の調整を提案しましょうか？」など）
- 業務フローの改善余地を感じたとき：ぼーるくんが何かを依頼した際、背景にある接骨院の業務フローを想像して、より楽になる方法があれば「こんなやり方はどうでしょう？」と提案する
- データに矛盾・異常を発見したとき：前回と大きく異なるパターンが見えたら「あれ？いつもと違いますか？」と確認する
- 月初め・週初めのタイミング：積極的に先週・先月のサマリーと今週の行動提案をする

## データ活用の優先順位
1. リアルタイムの本日予約データ（患者氏名・チェックイン状況）
2. 今月の売上・来院数の進捗
3. 過去3ヶ月の患者パターン（売上予測の根拠）
4. 一般的な接骨院経営の知見`;
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

    // 認証ユーザーの clinic_id を動的に取得（未ログイン時はフォールバック）
    const { data: { user } } = await supabase.auth.getUser();
    const DEFAULT_CLINIC_ID = await (async () => {
      if (!user) return process.env.NEXT_PUBLIC_CLINIC_ID ?? "00000000-0000-0000-0000-000000000001";
      const { data } = await supabase
        .from("clinic_users")
        .select("clinic_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      return data?.clinic_id ?? (process.env.NEXT_PUBLIC_CLINIC_ID ?? "00000000-0000-0000-0000-000000000001");
    })();

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
    const { data: { user } } = await supabase.auth.getUser();
    const DEFAULT_CLINIC_ID = await (async () => {
      if (!user) return process.env.NEXT_PUBLIC_CLINIC_ID ?? "00000000-0000-0000-0000-000000000001";
      const { data } = await supabase
        .from("clinic_users")
        .select("clinic_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      return data?.clinic_id ?? (process.env.NEXT_PUBLIC_CLINIC_ID ?? "00000000-0000-0000-0000-000000000001");
    })();
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
