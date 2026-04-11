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
  const channelId = process.env.LINE_CHANNEL_ID;
  const channelSecret = settings?.line_channel_secret || process.env.LINE_CHANNEL_SECRET;
  if (!channelId || !channelSecret) {
    console.error("LINE_CHANNEL_ID / LINE_CHANNEL_SECRET が設定されていません");
    return null;
  }

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
       const channelToken = settings?.line_channel_access_token || await getLineAccessToken() || process.env.LINE_CHANNEL_ACCESS_TOKEN;
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
      
      const channelToken = await getLineAccessToken() || process.env.LINE_CHANNEL_ACCESS_TOKEN;
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
 * 2. 指定した誕生月の顧客にクーポンを送信
 */
export async function sendBirthdayCoupons(month: number) {
  await checkAdminAuth();
  const supabase = await getSupabase();

  const { data: customers, error } = await supabase
    .from("customers")
    .select("name, birth_month, birth_date, line_user_id")
    .not("line_user_id", "is", null);

  if (error) throw new Error("顧客データの取得に失敗しました: " + error.message);

  // 指定した月が誕生月の顧客をフィルタリング
  const birthdayCustomers = (customers || []).filter(c => {
    if (c.birth_month === month) return true;
    if (c.birth_date) {
      const bDate = new Date(c.birth_date);
      return (bDate.getMonth() + 1) === month;
    }
    return false;
  });

  const channelToken = await getLineAccessToken() || process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const sentTo: string[] = [];
  const skipped: string[] = [];
  const debugLogs: string[] = [];

  for (const customer of birthdayCustomers) {
    if (!customer.line_user_id) { skipped.push(customer.name); continue; }

    const msg =
      `🎂 ${customer.name}様、お誕生月おめでとうございます！\n\n` +
      `いつもボール接骨院をご利用いただきありがとうございます😊\n\n` +
      `今月のお誕生月にちなんで\n` +
      `━━━━━━━━━━\n` +
      `　誕生月割引クーポン 💝\n` +
      `　　施術料金 500円OFF\n` +
      `━━━━━━━━━━\n` +
      `をプレゼントします！\n\n` +
      `有効期限：今月末まで\n` +
      `ご来院時にスタッフへこのメッセージをご提示ください📱\n\n` +
      `素敵な誕生月をお過ごしください🌸\nボール接骨院`;

    debugLogs.push(`【${customer.name}様】\n${msg}`);

    if (channelToken) {
      try {
        const res = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${channelToken}` },
          body: JSON.stringify({ to: customer.line_user_id, messages: [{ type: "text", text: msg }] }),
        });
        if (res.ok) {
          sentTo.push(customer.name);
          debugLogs[debugLogs.length - 1] += "\n(→ 送信: 成功)";
        } else {
          const err = await res.json();
          debugLogs[debugLogs.length - 1] += `\n(→ 送信失敗: ${JSON.stringify(err)})`;
        }
      } catch (e) {
        debugLogs[debugLogs.length - 1] += `\n(→ エラー: ${e})`;
      }
    } else {
      sentTo.push(customer.name);
      debugLogs[debugLogs.length - 1] += "\n(→ シミュレーションのみ)";
    }
  }

  return { success: true, count: sentTo.length, sentTo, skipped, debugLogs };
}

/**
 * マーケティング施策の対象者数統計を取得
 */
export async function getMarketingStats() {
  await checkAdminAuth();
  const supabase = await getSupabase();
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, gender, birth_month, birth_date, city_name, line_user_id");

  if (error) throw new Error("統計の取得に失敗しました");

  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  const stats = {
    total: customers.length,
    linkedLine: customers.filter(c => c.line_user_id).length,
    birthdayThisMonth: customers.filter(c => {
      if (!c.line_user_id) return false;
      if (c.birth_month === currentMonth) return true;
      if (c.birth_date) {
        return (new Date(c.birth_date).getMonth() + 1) === currentMonth;
      }
      return false;
    }).length,
    women: customers.filter(c => c.line_user_id && c.gender === "female").length,
    cityStats: {} as Record<string, number>,
  };

  // 市町村別の統計（LINE連携済みのみ）
  customers.forEach(c => {
    if (c.line_user_id && c.city_name) {
      stats.cityStats[c.city_name] = (stats.cityStats[c.city_name] || 0) + 1;
    }
  });

  return stats;
}

/**
 * セグメントを指定してキャンペーン送信
 */
export async function sendSegmentedCampaign(options: {
  gender?: string;
  city?: string;
  message: string;
}) {
  await checkAdminAuth();
  const supabase = await getSupabase();
  
  let query = supabase.from("customers").select("name, line_user_id");
  
  if (options.gender) query = query.eq("gender", options.gender);
  if (options.city) query = query.eq("city_name", options.city);
  
  const { data: customers, error } = await query.not("line_user_id", "is", null);
  if (error) throw new Error("対象者の取得に失敗しました");

  const channelToken = await getLineAccessToken() || process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const sentTo: string[] = [];
  const debugLogs: string[] = [];

  for (const customer of customers || []) {
    const msg = options.message.replace(/{name}/g, customer.name);
    debugLogs.push(`【${customer.name}様】\n${msg}`);

    if (channelToken) {
      try {
        const res = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${channelToken}` },
          body: JSON.stringify({ to: customer.line_user_id, messages: [{ type: "text", text: msg }] }),
        });
        if (res.ok) sentTo.push(customer.name);
      } catch (e) {
        console.error("LINE send error:", e);
      }
    } else {
      sentTo.push(customer.name);
    }
  }

  return { success: true, count: sentTo.length, sentTo, debugLogs };
}

/**
 * 2b. 女性限定キャンペーン送信
 */
export async function sendWomenOnlyCampaign(campaignMessage: string) {
  await checkAdminAuth();
  const supabase = await getSupabase();

  const { data: customers, error } = await supabase
    .from("customers")
    .select("name, gender, line_user_id")
    .eq("gender", "female")
    .not("line_user_id", "is", null);

  if (error) throw new Error("顧客データの取得に失敗しました: " + error.message);

  const channelToken = await getLineAccessToken() || process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const sentTo: string[] = [];
  const debugLogs: string[] = [];

  for (const customer of customers || []) {
    if (!customer.line_user_id) continue;

    const msg = campaignMessage
      ? campaignMessage.replace("{name}", customer.name)
      : `${customer.name}様\n\n女性限定キャンペーンのお知らせです！\n\nボール接骨院では女性患者様限定の特別キャンペーンを実施中です✨\n\n詳しくはスタッフまでお気軽にお問い合わせください😊\nボール接骨院`;

    debugLogs.push(`【${customer.name}様】\n${msg}`);

    if (channelToken) {
      try {
        const res = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${channelToken}` },
          body: JSON.stringify({ to: customer.line_user_id, messages: [{ type: "text", text: msg }] }),
        });
        if (res.ok) {
          sentTo.push(customer.name);
          debugLogs[debugLogs.length - 1] += "\n(→ 送信: 成功)";
        } else {
          const err = await res.json();
          debugLogs[debugLogs.length - 1] += `\n(→ 送信失敗: ${JSON.stringify(err)})`;
        }
      } catch (e) {
        debugLogs[debugLogs.length - 1] += `\n(→ エラー: ${e})`;
      }
    } else {
      sentTo.push(customer.name);
      debugLogs[debugLogs.length - 1] += "\n(→ シミュレーションのみ)";
    }
  }

  return { success: true, count: sentTo.length, sentTo, debugLogs };
}

/**
 * 3. 来院済み・LINE連携済み患者を対象にした抽選会
 *    当選者にはLINEでクーポンメッセージを送信する
 */
export async function runMonthlyLottery(testLineId: string | null = null) {
  await checkAdminAuth();
  const effectiveTestId = testLineId || process.env.TEST_LINE_USER_ID || null;

  const channelToken = await getLineAccessToken() || process.env.LINE_CHANNEL_ACCESS_TOKEN;

  // テストモード：実際の患者データを使わず、指定IDに当選メッセージを1通送信して返す
  if (effectiveTestId) {
    const winMsg =
      `🎉【テスト送信】やったー！当たり！！\n\n` +
      `いつもボール接骨院をご利用いただきありがとうございます😊\n\n` +
      `今月の来院者限定抽選で【当選】しました🎊\n\n` +
      `次回ご来院時に施術料金から\n` +
      `━━━━━━━━━━\n` +
      `　　500円引き 🙌\n` +
      `━━━━━━━━━━\n` +
      `させていただきます！\n\n` +
      `有効期限は今月末まで。\n` +
      `スタッフにこのメッセージを見せてください📱\n\n` +
      `また身体のメンテナンス、お待ちしてます💪\nボール接骨院`;

    if (channelToken) {
      await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${channelToken}`,
        },
        body: JSON.stringify({
          to: effectiveTestId,
          messages: [{ type: "text", text: winMsg }],
        }),
      });
    }

    return {
      success: true,
      target: `テスト配信（ID: ${effectiveTestId.substring(0, 8)}...）`,
      totalCount: 1,
      winnerCount: 1,
      winners: ["テストユーザー（当選メッセージを送信）"],
    };
  }

  const supabase = await getSupabase();

  // LINE連携済み かつ 来院実績あり（confirmed）の顧客を取得
  const { data: appointments, error } = await supabase
    .from("appointments")
    .select("customers(id, name, line_user_id)")
    .eq("status", "confirmed")
    .not("customers", "is", null);

  if (error) {
    throw new Error("来院データの取得に失敗しました: " + error.message);
  }

  // 重複排除・LINE未連携を除外
  const seen = new Set<string>();
  const eligibleCustomers: { id: string; name: string; line_user_id: string }[] = [];

  for (const apt of appointments || []) {
    const c = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
    if (c && c.line_user_id && !seen.has(c.id)) {
      seen.add(c.id);
      eligibleCustomers.push(c as { id: string; name: string; line_user_id: string });
    }
  }

  const totalCount = eligibleCustomers.length;
  const winners: string[] = [];
  const losers: string[] = [];

  for (const customer of eligibleCustomers) {
    const isWinner = Math.random() <= 0.10;

    if (isWinner) {
      winners.push(customer.name);
      const winMsg =
        `🎉 やったー！当たり！！\n\n` +
        `いつもボール接骨院をご利用いただきありがとうございます😊\n\n` +
        `今月の来院者限定抽選で【当選】しました🎊\n\n` +
        `次回ご来院時に施術料金から\n` +
        `━━━━━━━━━━\n` +
        `　　500円引き 🙌\n` +
        `━━━━━━━━━━\n` +
        `させていただきます！\n\n` +
        `有効期限は今月末まで。\n` +
        `スタッフにこのメッセージを見せてください📱\n\n` +
        `また身体のメンテナンス、お待ちしてます💪\nボール接骨院`;

      if (channelToken) {
        try {
          await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${channelToken}`,
            },
            body: JSON.stringify({
              to: customer.line_user_id,
              messages: [{ type: "text", text: winMsg }],
            }),
          });
        } catch (e) {
          console.error(`LINE送信エラー（当選）${customer.name}:`, e);
        }
      }
    } else {
      losers.push(customer.name);
      const loseMsg =
        `いつもボール接骨院へのご来院ありがとうございます！\n\n` +
        `今月の来院者限定抽選の結果は…\n\n` +
        `残念、今回はハズレでした😭\n\n` +
        `でも来月またチャレンジできますよ！\n` +
        `身体のケア、引き続き一緒に頑張りましょう💪\n\n` +
        `またのご来院をお待ちしています🙏\nボール接骨院`;

      if (channelToken) {
        try {
          await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${channelToken}`,
            },
            body: JSON.stringify({
              to: customer.line_user_id,
              messages: [{ type: "text", text: loseMsg }],
            }),
          });
        } catch (e) {
          console.error(`LINE送信エラー（落選）${customer.name}:`, e);
        }
      }
    }
  }

  // 対象者が0人の場合
  if (totalCount === 0) {
    return {
      success: true,
      target: "来院済み・LINE連携済みの患者",
      totalCount: 0,
      winnerCount: 0,
      winners: [],
      note: "対象者がいません。患者さんにLINEで予約番号を送ってもらうと紐づきが増えます。",
    };
  }

  // 確率の都合で誰も当たらなかった場合は1名強制当選
  if (winners.length === 0 && eligibleCustomers.length > 0) {
    const lucky = eligibleCustomers[Math.floor(Math.random() * eligibleCustomers.length)];
    winners.push(lucky.name);
  }

  return {
    success: true,
    target: "来院済み・LINE連携済みの患者",
    totalCount,
    winnerCount: winners.length,
    winners,
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

/**
 * 5. 他院紹介用のプレゼン資料URLを送信する
 */
export async function sendReferralMessage(targetId: string, customMessage?: string) {
  await checkAdminAuth();
  
  const presentationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://ball-clinic-reserve.vercel.app'}/presentation`;
  
  const defaultMsg = 
    `【ご紹介】次世代接骨院DXツール「V-ARC」のご案内\n\n` +
    `いつも大変お世話になっております。以前お話した、当院で導入している経営支援システム「V-ARC」の紹介資料をお送りします。\n\n` +
    `現場の負担を減らしつつ、AIで経営分析ができる非常に画期的なツールです。お時間のある際にご一読いただけますと幸いです。\n\n` +
    `▼ 紹介資料（Webスライド形式）\n` +
    `${presentationUrl}\n\n` +
    `ご興味があれば、デモ環境の案内も可能ですのでお気軽にご連絡ください！`;

  const msg = customMessage || defaultMsg;
  const channelToken = await getLineAccessToken() || process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (channelToken && targetId) {
    try {
      const res = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${channelToken}` },
        body: JSON.stringify({ to: targetId, messages: [{ type: "text", text: msg }] }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(`LINE送信失敗: ${JSON.stringify(err)}`);
      }
      
      return { success: true, message: "紹介資料を送信しました！" };
    } catch (e: any) {
      throw new Error(`送信エラー: ${e.message}`);
    }
  } else {
    // シミュレーション
    console.log("【紹介資料送信シミュレーション】");
    console.log(`宛先: ${targetId}`);
    console.log(`内容: ${msg}`);
    return { success: true, message: "（シミュレーション）紹介資料の送信を記録しました" };
  }
}

