"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getTimeSlots, isDateWithinAllowedRange, isTimeSlotWithinTwoHours } from "@/lib/time-slots";
import { unstable_noStore as noStore } from "next/cache";

async function getSupabase() {
  return await createServerClient();
}

// 可用性チェック専用の管理者クライアント（RLSをバイパスして予約有無だけを確認するため）
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
const MAX_CAPACITY = 1; // 1枠あたりの最大受け入れ人数（1名入れば予約済みにする）

// キャンセル待ちを時間帯範囲で登録するアクション（例: 15:00 〜 20:00）
export async function createWaitlistReservation(formData: FormData) {
  try {
    const dateStr = formData.get("date") as string;
    const startTime = formData.get("startTime") as string;
    const endTime = formData.get("endTime") as string;
    const name = formData.get("name") as string;
    const phone = formData.get("phone") as string;
    const symptoms = formData.get("symptoms") as string | null;

    if (!dateStr || !startTime || !endTime || !name || !phone) {
      return { success: false, error: "必須項目が不足しています" };
    }

    // 1ヶ月制限のチェック
    const reservationDate = new Date(dateStr);
    if (!isDateWithinAllowedRange(reservationDate)) {
      return { success: false, error: "1ヶ月より先の予約はできません。" };
    }

    // 2時間前制限のチェック
    if (isTimeSlotWithinTwoHours(dateStr, startTime)) {
      return { success: false, error: "直前（2時間以内）のキャンセル待ちはWebからは受け付けておりません。" };
    }

    const supabase = await getSupabase();
    if (supabase) {
      // 顧客作成
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
        return { success: false, error: "顧客情報の登録に失敗しました" };
      }

      // キャンセル待ち予約を作成
      // start_time = 希望範囲の開始、end_time = 希望範囲の終了、status = "waiting"
      const startDateTime = `${dateStr}T${startTime}:00+09:00`;
      const endDateTime = `${dateStr}T${endTime}:00+09:00`;
      const memo = `【キャンセル待ち希望時間帯: ${startTime}〜${endTime}】${symptoms ? ` ${symptoms}` : ""}`;

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
        return { success: false, error: "キャンセル待ち登録に失敗しました" };
      }

      const reservationNumber = appointment.id.split('-')[0].toUpperCase();
      return { success: true, reservationNumber };
    } else {
      // デモモード（Supabase未設定）
      await new Promise(resolve => setTimeout(resolve, 800));
      const demoNumber = Math.random().toString(36).substring(2, 8).toUpperCase();
      return { success: true, reservationNumber: demoNumber };
    }
  } catch (err) {
    console.error(err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

// 指定月の各日の予約数を取得するアクション
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

    // 日付ごとの予約数をカウント (30分=1枠として換算、営業時間内のみ)
    const counts: Record<string, number> = {};
    data.forEach((app: { start_time: string, end_time?: string }) => {
      // データベースから返される時刻はUTCとして解釈されるべき (例: "2026-03-16T04:00:00+00:00")
      const dStart = new Date(app.start_time);
      const dEnd = app.end_time ? new Date(app.end_time) : new Date(dStart.getTime() + 30 * 60000);
      
      let current = dStart.getTime();
      while (current < dEnd.getTime()) {
        // JavascriptのDateはシステムのローカルタイムゾーンで解釈されるため、明示的にJSTへフォーマットする
        // サーバーがUTCで動いている場合を考慮し、JST(+9h)を足してISO文字列の先頭を使うなどの手動計算はズレやすい。
        // 代わりに toLocaleString で JST の文字列を取得してから必要な部分を抽出する。
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

    // 1日の総枠数 * 定員 でしきい値を計算（カレンダーの「残りわずか」等の判定用）
    return counts;
  } catch (err) {
    console.error(err);
    return {};
  }
}

// 指定日の予約状況（埋まっている時間帯）を取得するアクション
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

    // 取得した予約日時の開始・終了から、各30分枠ごとの予約数をカウント
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

    // 定員(MAX_CAPACITY)に達した枠のみを「埋まっている」として返す
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
      return { success: false, error: "必須項目が不足しています" };
    }

    if (isFirstVisit && !phone) {
      return { success: false, error: "初診の場合は電話番号が必須です" };
    }

    // 1ヶ月制限のチェック
    const reservationDate = new Date(rawDate);
    if (!isDateWithinAllowedRange(reservationDate)) {
      return { success: false, error: "1ヶ月より先の予約はできません。" };
    }

    // 2時間前制限のチェック
    if (isTimeSlotWithinTwoHours(rawDate, time)) {
      return { success: false, error: "直前（2時間以内）のご予約はお電話またはLINEなどでお問い合わせください。" };
    }

    const supabase = await getSupabase();
    if (supabase) {
      let customerId = null;

      // 顧客の検索または作成処理
      if (phone) {
        // 電話番号がある場合はそれで照合・更新・作成
        const { data: existingPhoneCustomer } = await supabase
          .from("customers")
          .select("id")
          .eq("phone", phone)
          .single();

        if (existingPhoneCustomer) {
          customerId = existingPhoneCustomer.id;
          // 名前の更新（必要に応じて）
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
        // 再診で電話番号が空の場合は名前で照合を試みる
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
      
      // 予約枠の定員チェック
      const adminDb = getAdminSupabase() || supabase;
      const { data: existingApps } = await adminDb
        .from("appointments")
        .select("id")
        .eq("start_time", startDateTimeStr)
        .neq("status", "cancelled");
        
      const isCapacityFull = existingApps && existingApps.length >= MAX_CAPACITY;
      
      // ダブルブッキングの厳格な防御（ユーザーが空きだと思って押したのに埋まっていた場合）
      if (isCapacityFull && !isWaitlistIntent) {
        return { success: false, error: "申し訳ありません。タッチの差で予約が埋まりました。お手数ですが、別のお時間をお選びください。" };
      }

      const finalStatus = isCapacityFull ? "waiting" : "pending";

      // 予約の作成
      const isFirstVisit = visitType === "new";
      
      // 初診は60分、再診は30分枠を確保
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
        return { success: false, error: "予約情報の登録に失敗しました" };
      }
      
      const reservationNumber = appointmentData.id.split('-')[0].toUpperCase();
      return { success: true, isWaiting: isCapacityFull, reservationNumber };
    } else {
      // SupabaseのURLが設定されていない場合の動作保証（デモ用）
      console.log("Supabase URL not configured. Simulating successful reservation.");
      console.log("Data:", { rawDate, time, name, phone, visitType, symptoms });
      await new Promise(resolve => setTimeout(resolve, 1000));
      const demoReservationNumber = Math.random().toString(36).substring(2, 8).toUpperCase();
      return { success: true, isWaiting: false, reservationNumber: demoReservationNumber };
    }
  } catch (err) {
    console.error(err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}
