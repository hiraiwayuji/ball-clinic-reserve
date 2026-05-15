import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, type FunctionDeclaration, SchemaType } from "@google/generative-ai";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

// AI 秘書チャットから呼び出せる tool 定義（Gemini function calling）
const REMINDER_TOOL: FunctionDeclaration = {
  name: "create_reminder",
  description:
    "業務中の一時的なリマインダーを登録します。指定時刻になったら管理画面に音つきポップアップが表示されます。同じ院のスタッフ全員に共有されます。「30分後に〜」「19時に〜」「仕事終わりに〜」のような自然言語の依頼を受けたらこの tool を使ってください。fire_in_minutes と fire_at_iso のどちらか一方を必ず指定してください。",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      title: {
        type: SchemaType.STRING,
        description: "リマインダーの簡潔なタイトル（例: 水素吸入の患者さんに声かけ、ミーティング）",
      },
      message: {
        type: SchemaType.STRING,
        description: "補足メッセージ（任意）。例: 19時のミーティング、資料も忘れずに",
      },
      fire_in_minutes: {
        type: SchemaType.NUMBER,
        description:
          "現在から何分後に発火させるか。「30分後」なら 30、「1時間後」なら 60。fire_at_iso と排他。1〜10080(1週間)の範囲。",
      },
      fire_at_iso: {
        type: SchemaType.STRING,
        description:
          "発火時刻を ISO 8601 形式で（例: 2026-05-03T19:00:00+09:00）。「今日の19時」「明日の9時」のような絶対時刻指定で使う。fire_in_minutes と排他。",
      },
    },
    required: ["title"],
  },
};

const STAFF_OVERRIDE_TOOL: FunctionDeclaration = {
  name: "create_staff_override",
  description:
    "院長や特定スタッフが「○曜日の○時にミーティング」「来週木曜は休み」「明日午後は研修」などで予約を取れないようにしたい時に呼び出します。指定された日時で staff_working_overrides に登録し、患者LPの予約スロットから自動的に消えます。実行前に必ず「○月○日の○時〜○時、○○先生をミーティングで予約ブロックしますね？」と確認してから使うこと。staff_name は院のスタッフ名（藤川先生、森川先生 等）、kind は meeting/leave/training/other のいずれか。",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      staff_name: {
        type: SchemaType.STRING,
        description: "対象スタッフ名（部分一致で検索。例: '藤川'、'森川先生'）",
      },
      date: {
        type: SchemaType.STRING,
        description: "対象日 YYYY-MM-DD",
      },
      start_time: {
        type: SchemaType.STRING,
        description: "開始時刻 HH:MM。終日不在なら省略",
      },
      end_time: {
        type: SchemaType.STRING,
        description: "終了時刻 HH:MM。終日不在なら省略",
      },
      kind: {
        type: SchemaType.STRING,
        description: "予定の種別: meeting (ミーティング) / leave (休み・私用) / training (研修) / other (その他)",
      },
      note: {
        type: SchemaType.STRING,
        description: "補足メモ（任意）",
      },
    },
    required: ["staff_name", "date", "kind"],
  },
};

async function executeCreateStaffOverride(
  args: {
    staff_name?: string;
    date?: string;
    start_time?: string;
    end_time?: string;
    kind?: string;
    note?: string;
  },
  ctx: { clinicId: string; userId: string | null; userEmail: string | null; role: string | null },
): Promise<{ ok: boolean; message?: string; error?: string }> {
  if (!ctx.role || (ctx.role !== "owner" && ctx.role !== "admin")) {
    return { ok: false, error: "予約ブロックの登録は院長 (owner) または管理者 (admin) のみ可能です" };
  }
  const staffName = (args.staff_name ?? "").trim();
  const date = (args.date ?? "").trim();
  const kind = (args.kind ?? "").trim();
  if (!staffName || !date || !kind) return { ok: false, error: "staff_name / date / kind が必要です" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "date は YYYY-MM-DD 形式で指定してください" };
  if (!["meeting", "leave", "training", "other"].includes(kind)) {
    return { ok: false, error: "kind は meeting/leave/training/other のいずれか" };
  }
  if ((args.start_time && !args.end_time) || (!args.start_time && args.end_time)) {
    return { ok: false, error: "開始・終了時刻はどちらも指定するか、両方未指定（終日扱い）にしてください" };
  }
  if (args.start_time && args.end_time && args.start_time >= args.end_time) {
    return { ok: false, error: "終了時刻は開始時刻より後にしてください" };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, error: "Supabase env missing" };
  const db = createAdminClient(url, key, { auth: { persistSession: false } });

  // スタッフ名で検索（部分一致、active のみ）
  const { data: staffMatches } = await db
    .from("reservation_staff")
    .select("id, name")
    .eq("clinic_id", ctx.clinicId)
    .eq("is_active", true)
    .ilike("name", `%${staffName}%`);
  if (!staffMatches || staffMatches.length === 0) {
    return { ok: false, error: `スタッフ「${staffName}」が見つかりません。氏名を確認してください` };
  }
  if (staffMatches.length > 1) {
    return { ok: false, error: `「${staffName}」に該当するスタッフが複数います: ${staffMatches.map((s: any) => s.name).join(" / ")}。氏名を絞ってください` };
  }
  const staff = staffMatches[0] as { id: string; name: string };

  const { error } = await db.from("staff_working_overrides").insert({
    clinic_id: ctx.clinicId,
    staff_id: staff.id,
    date,
    start_time: args.start_time ?? null,
    end_time: args.end_time ?? null,
    kind,
    note: args.note?.trim() || null,
    blocks_booking: true,
    created_by_email: ctx.userEmail,
  });
  if (error) return { ok: false, error: error.message };

  const timeText = args.start_time && args.end_time ? `${args.start_time}〜${args.end_time}` : "終日";
  return { ok: true, message: `${date} ${timeText} を ${staff.name} の${kindLabel(kind)}として登録しました。全スタッフが不在の時間帯は患者LPの予約スロットから消えます。` };
}

function kindLabel(k: string): string {
  switch (k) {
    case "meeting": return "ミーティング";
    case "leave": return "休み・私用";
    case "training": return "研修";
    default: return "予定";
  }
}

async function executeCreateReminder(
  args: { title?: string; message?: string; fire_in_minutes?: number; fire_at_iso?: string },
  ctx: { clinicId: string; userId: string | null; userEmail: string | null },
): Promise<{ ok: boolean; fire_at?: string; error?: string }> {
  const title = (args.title ?? "").trim();
  if (!title) return { ok: false, error: "タイトルが指定されていません" };

  let fireAt: Date | null = null;
  if (typeof args.fire_in_minutes === "number" && args.fire_in_minutes > 0) {
    if (args.fire_in_minutes > 10080) return { ok: false, error: "1週間を超える未来は指定できません" };
    fireAt = new Date(Date.now() + args.fire_in_minutes * 60_000);
  } else if (args.fire_at_iso) {
    const d = new Date(args.fire_at_iso);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "fire_at_iso が不正な形式です" };
    fireAt = d;
  } else {
    return { ok: false, error: "fire_in_minutes または fire_at_iso が必要です" };
  }
  if (fireAt.getTime() < Date.now() - 30_000) {
    return { ok: false, error: "発火時刻が過去です。未来の時刻を指定してください" };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, error: "Supabase env missing" };
  const db = createAdminClient(url, key, { auth: { persistSession: false } });
  const { error } = await db.from("reminders").insert({
    clinic_id: ctx.clinicId,
    created_by: ctx.userId,
    created_by_email: ctx.userEmail,
    title,
    message: args.message?.trim() || null,
    fire_at: fireAt.toISOString(),
    status: "pending",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, fire_at: fireAt.toISOString() };
}

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
4. 一般的な接骨院経営の知見

## リマインダー登録機能（重要）
ぼーるくんから「30分後に〜」「19時に〜」「仕事終わりに〜」「明日9時に〜」のような時刻を含む依頼があったら、迷わず create_reminder tool を使ってリマインダーを登録してください。

- 「30分後に水素吸入待ちの患者さん声かけて」→ fire_in_minutes=30, title="水素吸入待ちの患者さんに声かけ" で登録
- 「19時にミーティング忘れないように教えて」→ fire_at_iso=今日の19:00 (JST), title="ミーティング" で登録
- 「仕事終わりにXXXお願い」→ ぼーるくんに「何時に教えればいい？」と聞いて確認してから登録
- 過去時刻になりそうな場合は確認する（例：今が20時なのに「19時に」と言われた場合 → 明日の19時のことか確認）
- 登録できたら「リマインダーを登録しました。○月○日 ○:○○ に画面で音つきポップアップでお知らせします」のように、設定した時刻を必ずユーザーに復唱してください
- 「リマインダーお願い」だけで時刻が曖昧な場合は具体的な時刻を確認してください

## 予約ブロック登録機能（スタッフ予定）
ぼーるくんやスタッフから「○曜日にミーティングが入った」「来週木曜は休み」「明日午後は研修」のような、特定スタッフの不在情報があったら、create_staff_override tool で予約ブロックを登録できます。ただし**勝手に登録せず、まず必ず「○月○日の○時〜○時、○○先生をミーティングで予約ブロックしますね？」と確認**してから実行してください。

- 「金曜の14時から16時、業者と打ち合わせ」→ 確認後 create_staff_override(staff_name="藤川", date=今週金曜, start_time="14:00", end_time="16:00", kind="meeting", note="業者打ち合わせ")
- 「来週月曜、森川先生休み」→ 確認後 staff_name="森川", date=来週月曜, kind="leave", start_time/end_time 省略（終日扱い）
- 「明日午後は研修」→ start_time="13:00", end_time="18:00", kind="training"
- スタッフ名・曜日・時間帯のいずれかが曖昧なら必ず聞き返す
- 登録できたら「○月○日 ○:○○〜○:○○ を○○先生のミーティングで予約ブロックしました」と復唱
- 一覧管理は /admin/settings/staff-schedule からも可能と案内してよい`;
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

    // 認証ユーザーの clinic_id と role を動的に取得（未ログイン時はフォールバック）
    const { data: { user } } = await supabase.auth.getUser();
    const userClinicInfo = await (async () => {
      if (!user) return { clinicId: process.env.NEXT_PUBLIC_CLINIC_ID ?? "00000000-0000-0000-0000-000000000001", role: null as string | null };
      const { data } = await supabase
        .from("clinic_users")
        .select("clinic_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      return {
        clinicId: data?.clinic_id ?? (process.env.NEXT_PUBLIC_CLINIC_ID ?? "00000000-0000-0000-0000-000000000001"),
        role: (data?.role as string | undefined) ?? null,
      };
    })();
    const DEFAULT_CLINIC_ID = userClinicInfo.clinicId;
    const userRole = userClinicInfo.role;

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

    const nowJstString = todayJST.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    const nowIsoJst = new Date().toISOString();

    const systemReminderNote = `\n\n## 本日の予約・配信状況\n- 本日の予約件数: ${todayApptCount ?? 0}件\n- ${autoRemindCtx}\n\n## 現在時刻\n- 日本時間: ${nowJstString}\n- ISO 8601: ${nowIsoJst}\n（リマインダー登録時の時刻計算はこれを基準にする）`;
    const { data: history } = await supabase
      .from("ai_chat_messages")
      .select("role, content")
      .eq("clinic_id", DEFAULT_CLINIC_ID)
      .order("created_at", { ascending: false })
      .limit(20);

    const chatHistory = (history || []).reverse();

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      tools: [{ functionDeclarations: [REMINDER_TOOL, STAFF_OVERRIDE_TOOL] }],
    });

    // Use business context from client if provided
    const businessContext = clientContext || "";
    const contextMessage = businessContext
      ? `\u300c\u6700\u65b0\u306e\u30d3\u30b8\u30cd\u30b9\u30c7\u30fc\u30bf\uff08\u30ea\u30a2\u30eb\u30bf\u30a4\u30e0\uff09\u300d\n${businessContext}`
      : "";

    // Build conversation parts (Gemini \u5f62\u5f0f)
    type GeminiPart = { text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: Record<string, unknown> } };
    type GeminiTurn = { role: string; parts: GeminiPart[] };
    const contents: GeminiTurn[] = [];

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

    // \u6700\u5927 3 \u56de\u307e\u3067 function call \u30eb\u30fc\u30d7\uff08\u7121\u9650\u30eb\u30fc\u30d7\u9632\u6b62\uff09
    let aiResponse = "";
    let reminderCreated: { fire_at?: string } | null = null;
    for (let iteration = 0; iteration < 3; iteration++) {
      const result = await model.generateContent({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contents: contents as any,
        systemInstruction: SYSTEM_PROMPT + systemReminderNote,
      });
      const candidate = result.response.candidates?.[0];
      const parts = (candidate?.content?.parts ?? []) as GeminiPart[];
      const fcPart = parts.find((p) => p.functionCall);

      if (fcPart?.functionCall?.name === "create_reminder") {
        // \u30e2\u30c7\u30eb\u306e functionCall \u3092\u4f1a\u8a71\u5c65\u6b74\u306b\u7a4d\u3080
        contents.push({ role: "model", parts });

        const fnArgs = (fcPart.functionCall.args ?? {}) as {
          title?: string;
          message?: string;
          fire_in_minutes?: number;
          fire_at_iso?: string;
        };
        const exec = await executeCreateReminder(fnArgs, {
          clinicId: DEFAULT_CLINIC_ID,
          userId: user?.id ?? null,
          userEmail: user?.email ?? null,
        });
        if (exec.ok && exec.fire_at) reminderCreated = { fire_at: exec.fire_at };

        // function response \u3092\u8fd4\u3057\u3066\u7d9a\u3051\u3066\u751f\u6210\u3055\u305b\u308b
        contents.push({
          role: "function",
          parts: [
            {
              functionResponse: {
                name: "create_reminder",
                response: exec as unknown as Record<string, unknown>,
              },
            },
          ],
        });
        continue;
      }

      if (fcPart?.functionCall?.name === "create_staff_override") {
        contents.push({ role: "model", parts });
        const fnArgs = (fcPart.functionCall.args ?? {}) as {
          staff_name?: string;
          date?: string;
          start_time?: string;
          end_time?: string;
          kind?: string;
          note?: string;
        };
        const exec = await executeCreateStaffOverride(fnArgs, {
          clinicId: DEFAULT_CLINIC_ID,
          userId: user?.id ?? null,
          userEmail: user?.email ?? null,
          role: userRole,
        });
        contents.push({
          role: "function",
          parts: [
            {
              functionResponse: {
                name: "create_staff_override",
                response: exec as unknown as Record<string, unknown>,
              },
            },
          ],
        });
        continue;
      }

      // \u901a\u5e38\u30c6\u30ad\u30b9\u30c8\u5fdc\u7b54
      aiResponse = result.response.text() ?? "";
      break;
    }

    if (!aiResponse) {
      aiResponse = reminderCreated
        ? `\u30ea\u30de\u30a4\u30f3\u30c0\u30fc\u3092\u767b\u9332\u3057\u307e\u3057\u305f\u3002${new Date(reminderCreated.fire_at!).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} \u306b\u753b\u9762\u3067\u97f3\u3064\u304d\u30dd\u30c3\u30d7\u30a2\u30c3\u30d7\u3067\u304a\u77e5\u3089\u305b\u3057\u307e\u3059\u3002`
        : "\u7533\u3057\u8a33\u3042\u308a\u307e\u305b\u3093\u3001\u5fdc\u7b54\u3092\u751f\u6210\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u3082\u3046\u4e00\u5ea6\u304a\u9858\u3044\u3057\u307e\u3059\u3002";
    }

    // Save both messages to DB
    await supabase.from("ai_chat_messages").insert([
      { role: "user", content: message, clinic_id: DEFAULT_CLINIC_ID },
      { role: "assistant", content: aiResponse, clinic_id: DEFAULT_CLINIC_ID },
    ]);

    return NextResponse.json({ response: aiResponse, reminderCreated });
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
