import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as line from "@line/bot-sdk";
import { randomBytes } from "crypto";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";
import { linkLineToCustomer } from "@/lib/line-links";

function generateReserveToken(): string {
  return randomBytes(16).toString("hex");
}

function getReserveBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

const channelSecret = process.env.LINE_CHANNEL_SECRET || "";
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const client = new line.messagingApi.MessagingApiClient({ channelAccessToken });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
// webhookはサーバーサイドのみで動くため、必ずservice_roleキーを使用してRLSをバイパス
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const DEFAULT_CLINIC_ID = PUBLIC_CLINIC_ID;

function getSupabase() {
  if (!supabaseUrl) return null;
  const key = supabaseServiceKey || supabaseAnonKey;
  if (!key) return null;
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false }
  });
}

// Supabaseにデバッグログを保存（fsの代替）
async function saveDebugLog(userId: string, eventType: string, message: string | null, rawBody: string) {
  try {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("line_debug_logs").insert([{
      user_id: userId || "unknown",
      event_type: eventType || "unknown",
      message: message,
      raw_body: rawBody.slice(0, 500)
    }]);
  } catch (e) {
    console.error("Failed to save debug log:", e);
  }
}

function verifySignature(body: string, signature: string): boolean {
  if (!channelSecret) {
    console.warn("Missing LINE_CHANNEL_SECRET in signature verification");
    return false;
  }
  return line.validateSignature(body, channelSecret, signature);
}

async function replyMessage(replyToken: string, messages: any[], lineUserId: string = "unknown") {
  // PII を残さないため、raw_body には返信本文ではなく診断情報のみを保存する
  const messageTypes = messages.map((m) => m?.type ?? "unknown").join(",");

  if (!channelAccessToken) {
    console.warn("Missing LINE_CHANNEL_ACCESS_TOKEN for reply");
    await saveDebugLog(
      lineUserId,
      "reply_error",
      "LINE_CHANNEL_ACCESS_TOKEN が未設定です",
      JSON.stringify({ status: "no_token", lineUserId, messageTypes })
    );
    return;
  }
  try {
    await client.replyMessage({ replyToken, messages });
  } catch (error: any) {
    // @line/bot-sdk v10 の HTTPFetchError: status / statusText / headers / body
    // 旧 HTTPError 形状の statusCode にも対応
    const status = error?.statusCode ?? error?.status ?? "unknown";
    const errorName = error?.name ?? "Error";
    const detail = error?.body
      ? typeof error.body === "string"
        ? error.body
        : JSON.stringify(error.body)
      : error?.message ?? String(error);
    console.error(`Error replying message via LINE SDK (status=${status}):`, detail);
    await saveDebugLog(
      lineUserId,
      "reply_error",
      `status=${status} ${detail}`.slice(0, 500),
      JSON.stringify({ status, errorName, lineUserId, messageTypes })
    );
  }
}

const RESERVATION_NUMBER_REGEX = /^[A-Z0-9]{8}$/;

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-line-signature") || "";

    // ヘッダー情報をログ
    const headerLog = `DEBUG: signature=${signature}, host=${req.headers.get("host")}, bodyLength=${rawBody.length}`;
    console.log(`WEBHOOK RECEIVED: ${headerLog}`);
    console.log(`BODY: ${rawBody}`);

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      console.error("Failed to parse JSON body");
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // 署名検証（未検証データはDBに保存しない）
    if (!verifySignature(rawBody, signature)) {
      console.error("Invalid signature from LINE");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Webhook疎通確認（eventsが空）
    if (!body || !body.events || body.events.length === 0) {
      return NextResponse.json({ status: "ok" });
    }

    // 署名検証済みのイベントのみログ保存
    for (const ev of body.events) {
      const uid = ev.source?.userId || "unknown";
      const type = ev.type || "unknown";
      const msg = ev.message?.type === 'text' ? ev.message.text : 'non-text';
      console.log(`LOGGING: UserID=${uid}, Type=${type}, Msg=${msg}`);
      await saveDebugLog(uid, type, msg, rawBody);
    }

    for (const event of body.events) {
      // event.source.userId が欠けるイベント（unfollow / leave / beacon 等）でも
      // reply_error.user_id が空にならないよう "unknown" にフォールバック
      const lineUserId: string = event.source?.userId || "unknown";

      console.log("\n==========================================");
      console.log("📢 LINE Webhook Received User ID:");
      console.log(`🆔 ${lineUserId}`);
      console.log("==========================================\n");

      // テキストメッセージにのみ反応
      if (event.type !== "message" || event.message?.type !== "text") continue;

      let userMessage: string = event.message.text.trim();
      const replyToken: string = event.replyToken;

      // 電話番号下4-6桁による紐づけ
      // パターン:
      //   "1234"           → 単純4桁（従来）
      //   "家族追加 1234"   → 家族として明示的に追加（フラグ ON 時）
      const familyAddMatch = userMessage.match(/^家族追加[\s　]*(\d{4,6})$/);
      const plainDigitsMatch = /^\d{4,6}$/.test(userMessage) ? userMessage : null;
      const phoneSuffix = familyAddMatch ? familyAddMatch[1] : plainDigitsMatch;

      if (phoneSuffix) {
        const sb = getSupabase();
        if (sb) {
          // 既に同じLINEで紐づいている customer 一覧
          const { data: alreadyLinks } = await sb
            .from("customer_line_links")
            .select("customer_id")
            .eq("line_user_id", lineUserId)
            .eq("clinic_id", DEFAULT_CLINIC_ID);
          const alreadyLinkedIds = new Set((alreadyLinks ?? []).map((r: any) => r.customer_id));

          // 電話番号末尾で照合（ハイフンあり・なし両対応）
          const { data: allMatches } = await sb
            .from("customers")
            .select("id, name, phone, line_user_id")
            .eq("clinic_id", DEFAULT_CLINIC_ID)
            .or(`phone.like.%${phoneSuffix},phone.like.%-${phoneSuffix}`);

          const matches = allMatches ?? [];
          // 既にこの LINE に紐付いている customer は候補から除外
          const candidates = matches.filter((c) => !alreadyLinkedIds.has(c.id));

          if (candidates.length === 1) {
            const target = candidates[0];
            const isFamilyAddition = alreadyLinkedIds.size > 0 || Boolean(familyAddMatch);
            const result = await linkLineToCustomer(
              lineUserId,
              target.id,
              DEFAULT_CLINIC_ID,
              { linkedVia: familyAddMatch ? "family_add" : "phone4" },
              sb,
            );
            if (!result.ok) {
              console.error("LINE link error:", result.error);
              await replyMessage(replyToken, [{ type: "text", text: "システムエラーが発生しました。受付スタッフにお申し付けください。" }], lineUserId);
            } else if (isFamilyAddition) {
              await replyMessage(replyToken, [{ type: "text", text: `${target.name}さんを家族として追加しました！👨‍👩‍👧\n予約時に「誰の予約か」を選べるようになります。` }], lineUserId);
            } else {
              await replyMessage(replyToken, [{ type: "text", text: `${target.name}さん、紐づけが完了しました！✅\n予約リマインダーや誕生月クーポンをLINEでお届けします 🎉\n\n※ ご家族の予約も同じLINEで管理できます。「家族追加 1234」（電話番号下4桁）で追加可能です。` }], lineUserId);
            }
          } else if (candidates.length > 1) {
            await replyMessage(replyToken, [{ type: "text", text: "同じ末尾の番号が複数見つかりました。\n下4桁ではなく下6桁を送ってもう一度お試しください。\n解決しない場合は受付スタッフにお申し付けください。" }], lineUserId);
          } else if (matches.length > 0 && alreadyLinkedIds.size > 0) {
            // 候補は全て既に同じLINEに紐付き済み
            await replyMessage(replyToken, [{ type: "text", text: "ご指定の方は既に紐付け済みです 😊" }], lineUserId);
          } else {
            console.log(`照合失敗: message=${userMessage}, matches=${JSON.stringify(allMatches)}`);
            await replyMessage(replyToken, [{ type: "text", text: "電話番号が見つかりませんでした。\n・下4桁が正しいかご確認ください\n・ハイフンなしの数字4桁のみ送ってください\n・ご不明な場合は受付スタッフまで 😊" }], lineUserId);
          }
        }
        continue;
      }

      // リッチメニュー or テキスト「予約する」 → 短期トークンを発行して /reserve への URL を返信
      const reserveKeywords = ["予約", "予約する", "ご予約", "ご予約する", "予約したい"];
      if (reserveKeywords.includes(userMessage)) {
        const sb = getSupabase();
        if (sb) {
          const token = generateReserveToken();
          const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
          const { error: tokenErr } = await sb.from("line_reserve_tokens").insert({
            token,
            line_user_id: lineUserId,
            clinic_id: DEFAULT_CLINIC_ID,
            expires_at: expiresAt,
          });
          if (tokenErr) {
            console.error("Reserve token insert error:", tokenErr);
            await replyMessage(replyToken, [{ type: "text", text: "予約URLの発行に失敗しました。お手数ですが受付スタッフまでお問い合わせください。" }], lineUserId);
          } else {
            const baseUrl = getReserveBaseUrl();
            const url = `${baseUrl}/reserve?lt=${token}`;
            await replyMessage(replyToken, [{
              type: "text",
              text: `ご予約はこちらからどうぞ 🏥\n${url}\n\n※ このリンクは30分間有効です。`,
            }], lineUserId);
          }
        }
        continue;
      }

      const prefixOptions = ["予約番号:", "予約番号："];
      for (const prefix of prefixOptions) {
        if (userMessage.startsWith(prefix)) {
          userMessage = userMessage.slice(prefix.length).trim();
          break;
        }
      }
      userMessage = userMessage.toUpperCase();

      // フォローイベント（友だち追加時の挨拶）
      if (event.type === "follow") {
        // 既に紐づけ済みか確認
        const sb = getSupabase();
        if (sb) {
          const { data: existing } = await sb.from("customers").select("id, name").eq("line_user_id", lineUserId).maybeSingle();
          if (existing) {
            await replyMessage(replyToken, [{
              type: "text",
              text: `${existing.name}さん、おかえりなさい！\nご予約・お問い合わせはいつでもどうぞ 😊`,
            }], lineUserId);
            continue;
          }
        }
        await replyMessage(replyToken, [{
          type: "text",
          text: "ご登録ありがとうございます！\n予約後に発行された「予約番号（英数字8文字）」を送信してください（そのまま送信、または『予約番号:●●●』のように送信してください）。\n\n紐づけ完了後は、予約リマインダーなどをお送りします 🏥",
        }], lineUserId);
        continue;
      }

      // 予約番号の形式チェック（8文字英数字以外は担当者対応へ）
      if (!RESERVATION_NUMBER_REGEX.test(userMessage)) {
        await replyMessage(replyToken, [{
          type: "text",
          text: "メッセージありがとうございます。\n担当者が確認次第、ご返信いたします。しばらくお待ちください。\n\n予約内容の確認には、予約完了画面の英数字8文字の予約番号をそのままお送りください。",
        }], lineUserId);
        continue;
      }

      // DBで予約番号を照合
      const supabase = getSupabase();
      if (!supabase) {
        await replyMessage(replyToken, [{ type: "text", text: "システムエラーが発生しました。しばらく後にお試しください。" }], lineUserId);
        continue;
      }

      const { data: appointments, error } = await supabase
        .from("appointments")
        .select(`id, start_time, status, is_first_visit, customer_id, customers ( id, name, phone, line_user_id )`)
        .in("status", ["pending", "confirmed", "waiting"])
        .order("created_at", { ascending: false });

      if (error || !appointments) {
        console.error("Supabase fetch error:", error);
        await replyMessage(replyToken, [{ type: "text", text: "データベース通信エラーが発生しました。" }], lineUserId);
        continue;
      }

      const targetIdPrefix = userMessage.toLowerCase();
      const apt = appointments.find(a => a.id.startsWith(targetIdPrefix));

      if (!apt) {
        await replyMessage(replyToken, [{
          type: "text",
          text: `予約番号「${userMessage}」に該当する予約が見つかりませんでした。\n番号をご確認のうえ、再度送信してください。\n※過去の予約やキャンセル済みの予約は照会できません。\n\n[システム情報: 抽出ID=${targetIdPrefix}, 検索対象=${appointments.length}件]`,
        }], lineUserId);
        continue;
      }

      const customer = apt.customers as { id?: string; name?: string; phone?: string; line_user_id?: string } | null;
      const startTime = new Date(apt.start_time);
      const dateStr = startTime.toLocaleDateString("ja-JP", {
        year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo",
      });
      const timeStr = startTime.toLocaleTimeString("ja-JP", {
        hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo",
      });

      const statusLabel =
        apt.status === "confirmed" ? "✅ 予約確定" :
        apt.status === "waiting"   ? "🕐 キャンセル待ち" : "⏳ 確認待ち";
      const visitLabel = apt.is_first_visit ? "初診" : "再診";

      // LINE User ID を customer_id で紐づけ（家族として追加 or 主紐付け）
      let linkMessage = "";
      if (lineUserId && apt.customer_id) {
        const sb = getSupabase();
        if (sb) {
          const conflictsWithOther = customer?.line_user_id && customer.line_user_id !== lineUserId;
          const result = await linkLineToCustomer(
            lineUserId,
            apt.customer_id,
            DEFAULT_CLINIC_ID,
            { linkedVia: "reservation_no" },
            sb,
          );
          if (result.ok) {
            if (result.created) {
              if (conflictsWithOther) {
                linkMessage = "\n\n✅ ご家族として LINE を追加しました。次回から予約リマインダーをお送りします。";
              } else {
                linkMessage = "\n\n✅ LINEアカウントを紐づけました。次回から予約リマインダーをお送りします。";
              }
            }
          } else {
            console.error("LINE link by reservation error:", result.error);
          }
        }
      }

      await replyMessage(replyToken, [{
        type: "text",
        text: [
          `📋 予約番号「${userMessage}」の内容`,
          "─────────────",
          `👤 お名前: ${customer?.name || "不明"}`,
          `📅 日時: ${dateStr} ${timeStr}`,
          `🏥 受診: ${visitLabel}`,
          `📌 ステータス: ${statusLabel}`,
          "─────────────",
          apt.status === "waiting"
            ? "キャンセル待ちとして登録されています。空きが出た際にこちらよりご連絡いたします。"
            : "ご予約ありがとうございます。当日のご来院をお待ちしております 🙏",
        ].join("\n") + linkMessage,
      }], lineUserId);
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("LINE Webhook error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}