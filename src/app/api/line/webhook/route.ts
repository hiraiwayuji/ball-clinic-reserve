import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as line from "@line/bot-sdk";

const channelSecret = process.env.LINE_CHANNEL_SECRET || "";
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const client = new line.messagingApi.MessagingApiClient({ channelAccessToken });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
// webhookはサーバーサイドのみで動くため、必ずservice_roleキーを使用してRLSをバイパス
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

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
      const lineUserId: string = event.source?.userId || "";

      console.log("\n==========================================");
      console.log("📢 LINE Webhook Received User ID:");
      console.log(`🆔 ${lineUserId}`);
      console.log("==========================================\n");

      // テキストメッセージにのみ反応
      if (event.type !== "message" || event.message?.type !== "text") continue;

      let userMessage: string = event.message.text.trim();
      const replyToken: string = event.replyToken;

      // 電話番号下4桁による紐づけ（アンケート完了後フロー）
      if (/^\d{4}$/.test(userMessage)) {
        const sb = getSupabase();
        if (sb) {
          // 既に同じLINEで紐づけ済みか確認
          const { data: alreadyLinked } = await sb.from("customers").select("id, name").eq("line_user_id", lineUserId).maybeSingle();
          if (alreadyLinked) {
            await replyMessage(replyToken, [{ type: "text", text: `${alreadyLinked.name}さんはすでに紐づけ済みです 😊` }]);
            continue;
          }

          // 電話番号末尾4桁で照合（ハイフンあり・なし・国際形式すべて対応）
          // 未紐づけ優先、なければ紐づけ済みも候補にする
          const { data: allMatches } = await sb
            .from("customers")
            .select("id, name, phone, line_user_id")
            .or(`phone.like.%${userMessage},phone.like.%-${userMessage}`);

          // 未紐づけのみに絞る
          const unlinked = (allMatches || []).filter(c => !c.line_user_id);

          if (unlinked.length === 1) {
            // 1件一致 → 紐づけ
            const { error: updateErr } = await sb.from("customers").update({ line_user_id: lineUserId }).eq("id", unlinked[0].id);
            if (updateErr) {
              console.error("LINE link update error:", updateErr);
              await replyMessage(replyToken, [{ type: "text", text: "システムエラーが発生しました。受付スタッフにお申し付けください。" }]);
            } else {
              await replyMessage(replyToken, [{ type: "text", text: `${unlinked[0].name}さん、紐づけが完了しました！✅\n予約リマインダーや誕生月クーポンをLINEでお届けします 🎉` }]);
            }
          } else if (unlinked.length > 1) {
            // 複数一致 → 下6桁で再試行を促す
            await replyMessage(replyToken, [{ type: "text", text: "同じ末尾の番号が複数見つかりました。\n下4桁ではなく下6桁を送ってもう一度お試しください。\n解決しない場合は受付スタッフにお申し付けください。" }]);
          } else if ((allMatches || []).length === 1) {
            // 既に別LINEで紐づけ済み → 上書き
            const existing = allMatches![0];
            const { error: updateErr } = await sb.from("customers").update({ line_user_id: lineUserId }).eq("id", existing.id);
            if (updateErr) {
              console.error("LINE link overwrite error:", updateErr);
              await replyMessage(replyToken, [{ type: "text", text: "システムエラーが発生しました。受付スタッフにお申し付けください。" }]);
            } else {
              await replyMessage(replyToken, [{ type: "text", text: `${existing.name}さん、LINEアカウントを更新しました！✅` }]);
            }
          } else {
            // 見つからない
            console.log(`4桁照合失敗: message=${userMessage}, matches=${JSON.stringify(allMatches)}`);
            await replyMessage(replyToken, [{ type: "text", text: "電話番号が見つかりませんでした。\n・下4桁が正しいかご確認ください\n・ハイフンなしの数字4桁のみ送ってください\n・ご不明な場合は受付スタッフまで 😊" }]);
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
            }]);
            continue;
          }
        }
        await replyMessage(replyToken, [{
          type: "text",
          text: "ご登録ありがとうございます！\n予約後に発行された「予約番号（英数字8文字）」を送信してください（そのまま送信、または『予約番号:●●●』のように送信してください）。\n\n紐づけ完了後は、予約リマインダーなどをお送りします 🏥",
        }]);
        continue;
      }

      // 予約番号の形式チェック（8文字英数字以外は担当者対応へ）
      if (!RESERVATION_NUMBER_REGEX.test(userMessage)) {
        await replyMessage(replyToken, [{
          type: "text",
          text: "メッセージありがとうございます。\n担当者が確認次第、ご返信いたします。しばらくお待ちください。\n\n予約内容の確認には、予約完了画面の英数字8文字の予約番号をそのままお送りください。",
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
        .select(`id, start_time, status, is_first_visit, customer_id, customers ( id, name, phone, line_user_id )`)
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

      // LINE User ID を customer_id で直接紐づけ（電話番号照合より確実）
      let linkMessage = "";
      if (lineUserId && apt.customer_id) {
        const sb = getSupabase();
        if (sb) {
          if (customer?.line_user_id && customer.line_user_id !== lineUserId) {
            // 別のLINEアカウントが既に紐づいている場合は上書き
            await sb.from("customers").update({ line_user_id: lineUserId }).eq("id", apt.customer_id);
            linkMessage = "\n\n✅ LINEアカウントを紐づけました。次回から予約リマインダーをお送りします。";
          } else if (!customer?.line_user_id) {
            await sb.from("customers").update({ line_user_id: lineUserId }).eq("id", apt.customer_id);
            linkMessage = "\n\n✅ LINEアカウントを紐づけました。次回から予約リマインダーをお送りします。";
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
      }]);
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("LINE Webhook error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}