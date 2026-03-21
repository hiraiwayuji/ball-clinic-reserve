"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/app/actions/auth";
import { getClinicSettings } from "./settings";

async function getSupabase() {
  return await createClient();
}

/**
 * LINE Messaging API の短期アクセストークンを取得する (v2.1 OAuth)
 */
async function getLineAccessToken() {
  const settings = await getClinicSettings();
  const channelId = process.env.LINE_CHANNEL_ID || "2003288674";
  const channelSecret = settings?.line_channel_secret || process.env.LINE_CHANNEL_SECRET || "d3ed4c69e889450c22de1aac06d0b1d2";

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', channelId);
    params.append('client_secret', channelSecret);

    const res = await fetch('https://api.line.me/v2/oauth/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("Failed to get LINE access token:", err);
      return process.env.LINE_CHANNEL_ACCESS_TOKEN || null;
    }

    const data = await res.json();
    return data.access_token;
  } catch (err) {
    console.error("Error fetching LINE token:", err);
    return process.env.LINE_CHANNEL_ACCESS_TOKEN || null;
  }
}

/**
 * 1. 当日の予約リマインドを「送信」するモック処理
 */
export async function sendAppointmentReminders(testLineId: string | null = null) {
  await checkAdminAuth();
  
  // Use provided testLineId or fallback to environment variable
  const effectiveTestId = testLineId || process.env.TEST_LINE_USER_ID;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const supabase = await getSupabase();
  // 本日の予約を取得
  const { data: appointments, error } = await supabase
    .from("appointments")
    .select("*, customers(name, phone, line_user_id)")
    .gte("start_time", todayStart.toISOString())
    .lte("start_time", todayEnd.toISOString())
    .neq("status", "cancelled");

  if (error) {
    throw new Error("予約データの取得に失敗しました: " + error.message);
  }

  // 実際にはLINE Messaging APIを呼び出すが、今回はモックとして配列に結果を格納
  const sentTo = [];
  const debugLogs: string[] = [];
  
  for (const apt of appointments || []) {
    // 複数の顧客が紐づく仕様に備えて配列チェック
    const customer = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
    if (customer && customer.name) {
       // 時間のフォーマット
       const timeMatch = new Date(apt.start_time).toLocaleString("ja-JP", {timeZone: "Asia/Tokyo", hour: '2-digit', minute: '2-digit'});
       
       const messageText = `${customer.name}様\n\nこんにちは！ボール接骨院です。\n本日 ${timeMatch} から予約を頂いております。\nお気を付けてお越しください！`;
       
       debugLogs.push(`【宛先: ${customer.name}様】\n${messageText}`);
       
       console.log(`\n========== LINE送信シミュレーション ==========`);
       console.log(`宛先: ${customer.name} 様`);
       if (effectiveTestId) {
         console.log(`[TEST MODE] 送信先LINE ID: ${effectiveTestId} に上書き送信します。`);
       } else if (customer.line_user_id) {
         console.log(`送信先LINE ID: ${customer.line_user_id}`);
       } else {
         console.log(`(LINEが未連携のためスキップ扱い)`);
       }
       console.log(`[メッセージ内容]\n${messageText}`);
       console.log(`============================================\n`);
       
       sentTo.push(`${customer.name}様 (${timeMatch}〜)`);

       // --- 実際の送信処理 ---
       const settings = await getClinicSettings();
       const channelToken = settings?.line_channel_access_token || await getLineAccessToken();
       const targetId = effectiveTestId || customer.line_user_id;

       if (channelToken && targetId) {
         try {
           const response = await fetch('https://api.line.me/v2/bot/message/push', {
             method: 'POST',
             headers: {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${channelToken}`
             },
             body: JSON.stringify({
               to: targetId,
               messages: [{ type: 'text', text: messageText }]
             })
           });
           if (!response.ok) {
             const errData = await response.json();
             console.error(`LINE API Error (${customer.name}):`, errData);
             debugLogs.push(`⚠️ LINE送信失敗 (${customer.name}): ${JSON.stringify(errData)}`);
           } else {
             console.log(`✅ LINE送信成功: ${customer.name}`);
             debugLogs[debugLogs.length-1] += `\n(→ 実機送信: 成功)`;
           }
         } catch (err) {
           console.error(`LINE Fetch Error (${customer.name}):`, err);
           debugLogs.push(`⚠️ 通信エラー (${customer.name}): ${err}`);
         }
       } else {
         debugLogs[debugLogs.length-1] += `\n(→ シミュレーションのみ: API設定またはIDがありません)`;
       }
    }
  }

  if (sentTo.length === 0) {
    if (effectiveTestId) {
      const dummyMsg = `テストユーザー様\n\nこんにちは！ボール接骨院です。\n本日 12:00 から予約を頂いております。(テスト配信)`;
      debugLogs.push(`【テスト送信】\n${dummyMsg}`);
      
      const channelToken = await getLineAccessToken();
      if (channelToken && effectiveTestId) {
         try {
           const res = await fetch('https://api.line.me/v2/bot/message/push', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${channelToken}` },
             body: JSON.stringify({ to: effectiveTestId, messages: [{ type: 'text', text: dummyMsg }] })
           });
           if (res.ok) {
             debugLogs[debugLogs.length-1] += `\n(→ 実機テスト送信: 成功)`;
           } else {
             const errJson = await res.json();
             debugLogs[debugLogs.length-1] += `\n(→ 実機テスト送信失敗: ${JSON.stringify(errJson)})`;
           }
         } catch (e) {
           debugLogs[debugLogs.length-1] += `\n(→ 実機テスト送信エラー: ${e})`;
         }
      }
      
      console.log(`\n========== LINEテスト送信シミュレーション ==========`);
      console.log(`[TEST MODE] 宛先: テストユーザー 様`);
      console.log(`[送信先LINE ID] : ${effectiveTestId}`);
      console.log(`[メッセージ内容]\n${dummyMsg}`);
      console.log(`===================================================\n`);
      sentTo.push(`テストユーザー（ID: ${effectiveTestId.substring(0,6)}...）`);
    } else {
      sentTo.push("（予約がなかったため送信されていません）");
    }
  }

  return {
    success: true,
    count: sentTo.length,
    sentTo: sentTo,
    debugLogs: debugLogs
  };
}

/**
 * 2. 指定した誕生月の顧客にクーポンを「送信」するモック処理
 */
export async function sendBirthdayCoupons(month: number) {
  await checkAdminAuth();
  const supabase = await getSupabase();
  // 指定した誕生月のデータを取得
  const { data: customers, error } = await supabase
    .from("customers")
    .select("name, birth_month, line_user_id")
    .eq("birth_month", month);

  if (error) {
    throw new Error("顧客データの取得に失敗しました: " + error.message);
  }

  const sentTo = [];

  for (const customer of customers || []) {
    sentTo.push(customer.name);
  }

  // DBのデータがない場合のフォールバック（デモ表示用）
  if (sentTo.length === 0) {
    sentTo.push(`テスト患者A (${month}月生)`);
    sentTo.push(`テスト患者B (${month}月生)`);
    sentTo.push(`テスト患者C (${month}月生)`);
  }

  return {
    success: true,
    count: sentTo.length,
    sentTo: sentTo
  };
}

/**
 * 3. 毎月の10%抽選会を「実施」するモック処理
 */
export async function runMonthlyLottery() {
  await checkAdminAuth();
  const supabase = await getSupabase();
  // 全顧客の中の一部を対象とする（デモとして最大50件）
  const { data: customers, error } = await supabase
    .from("customers")
    .select("name, line_user_id")
    .limit(50);

  if (error) {
    throw new Error("顧客データの取得に失敗しました: " + error.message);
  }

  let baseCustomers = customers || [];

  // 顧客データが空の場合はダミーを30人生成する
  if (baseCustomers.length === 0) {
    for (let i = 1; i <= 30; i++) {
       baseCustomers.push({ name: `テスト患者${i}`, line_user_id: `dummy_${i}` });
    }
  }

  const totalCount = baseCustomers.length;
  const winners = [];

  // 各顧客に対して 10% (=0.1) の確率で当選判定
  for (const customer of baseCustomers) {
    const randomValue = Math.random(); // 0.0 ~ 1.0
    if (randomValue <= 0.10) {
       winners.push(customer.name);
       // LINEで「当たり」メッセージを送信する処理
    } else {
       // LINEで「はずれ」メッセージを送信する処理
    }
  }

  // 確率の問題で1人も当たらない場合を見栄え良くするため、強制的に1人だけは当てる
  if (winners.length === 0 && totalCount > 0) {
      winners.push(baseCustomers[0].name);
  }

  return {
    success: true,
    target: "全員",
    totalCount: totalCount,
    winnerCount: winners.length,
    winners: winners
  };
}

/**
 * 4. 初回アンケートを「送信」するモック処理
 */
export async function sendWelcomeQuestionnaire() {
  await checkAdminAuth();
  const supabase = await getSupabase();
  const { data: customers, error } = await supabase
    .from("customers")
    .select("name")
    .order("id", { ascending: false })
    .limit(5);

  if (error) {
    throw new Error("対象者の抽出に失敗しました: " + error.message);
  }

  const sentTo = [];
  for (const customer of customers || []) {
    sentTo.push(customer.name);
  }

  if (sentTo.length === 0) {
    sentTo.push("平井（テスト用ダミー）");
    sentTo.push("鈴木（テスト用ダミー）");
  }

  return {
    success: true,
    count: sentTo.length,
    sentTo: sentTo
  };
}
