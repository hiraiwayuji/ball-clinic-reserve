"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { checkAdminAuth } from "./auth";

async function getSupabase() {
  return await createClient();
}

const DEFAULT_CLINIC_ID = '00000000-0000-0000-0000-000000000001';

export async function createManualReservation(formData: FormData) {
  await checkAdminAuth();
  try {
    const rawDate = formData.get("date") as string;
    const time = formData.get("time") as string;
    const name = formData.get("name") as string;
    const phone = formData.get("phone") as string;
    const visitType = formData.get("visitType") as string;
    const symptoms = (formData.get("symptoms") as string) || "";
    const recurringWeeksStr = formData.get("recurringWeeks") as string;
    const recurringWeeks = recurringWeeksStr ? parseInt(recurringWeeksStr, 10) : 1;
    const durationStr = formData.get("duration") as string;
    const durationMinutes = durationStr ? parseInt(durationStr, 10) : 30;

    if (!rawDate || !time || !name || !phone) {
      return { success: false, error: "必須項目が不足しています" };
    }

    const supabase = await getSupabase();
    if (supabase) {
      // 1. 顧客の作成（名前と電話番号で簡易登録）
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
        console.error("Customer insertion error:", customerErr);
        return { success: false, error: "顧客情報の登録に失敗しました" };
      }
      const customerId = customer.id;

      // 2. 予約の作成（管理側から追加したものは最初から confirmed とする例）
      const baseDate = new Date(`${rawDate}T${time}:00+09:00`);
      const isFirstVisit = visitType === "new";

      const appointmentsToInsert = [];
      for (let i = 0; i < recurringWeeks; i++) {
        const targetDate = new Date(baseDate.getTime());
        targetDate.setDate(targetDate.getDate() + (i * 7));
        
        const startDateTimeStr = targetDate.toISOString();
        const endDate = new Date(targetDate.getTime() + durationMinutes * 60 * 1000);
        const endDateTimeStr = endDate.toISOString();
        const memoBase = `[院内追加] ${symptoms}`.trim();
        const memoText = recurringWeeks > 1 ? `${memoBase} (定期予約 ${i+1}/${recurringWeeks})` : memoBase;
        
        appointmentsToInsert.push({
          customer_id: customerId,
          start_time: startDateTimeStr,
          end_time: endDateTimeStr,
          memo: memoText,
          is_first_visit: i === 0 ? isFirstVisit : false,
          status: "confirmed",
          clinic_id: DEFAULT_CLINIC_ID
        });
      }

      const { error: appointmentErr } = await supabase
        .from("appointments")
        .insert(appointmentsToInsert);

      if (appointmentErr) {
        console.error("Appointment insertion error:", appointmentErr);
        return { success: false, error: "予約情報の登録に失敗しました" };
      }

      revalidatePath("/admin/appointments");
      revalidatePath("/admin");
    }

    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

// 予約ステータスの変更アクション
export async function updateAppointmentStatus(appointmentId: string, newStatus: "confirmed" | "cancelled" | "pending" | "waiting") {
  await checkAdminAuth();
  try {
      const supabase = await getSupabase();
      const { error } = await supabase
        .from("appointments")
        .update({ status: newStatus })
        .eq("id", appointmentId);

      if (error) {
        console.error("Failed to update status:", error);
        return { success: false, error: "ステータスの更新に失敗しました" };
      }
      
      revalidatePath("/admin/appointments");
      revalidatePath("/admin");
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

export async function updateAppointmentDetails(
  appointmentId: string, 
  newDateStr: string, 
  newTimeStr: string, 
  memo: string,
  isFirstVisit: boolean,
  durationMinutes: number = 30
) {
  await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    if (supabase) {
      const startDateTimeStr = `${newDateStr}T${newTimeStr}:00+09:00`;
      const endDate = new Date(new Date(startDateTimeStr).getTime() + durationMinutes * 60 * 1000);

      const { error } = await supabase
        .from("appointments")
        .update({ 
          start_time: startDateTimeStr,
          end_time: endDate.toISOString(),
          memo: memo,
          is_first_visit: isFirstVisit
        })
        .eq("id", appointmentId);

      if (error) {
        console.error("Failed to update appointment:", error);
        return { success: false, error: "予約の更新に失敗しました" };
      }
      
      revalidatePath("/admin/appointments");
      revalidatePath("/admin");
    }
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

// 患者のLINEに予約確認メッセージを送信するアクション
export async function sendLineConfirmation(appointmentId: string) {
  await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    if (!supabase) return { success: false, error: "DB接続エラー" };

    // 予約と顧客情報（line_user_id含む）を取得
    const { data: apt, error } = await supabase
      .from("appointments")
      .select("id, start_time, is_first_visit, status, customers(name, line_user_id)")
      .eq("id", appointmentId)
      .single();

    if (error || !apt) return { success: false, error: "予約情報の取得に失敗しました" };

    const customer = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
    const lineUserId = customer?.line_user_id;

    if (!lineUserId) {
      return { success: false, error: "この患者のLINE IDが未登録です。患者がLINE公式アカウントにメッセージを送ると登録されます。" };
    }

    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) return { success: false, error: "LINE_CHANNEL_ACCESS_TOKEN が未設定です" };

    const startTime = new Date(apt.start_time);
    const dateStr = startTime.toLocaleDateString("ja-JP", {
      year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo",
    });
    const timeStr = startTime.toLocaleTimeString("ja-JP", {
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo",
    });
    const visitLabel = apt.is_first_visit ? "初診（60分）" : "再診（30分）";
    const statusLabel = apt.status === "confirmed" ? "✅ 予約確定" : "⏳ 確認待ち";
    const reservationNumber = apt.id.split("-")[0].toUpperCase();

    const messageText = `${statusLabel}\n\n${customer?.name || ""}様の予約内容をお知らせします。\n\n📅 日時: ${dateStr} ${timeStr}\n🏥 種別: ${visitLabel}\n📋 予約番号: ${reservationNumber}\n\nご来院をお待ちしております。`;

    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text: messageText }] }),
    });

    if (!res.ok) {
      const errBody = await res.json();
      console.error("[LINE送信失敗]", errBody);
      return { success: false, error: "LINE送信に失敗しました。患者が友だち追加しているか確認してください。" };
    }

    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}

// 予約の削除アクション
export async function deleteAppointment(appointmentId: string) {
  await checkAdminAuth();
  try {
    const supabase = await getSupabase();
    if (supabase) {
      const { error } = await supabase
        .from("appointments")
        .delete()
        .eq("id", appointmentId);

      if (error) {
        console.error("Failed to delete appointment:", error);
        return { success: false, error: "予約の削除に失敗しました" };
      }
      
      revalidatePath("/admin/appointments");
      revalidatePath("/admin");
    }
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: "予期せぬエラーが発生しました" };
  }
}
