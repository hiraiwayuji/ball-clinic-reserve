"use server";

import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";
import { pushLineToOwners, sendEmailToOwners } from "@/lib/admin-notify";
import { getLineUidFromCookie } from "@/app/actions/family-line";
import { resolveBookingCustomer } from "@/lib/booking-customer";
import { detectClinicMisconfig, CLINIC_MISCONFIG_USER_MESSAGE } from "@/lib/clinic-guard";

async function notifyOwner(
  name: string,
  phone: string,
  rawDate: string,
  time: string,
  visitType: string,
  symptoms: string,
  reservationNumber: string,
  isWaiting: boolean | null,
  courseName?: string | null,
  staffName?: string | null,
) {
  const visitLabel = visitType === "new" ? "初診" : "再診";
  const statusLabel = isWaiting ? "⏳【キャンセル待ち登録】" : "🔔【新規予約】";
  const courseLine = courseName ? `\nコース: ${courseName}` : "";
  const staffLine = staffName ? `\n指名: ${staffName}` : "";
  const messageText = `${statusLabel}\n\n患者名: ${name}\n日時: ${rawDate} ${time}\n電話: ${phone || "未入力"}\n種別: ${visitLabel}${courseLine}${staffLine}\n症状: ${symptoms || "なし"}\n予約番号: ${reservationNumber}`;

  await Promise.all([
    pushLineToOwners(PUBLIC_CLINIC_ID, messageText),
    sendEmailToOwners(
      PUBLIC_CLINIC_ID,
      `${statusLabel} ${name}様 ${rawDate} ${time}`,
      messageText,
    ),
  ]);
}


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

const DEFAULT_CLINIC_ID = PUBLIC_CLINIC_ID;
const MAX_CAPACITY = 1; // 1枠あたりの最大受け入れ人数（1名入れば予約済みにする）

/**
 * 氏名照合用の正規化。
 * 完全一致だけだと「山内 颯人」と「山内颯人」、全角/半角スペースの違いで
 * 既存患者を見つけられず「初めての方は…」になる事故が起きる（2026-05 山内family 実例）。
 * - NFKC で全角英数/記号を半角化
 * - 全角・半角スペースをすべて除去
 * - 小文字化（romaji 表記ゆれの軽減）
 * ※ 別漢字（楓人/颯人）や romaji↔漢字（fuuta↔颯人）は正規化では吸収不可。
 *   そのケースは顧客マスタ側の名寄せ（統合）で対応する。
 */
function normalizeNameForMatch(value: string): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[\s　]/g, "")
    .toLowerCase();
}

// キャンセル待ちを時間帯範囲で登録するアクション（例: 15:00 〜 20:00）
export async function createWaitlistReservation(formData: FormData) {
  try {
    // ── クリニック識別ガード（他院ドメインのボール・フォールバック時は書き込みを止める） ──
    const guard = await detectClinicMisconfig();
    if (guard.misconfigured) {
      console.error("[clinic-guard] waitlist blocked:", guard.reason);
      void pushLineToOwners(
        PUBLIC_CLINIC_ID,
        `🚨【キャンセル待ちブロック】クリニック設定の不整合を検知し、書き込みを停止しました。\n理由: ${guard.reason}`,
      );
      return { success: false, error: CLINIC_MISCONFIG_USER_MESSAGE };
    }

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
      const adminDb = getAdminSupabase() || supabase;

      // ── 顧客照合（通常予約と同じゲート。未登録ならアンケート誘導＝bypass禁止） ──
      // ※ これまでキャンセル待ちは無条件に customer を新規作成しており、初めての方が
      //   アンケート未記入のまま登録される bypass になっていた（2026-06-02 修正）。
      const normalizedPhone = (phone ?? "").replace(/[-\s]/g, "");
      const lineUid = await getLineUidFromCookie();
      const resolved = await resolveBookingCustomer(adminDb, {
        clinicId: DEFAULT_CLINIC_ID,
        name,
        phone: normalizedPhone,
        requestedCustomerId: (formData.get("customerId") as string) || null,
        lineUid,
      });
      if (!resolved.ok) {
        return {
          success: false,
          error: resolved.error,
          requiresQuestionnaire: resolved.requiresQuestionnaire ?? false,
        };
      }
      const customerId = resolved.customerId;

      // キャンセル待ち予約を作成
      // start_time = 希望範囲の開始、end_time = 希望範囲の終了、status = "waiting"
      const startDateTime = `${dateStr}T${startTime}:00+09:00`;
      const endDateTime = `${dateStr}T${endTime}:00+09:00`;
      const memo = `【キャンセル待ち希望時間帯: ${startTime}〜${endTime}】${symptoms ? ` ${symptoms}` : ""}`;

      const { data: appointment, error: aptErr } = await adminDb
        .from("appointments")
        .insert([{
          customer_id: customerId,
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
    return { success: false, error: "エラーが発生しました。お手数ですが、お電話またはLINEにてご予約ください。" };
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
      .eq("clinic_id", DEFAULT_CLINIC_ID)
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
      .eq("clinic_id", DEFAULT_CLINIC_ID)
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
    // ── クリニック識別ガード（他院ドメインのボール・フォールバック時は書き込みを止める） ──
    const guard = await detectClinicMisconfig();
    if (guard.misconfigured) {
      console.error("[clinic-guard] reservation blocked:", guard.reason);
      void pushLineToOwners(
        PUBLIC_CLINIC_ID,
        `🚨【予約ブロック】クリニック設定の不整合を検知し、Web予約の書き込みを停止しました。\n理由: ${guard.reason}\n→ env(NEXT_PUBLIC_CLINIC_ID/NAME)を確認し、Build Cache OFF で再デプロイしてください。`,
      );
      return { success: false, error: CLINIC_MISCONFIG_USER_MESSAGE };
    }

    const rawDate = formData.get("date") as string;
    const time = formData.get("time") as string;
    const name = formData.get("name") as string;
    const rawPhone = formData.get("phone") as string;
    // ハイフン・スペースを除去して正規化（アンケートDBと形式を統一）
    const phone = rawPhone ? rawPhone.trim().replace(/[-\s]/g, "") : "";
    const visitType = formData.get("visitType") as string;
    const symptoms = formData.get("symptoms") as string;
    const isWaitlistIntent = formData.get("isWaitlistIntent") === "true";
    const courseId = (formData.get("courseId") as string) || null;
    const courseName = (formData.get("courseName") as string) || null;
    const courseDurationStr = formData.get("courseDurationMinutes") as string | null;
    let staffId = (formData.get("staffId") as string) || null;
    let staffName = (formData.get("staffName") as string) || null;
    const roomId = (formData.get("roomId") as string) || null;
    const roomName = (formData.get("roomName") as string) || null;
    const requestedCustomerId = (formData.get("customerId") as string) || null;

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
      let customerId: string | null = null;

      const adminDb = getAdminSupabase() || supabase;

      // ── 担当固定コース（さみ整体など）の出勤日チェック＋担当の自動確定 ──
      // required_staff_id 付きコースは、そのスタッフが出勤している日だけ予約可。
      if (courseId) {
        const { data: courseRow } = await adminDb
          .from("reservation_courses")
          .select("required_staff_id")
          .eq("id", courseId)
          .eq("clinic_id", PUBLIC_CLINIC_ID)
          .maybeSingle();
        const reqStaffId = (courseRow?.required_staff_id as string | null) ?? null;
        if (reqStaffId) {
          const { data: reqStaff } = await adminDb
            .from("reservation_staff")
            .select("id, name, schedule_based_booking, booking_weekdays")
            .eq("id", reqStaffId)
            .eq("clinic_id", PUBLIC_CLINIC_ID)
            .maybeSingle();
          if (reqStaff?.schedule_based_booking) {
            const weekdays = String(reqStaff.booking_weekdays ?? "")
              .split(",").map((s) => s.trim()).filter(Boolean).map(Number);
            const { data: ovr } = await adminDb
              .from("staff_booking_dates")
              .select("available")
              .eq("clinic_id", PUBLIC_CLINIC_ID)
              .eq("staff_id", reqStaffId)
              .eq("date", rawDate)
              .maybeSingle();
            const wd = new Date(`${rawDate}T00:00:00`).getDay();
            const available = ovr ? !!ovr.available : weekdays.includes(wd);
            if (!available) {
              return { success: false, error: `${reqStaff.name ?? "担当"}さんはその日はご予約を受け付けていません。出勤日からお選びください。` };
            }
            // 担当をそのスタッフに確定（クライアント未設定でも確実に紐づける）
            staffId = reqStaff.id as string;
            staffName = (reqStaff.name as string) ?? staffName;
          }
        }
      }

      // ── LINE 経由の家族選択 ──
      // /reserve に lt トークン経由で来たユーザーは ball_line_uid cookie を持つ。
      // フォームから customerId が来たら、その customer が cookie の line_user_id に紐付いているかを検証。
      if (requestedCustomerId) {
        const lineUid = await getLineUidFromCookie();
        if (lineUid) {
          const { data: link } = await adminDb
            .from("customer_line_links")
            .select("customer_id")
            .eq("line_user_id", lineUid)
            .eq("customer_id", requestedCustomerId)
            .eq("clinic_id", PUBLIC_CLINIC_ID)
            .maybeSingle();
          if (link) {
            const { data: cust } = await adminDb
              .from("customers")
              .select("id, name, booking_suspended")
              .eq("id", requestedCustomerId)
              .eq("clinic_id", PUBLIC_CLINIC_ID)
              .maybeSingle();
            if (cust) {
              if (cust.booking_suspended) {
                return { success: false, error: "現在、オンライン予約のご利用が停止されています。お電話またはLINEにてお問い合わせください。" };
              }
              customerId = cust.id;
            }
          }
        }
      }

      // ── 通常の顧客照合（customerId 未指定 or 検証失敗時） ──
      // LINE紐づけ済み or 顧客DB登録済みなら予約可能。
      // 電話番号で照合 → 名前で照合 → 未登録ならアンケートへ誘導。
      if (!customerId && phone) {
        const { data: existing } = await adminDb
          .from("customers")
          .select("id, name, booking_suspended, line_user_id")
          .eq("clinic_id", PUBLIC_CLINIC_ID)
          .eq("phone", phone)
          .maybeSingle();

        if (existing) {
          if (existing.booking_suspended) {
            return { success: false, error: "現在、オンライン予約のご利用が停止されています。お電話またはLINEにてお問い合わせください。" };
          }
          customerId = existing.id;
          if (existing.name !== name) {
            await adminDb.from("customers").update({ name }).eq("id", customerId).eq("clinic_id", PUBLIC_CLINIC_ID);
          }
        } else {
          // 電話番号で見つからない場合 → アンケートへ誘導
          return {
            success: false,
            error: "初めてオンライン予約をご希望の方は、先にアンケートへのご回答をお願いします。",
            requiresQuestionnaire: true,
          };
        }
      } else if (!customerId) {
        // 電話番号なし（再診・名前のみ）→ 名前 + clinic_id で照合
        // まず完全一致。見つからなければスペース/全角半角の揺れを吸収して再照合する
        // （「山内 颯人」と「山内颯人」で別人扱いになる事故を防ぐ）。
        let { data: existingList } = await adminDb
          .from("customers")
          .select("id, name, booking_suspended, line_user_id")
          .eq("name", name)
          .eq("clinic_id", PUBLIC_CLINIC_ID)
          .order("created_at", { ascending: false });

        if (!existingList || existingList.length === 0) {
          // 完全一致なし → 院内の顧客を正規化名で突き合わせる
          const target = normalizeNameForMatch(name);
          const { data: clinicCustomers } = await adminDb
            .from("customers")
            .select("id, name, booking_suspended, line_user_id")
            .eq("clinic_id", PUBLIC_CLINIC_ID);
          existingList = (clinicCustomers ?? []).filter(
            (c) => normalizeNameForMatch(c.name as string) === target,
          );
        }

        if (!existingList || existingList.length === 0) {
          // 名前でも見つからない → アンケートへ誘導
          return {
            success: false,
            error: "初めてオンライン予約をご希望の方は、先にアンケートへのご回答をお願いします。",
            requiresQuestionnaire: true,
          };
        }

        if (existingList.length > 1) {
          // 同名の顧客が複数存在 → 電話番号で特定が必要
          return {
            success: false,
            error: "同じお名前の登録が複数あります。お手数ですが電話番号もご入力いただくか、お電話・LINEにてご予約ください。",
          };
        }

        const existing = existingList[0];
        if (existing.booking_suspended) {
          return { success: false, error: "現在、オンライン予約のご利用が停止されています。お電話またはLINEにてお問い合わせください。" };
        }
        // LINE未紐づけ かつ 顧客DB登録済み → 予約は通す（スタッフが手動管理）
        customerId = existing.id;
      }

      if (!customerId) {
        // どのフローでも customer が確定しなかった（家族選択トークン期限切れ等の保険）
        return { success: false, error: "ご予約者の情報が確認できませんでした。お手数ですがお名前と電話番号を再度ご入力ください。" };
      }

      // ── LINE 連携状況と電話下4桁を取得（完了画面の「LINE連携のお願い」ポップアップ用） ──
      // 連携済みなら出さない。未連携なら下4桁を送ってもらって紐付けを促す。
      let lineLinked = false;
      let phoneLast4: string | null = null;
      {
        const { data: cust } = await adminDb
          .from("customers")
          .select("phone, line_user_id")
          .eq("id", customerId)
          .eq("clinic_id", PUBLIC_CLINIC_ID)
          .maybeSingle();
        const digits = (cust?.phone ?? "").replace(/\D/g, "");
        phoneLast4 = digits.length >= 4 ? digits.slice(-4) : null;
        if (cust?.line_user_id) {
          lineLinked = true;
        } else {
          const { count } = await adminDb
            .from("customer_line_links")
            .select("id", { count: "exact", head: true })
            .eq("customer_id", customerId)
            .eq("clinic_id", PUBLIC_CLINIC_ID);
          lineLinked = (count ?? 0) > 0;
        }
      }

      const startDateTimeStr = `${rawDate}T${time}:00+09:00`;
      // ご本人が「院に確認済み」として別日重複の予約を続行したか
      const confirmedExisting = formData.get("confirmedExisting") === "true";

      // ── 重複予約チェック ──
      // 同じ日に予約がある    → ブロックして LINE へ誘導（二重予約防止）
      // 別の日に予約がある    → 警告し、ご本人が「院に確認済み」とした場合のみ通す（+オーナー通知）
      const nowIso = new Date().toISOString();
      const { data: existingAppts } = await adminDb
        .from("appointments")
        .select("id, start_time, status")
        .eq("clinic_id", PUBLIC_CLINIC_ID)
        .eq("customer_id", customerId)
        .in("status", ["pending", "confirmed", "waiting"])
        .gte("start_time", nowIso)
        .order("start_time", { ascending: true });

      const toJstDate = (iso: string) =>
        new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }); // YYYY-MM-DD
      const toJstTime = (iso: string) =>
        new Date(iso).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });

      let hasOtherDayDuplicate = false;
      let otherDayInfo = "";
      if (existingAppts && existingAppts.length > 0) {
        const sameDay = existingAppts.find((a) => toJstDate(a.start_time) === rawDate);
        if (sameDay) {
          // 同じ日の重複 → ブロックして LINE へ誘導
          return {
            success: false,
            duplicate: "sameday",
            error: "選択された日には、すでにご予約をいただいております。お時間の変更・ご相談はLINEのメッセージよりお問い合わせください。",
          };
        }
        // 別の日にのみ予約がある場合
        const other = existingAppts[0];
        hasOtherDayDuplicate = true;
        otherDayInfo = `${toJstDate(other.start_time)} ${toJstTime(other.start_time)}`;
        if (!confirmedExisting) {
          return {
            success: false,
            duplicate: "otherday",
            existingInfo: otherDayInfo,
            error: "すでに別の日にご予約があります。",
          };
        }
        // confirmedExisting === true → 院に確認済みとして続行（予約成立後にオーナーへ通知）
      }

      // 予約枠の定員チェック（必ず自院のみで判定）
      const { data: existingApps } = await adminDb
        .from("appointments")
        .select("id")
        .eq("clinic_id", DEFAULT_CLINIC_ID)
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

      // コースが選択されていればその所要時間、なければ初診60分/再診30分
      const durationMinutes = courseDurationStr
        ? Number(courseDurationStr)
        : isFirstVisit ? 60 : 30;
      const jstDate = new Date(startDateTimeStr);
      const endDate = new Date(jstDate.getTime() + durationMinutes * 60000);
      const endDateTimeStr = endDate.toISOString();

      // ── 個室の重複チェック ──
      // 同じ room_id で時間帯が重複するキャンセル以外の予約があればブロック
      if (roomId && !isCapacityFull) {
        const { data: roomConflict } = await adminDb
          .from("appointments")
          .select("id")
          .eq("clinic_id", DEFAULT_CLINIC_ID)
          .eq("room_id", roomId)
          .neq("status", "cancelled")
          .lt("start_time", endDateTimeStr)   // 既存の開始 < 新規の終了
          .gt("end_time", startDateTimeStr)   // 既存の終了 > 新規の開始
          .limit(1);
        if (roomConflict && roomConflict.length > 0) {
          return { success: false, error: "選択された個室はその時間帯すでに使用中です。別のお部屋または時間帯をお選びください。" };
        }
      }

      // ── スタッフの重複チェック ──
      // 指名スタッフが同一時間帯に別予約を持つ場合はブロック
      if (staffId && !isCapacityFull) {
        const { data: staffConflict } = await adminDb
          .from("appointments")
          .select("id")
          .eq("clinic_id", DEFAULT_CLINIC_ID)
          .eq("staff_id", staffId)
          .neq("status", "cancelled")
          .lt("start_time", endDateTimeStr)
          .gt("end_time", startDateTimeStr)
          .limit(1);
        if (staffConflict && staffConflict.length > 0) {
          return { success: false, error: "ご指名のスタッフはその時間帯に別のご予約が入っています。他の担当者または時間帯をお選びください。" };
        }
      }

      const { error: appointmentErr, data: appointmentData } = await adminDb
        .from("appointments")
        .insert([{
          customer_id: customerId,
          start_time: startDateTimeStr,
          end_time: endDateTimeStr,
          memo: symptoms,
          is_first_visit: isFirstVisit,
          status: finalStatus,
          clinic_id: DEFAULT_CLINIC_ID,
          ...(courseId ? { course_id: courseId, course_name: courseName } : {}),
          ...(staffId ? { staff_id: staffId, staff_name: staffName } : {}),
          ...(roomId ? { room_id: roomId, room_name: roomName } : {}),
        }])
        .select()
        .single();

      if (appointmentErr || !appointmentData) {
        console.error("Appointment insertion error:", appointmentErr);
        return { success: false, error: "予約の登録に失敗しました。時間をおいて再度お試しいただくか、お電話・LINEにてご予約ください。" };
      }
      
      const reservationNumber = appointmentData.id.split('-')[0].toUpperCase();
        await notifyOwner(name, phone, rawDate, time, visitType, symptoms, reservationNumber, isCapacityFull, courseName, staffName);
        // 別日の既存予約がある状態で、ご本人が「院に確認済み」として追加予約した場合はオーナーに注意喚起
        if (hasOtherDayDuplicate && confirmedExisting) {
          await pushLineToOwners(
            PUBLIC_CLINIC_ID,
            `⚠️【複数予約の確認】${name}様は既存のご予約（${otherDayInfo}）がある状態で、ご本人が「院に確認済み」として追加予約を取られました。\n新規: ${rawDate} ${time}\n予約番号: ${reservationNumber}`,
          );
        }
  return { success: true, isWaiting: isCapacityFull, reservationNumber, lineLinked, phoneLast4 };
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
    return { success: false, error: "エラーが発生しました。お手数ですが、お電話またはLINEにてご予約ください。" };
  }
}

