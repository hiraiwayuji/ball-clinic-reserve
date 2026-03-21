import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as line from "@line/bot-sdk";

const channelSecret = process.env.LINE_CHANNEL_SECRET || "";
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const client = new line.messagingApi.MessagingApiClient({ channelAccessToken });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
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

async function replyMessage(replyToken: string, messages: any[]) {
  if (!channelAccessToken) {
    console.warn("Missing LINE_CHANNEL_ACCESS_TOKEN for reply");
    return;
  }
  try {
    await client.replyMessage({ replyToken, messages });
  } catch (error) {
    console.error("Error replying message via LINE SDK:", error);
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

    // Webhook疎通確認（eventsが空）
    if (!body || !body.events || body.events.length === 0) {
      return NextResponse.json({ status: "ok" });
    }

    // 署名検証前にUserIDを記録（デバッグ用）
    for (const ev of body.events) {
      const uid = ev.source?.userId || "unknown";
      const type = ev.type || "unknown";
      const msg = ev.message?.type === 'text' ? ev.message.text : 'non-text';
      console.log(`LOGGING: UserID=${uid}, Type=${type}, Msg=${msg}`);
      await saveDebugLog(uid, type, msg, rawBody);
    }

    // 署名検証
    if (!verifySignature(rawBody, signature)) {
      console.error("Invalid signature from LINE");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    for (const event of body.events) {
      const lineUserId: string = event.source?.userId || "";

      console.log("\n==========================================");
      console.log("📢 LINE Webhook Received User ID:");
      console.log(`🆔 ${lineUserId}`);
      console.log("==========================================\n");

      // テキストメッセージにのみ反応
      if (event.type !== "message" || event.message?.type !== "text") continue;

      let userMessage: string = event.message.text.trim();
      const prefixOptions = ["予約番号:", "予約番号："];
      for (const prefix of prefixOptions) {
        if (userMessage.startsWith(prefix)) {
          userMessage = userMessage.slice(prefix.length).trim();
          break;
        }
      }
      userMessage = userMessage.toUpperCase();

      const replyToken: string = event.replyToken;

      // フォローイベント（友だち追加時の挨拶）
      if (event.type === "follow") {
        await replyMessage(replyToken, [{
          type: "text",
          text: "ご登録ありがとうございます！\n予約後に発行された「予約番号（英数字8文字）」を送信してください（そのまま送信、または『予約番号:●●●』のように送信してください）。予約内容の確認をお送りします。",
        }]);
        continue;
      }

      // 予約番号の形式チェック
      if (!RESERVATION_NUMBER_REGEX.test(userMessage)) {
        await replyMessage(replyToken, [{
          type: "text",
          text: `「${event.message.text.trim()}」から予約番号を認識できませんでした。\n予約完了画面に表示された英数字8文字の予約番号を送信してください。\n例: 予約番号:ABC12345 または ABC12345`,
        }]);
        continue;
      }

      // DBで予約番号を照合
      const supabase = getSupabase();
      if (!supabase) {
        await replyMessage(replyToken, [{ type: "text", text: "システムエラーが発生しました。しばらく後にお試しください。" }]);
        continue;
      }

      const { data: appointments, error } = await supabase
        .from("appointments")
        .select(`id, start_time, status, is_first_visit, customers ( name, phone )`)
        .in("status", ["pending", "confirmed", "waiting"])
        .order("created_at", { ascending: false });

      if (error || !appointments) {
        console.error("Supabase fetch error:", error);
        await replyMessage(replyToken, [{ type: "text", text: "データベース通信エラーが発生しました。" }]);
        continue;
      }

      const targetIdPrefix = userMessage.toLowerCase();
      const apt = appointments.find(a => a.id.startsWith(targetIdPrefix));

      if (!apt) {
        await replyMessage(replyToken, [{
          type: "text",
          text: `予約番号「${userMessage}」に該当する予約が見つかりませんでした。\n番号をご確認のうえ、再度送信してください。\n※過去の予約やキャンセル済みの予約は照会できません。\n\n[システム情報: 抽出ID=${targetIdPrefix}, 検索対象=${appointments.length}件]`,
        }]);
        continue;
      }

      const customer = apt.customers as { name?: string; phone?: string } | null;
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

      // LINE User ID をDBに保存
      if (lineUserId && customer) {
        const sb = getSupabase();
        if (sb) {
          await sb.from("customers").update({ line_user_id: lineUserId }).ilike("phone", customer.phone || "");
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
        ].join("\n"),
      }]);
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("LINE Webhook error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}