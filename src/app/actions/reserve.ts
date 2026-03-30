"use server";

// ===== 予約通知機能 =====

async function getLineToken(): Promise<string | null> {
  const channelId = process.env.LINE_CHANNEL_ID;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelId || !channelSecret) return null;
  try {
    const res = await fetch("https://api.line.me/v2/oauth/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=client_credentials&client_id=${channelId}&client_secret=${channelSecret}`,
    });
    const data = await res.json();
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

async function notifyOwner(
  name: string,
  phone: string,
  rawDate: string,
  time: string,
  visitType: string,
  symptoms: string,
  reservationNumber: string,
  isWaiting: boolean
) {
  const ownerLineId = process.env.OWNER_LINE_USER_ID;
  const visitLabel = visitType === "new" ? "初診（60分）" : "再診（30分）";
  const statusLabel = isWaiting ? "⏳【キャンセル待ち登録】" : "🔔【新規予約】";
  const messageText = `${statusLabel}\n\n患者名: ${name}\n日時: ${rawDate} ${time}\n電話: ${phone || "未入力"}\n種別: ${visitLabel}\n症状: ${symptoms || "なし"}\n予約番号: ${reservationNumber}`;

  // LINE通知
  if (ownerLineId) {
    try {
      const token = await getLineToken();
      if (token) {
        const res = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ to: ownerLineId, messages: [{ type: "text", text: messageText }] }),
        });
        if (!res.ok) console.error("[LINE通知] 送信失敗:", await res.json());
        else console.log("[LINE通知] 送信成功");
      }
    } catch (err) {
      console.error("[LINE通知] エラー:", err);
    }
  }

  // メール通知 (RESEND_API_KEYが設定されている場合)
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: "ボール接骨院予約 <onboarding@resend.dev>",
          to: ["hiraiwayuji@gmail.com"],
          subject: `${statusLabel} ${name}様 ${rawDate} ${time}`,
          text: messageText,
        }),
      });
      console.log("[メール通知] 送信成功");
    } catch (err) {
      console.error("[メール通知] エラー:", err);
    }
  }
}

// ===== 予約通知機能 ここまで =====

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getTimeSlots, isDateWithinAllowedRange, isTimeSlotWithinTwoHours } from "@/lib/time-slots";
import { unstable_noStore as noStore } from "next/cache";

async function getSupabase() {
  return await createServerClient();
}

// å¯ç¨æ§ãã§ãã¯å°ç¨ã®ç®¡çèã¯ã©ã¤ã¢ã³ãï¼RLSããã¤ãã¹ãã¦äºç´æç¡ã ããç¢ºèªããããï¼
function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, {
    global: {
      fetch: (fetchUrl, options) => fetch(fetchUrl, { ...options, cache: 'no-store' })
    }
  });
}

const DEFAULT_CLINIC_ID = '00000000-0000-0000-0000-000000000001';
const MAX_CAPACITY = 1; // 1æ ãããã®æå¤§åãå¥ãäººæ°ï¼1åå¥ãã°äºç´æ¸ã¿ã«ããï¼

// ã­ã£ã³ã»ã«å¾ã¡ãæéå¸¯ç¯å²ã§ç»é²ããã¢ã¯ã·ã§ã³ï¼ä¾: 15:00 ã 20:00ï¼
export async function createWaitlistReservation(formData: FormData) {
  try {
    const dateStr = formData.get("date") as string;
    const startTime = formData.get("startTime") as string;
    const endTime = formData.get("endTime") as string;
    const name = formData.get("name") as string;
    const phone = formData.get("phone") as string;
    const symptoms = formData.get("symptoms") as string | null;

    if (!dateStr || !startTime || !endTime || !name || !phone) {
      return { success: false, error: "å¿é é ç®ãä¸è¶³ãã¦ãã¾ã" };
    }

    // 1ã¶æå¶éã®ãã§ãã¯
    const reservationDate = new Date(dateStr);
    if (!isDateWithinAllowedRange(reservationDate)) {
      return { success: false, error: "1ã¶æããåã®äºç´ã¯ã§ãã¾ããã" };
    }

    // 2æéåå¶éã®ãã§ãã¯
    if (isTimeSlotWithinTwoHours(dateStr, startTime)) {
      return { success: false, error: "ç´åï¼2æéä»¥åï¼ã®ã­ã£ã³ã»ã«å¾ã¡ã¯Webããã¯åãä»ãã¦ããã¾ããã" };
    }

    const supabase = await getSupabase();
    if (supabase) {
      // é¡§å®¢ä½æ
      const { data: customer, error: customerErr } = await supabase
        .from("customers")
        .insert([{ 
          name, 
          phone,
          clinic_id: DEFAULT_CLINIC_ID
        }])
        .select()
        .single();
      if (customerErr) {
        return { success: false, error: "é¡§å®¢æå ±ã®ç»é²ã«å¤±æãã¾ãã" };
      }

      // ã­ã£ã³ã»ã«å¾ã¡äºç´ãä½æ
      // start_time = å¸æç¯å²ã®éå§ãend_time = å¸æç¯å²ã®çµäºãstatus = "waiting"
      const startDateTime = `${dateStr}T${startTime}:00+09:00`;
      const endDateTime = `${dateStr}T${endTime}:00+09:00`;
      const memo = `ãã­ã£ã³ã»ã«å¾ã¡å¸ææéå¸¯: ${startTime}ã${endTime}ã${symptoms ? ` ${symptoms}` : ""}`;

      const { data: appointment, error: aptErr } = await supabase
        .from("appointments")
        .insert([{
          customer_id: customer.id,
          start_time: startDateTime,
          end_time: endDateTime,
          memo,
          is_first_visit: false,
          status: "waiting",
          clinic_id: DEFAULT_CLINIC_ID
        }])
        .select()
        .single();

      if (aptErr || !appointment) {
        return { success: false, error: "ã­ã£ã³ã»ã«å¾ã¡ç»é²ã«å¤±æãã¾ãã" };
      }

      const reservationNumber = appointment.id.split('-')[0].toUpperCase();
      return { success: true, reservationNumber };
    } else {
      // ãã¢ã¢ã¼ãï¼Supabaseæªè¨­å®ï¼
      await new Promise(resolve => setTimeout(resolve, 800));
      const demoNumber = Math.random().toString(36).substring(2, 8).toUpperCase();
      return { success: true, reservationNumber: demoNumber };
    }
  } catch (err) {
    console.error(err);
    return { success: false, error: "äºæãã¬ã¨ã©ã¼ãçºçãã¾ãã" };
  }
}

// æå®æã®åæ¥ã®äºç´æ°ãåå¾ããã¢ã¯ã·ã§ã³
export async function getMonthlyAvailability(year: number, month: number): Promise<Record<string, number>> {
  noStore();
  const supabase = getAdminSupabase() || await getSupabase();
  if (!supabase) return {};

  try {
    const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01T00:00:00+09:00`;
    const lastDay = new Date(year, month, 0).getDate();
    const endOfMonth = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59+09:00`;

    const { data, error } = await supabase
      .from("appointments")
      .select("start_time, end_time")
      .gte("start_time", startOfMonth)
      .lte("start_time", endOfMonth)
      .neq("status", "cancelled");

    if (error) {
      console.error("Failed to fetch monthly availability:", error);
      return {};
    }

    // æ¥ä»ãã¨ã®äºç´æ°ãã«ã¦ã³ã (30å=1æ ã¨ãã¦æç®ãå¶æ¥­æéåã®ã¿)
    const counts: Record<string, number> = {};
    data.forEach((app: { start_time: string, end_time?: string }) => {
      // ãã¼ã¿ãã¼ã¹ããè¿ãããæå»ã¯UTCã¨ãã¦è§£éãããã¹ã (ä¾: "2026-03-16T04:00:00+00:00")
      const dStart = new Date(app.start_time);
      const dEnd = app.end_time ? new Date(app.end_time) : new Date(dStart.getTime() + 30 * 60000);
      
      let current = dStart.getTime();
      while (current < dEnd.getTime()) {
        // Javascriptã®Dateã¯ã·ã¹ãã ã®ã­ã¼ã«ã«ã¿ã¤ã ã¾ã¼ã³ã§è§£éããããããæç¤ºçã«JSTã¸ãã©ã¼ããããã
        // ãµã¼ãã¼ãUTCã§åãã¦ããå ´åãèæ®ããJST(+9h)ãè¶³ãã¦ISOæå­åã®åé ­ãä½¿ããªã©ã®æåè¨ç®ã¯ãºã¬ãããã
        // ä»£ããã« toLocaleString ã§ JST ã®æå­åãåå¾ãã¦ããå¿è¦ãªé¨åãæ½åºããã
        const jstFormatter = new Intl.DateTimeFormat('ja-JP', {
          timeZone: 'Asia/Tokyo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        
        const parts = jstFormatter.formatToParts(new Date(current));
        const p = Object.fromEntries(parts.map(part => [part.type, part.value]));
        const dateKey = `${p.year}-${p.month}-${p.day}`; // YYYY-MM-DD
        const slotTime = `${p.hour}:${p.minute}`; // HH:mm
        
        const slotDateObj = new Date(`${dateKey}T00:00:00+09:00`);
        const businessSlots = getTimeSlots(slotDateObj);
        
        if (businessSlots.includes(slotTime)) {
          counts[dateKey] = (counts[dateKey] || 0) + 1;
        }
        current += 30 * 60000;
      }
    });

    // 1æ¥ã®ç·æ æ° * å®å¡ ã§ãããå¤ãè¨ç®ï¼ã«ã¬ã³ãã¼ã®ãæ®ãããããç­ã®å¤å®ç¨ï¼
    return counts;
  } catch (err) {
    console.error(err);
    return {};
  }
}

// æå®æ¥ã®äºç´ç¶æ³ï¼åã¾ã£ã¦ããæéå¸¯ï¼ãåå¾ããã¢ã¯ã·ã§ã³
export async function getDailyAvailability(dateStr: string) {
  noStore();
  const supabase = getAdminSupabase() || await getSupabase();
  if (!supabase) return [];

  try {
    const startOfDay = `${dateStr}T00:00:00+09:00`;
    const endOfDay = `${dateStr}T23:59:59+09:00`;

    const { data, error } = await supabase
      .from("appointments")
      .select("start_time, end_time")
      .gte("start_time", startOfDay)
      .lte("start_time", endOfDay)
      .neq("status", "cancelled");

    if (error) {
      console.error("Failed to fetch availability:", error);
      return [];
    }

    // åå¾ããäºç´æ¥æã®éå§ã»çµäºãããå30åæ ãã¨ã®äºç´æ°ãã«ã¦ã³ã
    const slotCounts: Record<string, number> = {};
    data.forEach((app: { start_time: string, end_time?: string }) => {
      const start = new Date(app.start_time);
      const end = app.end_time ? new Date(app.end_time) : new Date(start.getTime() + 30 * 60000);
      
      let current = start.getTime();
      while (current < end.getTime()) {
        const jstFormatter = new Intl.DateTimeFormat('ja-JP', {
          timeZone: 'Asia/Tokyo',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
        
        const timeKey = jstFormatter.format(new Date(current)); // "HH:mm" in JST
        
        slotCounts[timeKey] = (slotCounts[timeKey] || 0) + 1;
        current += 30 * 60000;
      }
    });

    // å®å¡(MAX_CAPACITY)ã«éããæ ã®ã¿ããåã¾ã£ã¦ãããã¨ãã¦è¿ã
    const bookedTimes = Object.keys(slotCounts).filter(time => slotCounts[time] >= MAX_CAPACITY);
    
    console.log(`[DEBUG] getDailyAvailability for ${dateStr} returned (filled slots):`, bookedTimes);
    return bookedTimes;
  } catch (err) {
    console.error(err);
    return [];
  }
}

export async function createReservation(formData: FormData) {
  try {
    const rawDate = formData.get("date") as string;
    const time = formData.get("time") as string;
    const name = formData.get("name") as string;
    const phone = formData.get("phone") as string;
    const visitType = formData.get("visitType") as string;
    const symptoms = formData.get("symptoms") as string;
    const isWaitlistIntent = formData.get("isWaitlistIntent") === "true";

    const isFirstVisit = visitType === "new";

    if (!rawDate || !time || !name) {
      return { success: false, error: "å¿é é ç®ãä¸è¶³ãã¦ãã¾ã" };
    }

    if (isFirstVisit && !phone) {
      return { success: false, error: "åè¨ºã®å ´åã¯é»è©±çªå·ãå¿é ã§ã" };
    }

    // 1ã¶æå¶éã®ãã§ãã¯
    const reservationDate = new Date(rawDate);
    if (!isDateWithinAllowedRange(reservationDate)) {
      return { success: false, error: "1ã¶æããåã®äºç´ã¯ã§ãã¾ããã" };
    }

    // 2æéåå¶éã®ãã§ãã¯
    if (isTimeSlotWithinTwoHours(rawDate, time)) {
      return { success: false, error: "ç´åï¼2æéä»¥åï¼ã®ãäºç´ã¯ãé»è©±ã¾ãã¯LINEãªã©ã§ãåãåãããã ããã" };
    }

    const supabase = await getSupabase();
    if (supabase) {
      let customerId = null;

      // é¡§å®¢ã®æ¤ç´¢ã¾ãã¯ä½æå¦ç
      if (phone) {
        // é»è©±çªå·ãããå ´åã¯ããã§ç§åã»æ´æ°ã»ä½æ
        const { data: existingPhoneCustomer } = await supabase
          .from("customers")
          .select("id")
          .eq("phone", phone)
          .single();

        if (existingPhoneCustomer) {
          customerId = existingPhoneCustomer.id;
          // ååã®æ´æ°ï¼å¿è¦ã«å¿ãã¦ï¼
          await supabase.from("customers").update({ name }).eq("id", customerId);
        } else {
          const { data: newCustomer, error: insertErr } = await supabase
            .from("customers")
            .insert([{ 
              name, 
              phone,
              clinic_id: DEFAULT_CLINIC_ID
            }])
            .select()
            .single();
          if (insertErr || !newCustomer) throw new Error("Customer creation failed");
          customerId = newCustomer.id;
        }
      } else {
        // åè¨ºã§é»è©±çªå·ãç©ºã®å ´åã¯ååã§ç§åãè©¦ã¿ã
        const { data: existingNameCustomer, error: nameErr } = await supabase
          .from("customers")
          .select("id")
          .eq("name", name)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
          
        if (existingNameCustomer) {
          customerId = existingNameCustomer.id;
        } else {
          const { data: newCustomer, error: insertErr } = await supabase
            .from("customers")
            .insert([{ 
              name, 
              phone: null,
              clinic_id: DEFAULT_CLINIC_ID
            }])
            .select()
            .single();
          if (insertErr || !newCustomer) throw new Error("Customer creation failed");
          customerId = newCustomer.id;
        }
      }

      const startDateTimeStr = `${rawDate}T${time}:00+09:00`;
      
      // äºç´æ ã®å®å¡ãã§ãã¯
      const adminDb = getAdminSupabase() || supabase;
      const { data: existingApps } = await adminDb
        .from("appointments")
        .select("id")
        .eq("start_time", startDateTimeStr)
        .neq("status", "cancelled");
        
      const isCapacityFull = existingApps && existingApps.length >= MAX_CAPACITY;
      
      // ããã«ããã­ã³ã°ã®å³æ ¼ãªé²å¾¡ï¼ã¦ã¼ã¶ã¼ãç©ºãã ã¨æã£ã¦æ¼ããã®ã«åã¾ã£ã¦ããå ´åï¼
      if (isCapacityFull && !isWaitlistIntent) {
        return { success: false, error: "ç³ãè¨³ããã¾ãããã¿ããã®å·®ã§äºç´ãåã¾ãã¾ããããææ°ã§ãããå¥ã®ãæéããé¸ã³ãã ããã" };
      }

      const finalStatus = isCapacityFull ? "waiting" : "pending";

      // äºç´ã®ä½æ
      const isFirstVisit = visitType === "new";
      
      // åè¨ºã¯60åãåè¨ºã¯30åæ ãç¢ºä¿
      const durationMinutes = isFirstVisit ? 60 : 30;
      const jstDate = new Date(startDateTimeStr);
      const endDate = new Date(jstDate.getTime() + durationMinutes * 60000);
      const endDateTimeStr = endDate.toISOString();

      const { error: appointmentErr, data: appointmentData } = await supabase
        .from("appointments")
        .insert([{
          customer_id: customerId,
          start_time: startDateTimeStr,
          end_time: endDateTimeStr,
          memo: symptoms,
          is_first_visit: isFirstVisit,
          status: finalStatus,
          clinic_id: DEFAULT_CLINIC_ID
        }])
        .select()
        .single();

      if (appointmentErr || !appointmentData) {
        console.error("Appointment insertion error:", appointmentErr);
        return { success: false, error: "äºç´æå ±ã®ç»é²ã«å¤±æãã¾ãã" };
      }
      
      const reservationNumber = appointmentData.id.split('-')[0].toUpperCase();
      // 予約通知（LINE + メール）
  await notifyOwner(name, phone, rawDate, time, visitType, symptoms, reservationNumber, isCapacityFull);

  return { success: true, isWaiting: isCapacityFull, reservationNumber };
    } else {
      // Supabaseã®URLãè¨­å®ããã¦ããªãå ´åã®åä½ä¿è¨¼ï¼ãã¢ç¨ï¼
      console.log("Supabase URL not configured. Simulating successful reservation.");
      console.log("Data:", { rawDate, time, name, phone, visitType, symptoms });
      await new Promise(resolve => setTimeout(resolve, 1000));
      const demoReservationNumber = Math.random().toString(36).substring(2, 8).toUpperCase();
      return { success: true, isWaiting: false, reservationNumber: demoReservationNumber };
    }
  } catch (err) {
    console.error(err);
    return { success: false, error: "äºæãã¬ã¨ã©ã¼ãçºçãã¾ãã" };
  }
}
