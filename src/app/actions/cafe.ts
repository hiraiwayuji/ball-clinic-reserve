"use server";

import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";
import { pushLineToOwners, sendEmailToOwners } from "@/lib/admin-notify";
import { getLineUidFromCookie } from "@/app/actions/family-line";
import { resolveBookingCustomer } from "@/lib/booking-customer";
import { isDateWithinAllowedRange, isTimeSlotWithinTwoHours } from "@/lib/time-slots";
import {
  getCafeSlots,
  cafeOccupancyRange,
  type CafeSlot,
} from "@/lib/cafe-slots";
import type { CafeBusinessHours } from "@/app/actions/publicSettings";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { unstable_noStore as noStore } from "next/cache";

const DEFAULT_CLINIC_ID = PUBLIC_CLINIC_ID;
const CAFE_DEPARTMENT = "カフェ";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, {
    global: { fetch: (u, o) => fetch(u, { ...o, cache: "no-store" }) },
  });
}

/** ISO 文字列を JST の「その日の分（0-1439）」に変換。カフェは日跨ぎしない前提。 */
function isoToJstMinutes(iso: string): number {
  const t = new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }); // "HH:MM"
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export type CafeSeatType = {
  id: string;
  name: string;
  description: string | null;
  max_party_size: number | null;
  inventory_count: number | null;
  min_party_size: number | null;
  allow_children_exception: boolean;
  sort_order: number;
};

export type CafeConfig = {
  hours: CafeBusinessHours | null;
  seatCapacity: number | null;
  seatTypes: CafeSeatType[];
};

/** カフェ予約に必要な公開設定（営業時間・総席数・席種一覧）をまとめて取得。 */
export async function getCafeConfig(): Promise<CafeConfig> {
  const admin = getAdminSupabase();
  if (!admin) return { hours: null, seatCapacity: null, seatTypes: [] };

  const [{ data: settings }, { data: courses }] = await Promise.all([
    admin
      .from("clinic_settings")
      .select("cafe_business_hours, cafe_seat_capacity")
      .eq("id", DEFAULT_CLINIC_ID)
      .maybeSingle(),
    admin
      .from("reservation_courses")
      .select("id, name, description, max_party_size, inventory_count, min_party_size, allow_children_exception, sort_order")
      .eq("clinic_id", DEFAULT_CLINIC_ID)
      .eq("department", CAFE_DEPARTMENT)
      .eq("capacity_type", "seating")
      .eq("is_active", true)
      .order("sort_order")
      .order("created_at"),
  ]);

  return {
    hours: (settings?.cafe_business_hours as CafeBusinessHours | null) ?? null,
    seatCapacity: typeof settings?.cafe_seat_capacity === "number" ? settings.cafe_seat_capacity : null,
    seatTypes: (courses ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description ?? null,
      max_party_size: c.max_party_size ?? null,
      inventory_count: c.inventory_count ?? null,
      min_party_size: c.min_party_size ?? null,
      allow_children_exception: Boolean(c.allow_children_exception),
      sort_order: c.sort_order ?? 0,
    })),
  };
}

export type CafeSlotAvailability = CafeSlot & {
  /** 席種ごとの残在庫（courseId -> 残り卓/席数） */
  seatRemaining: Record<string, number>;
  /** 総席の残数（cafe_seat_capacity - その時間に重なる予約人数合計）。NULL=総枠制限なし */
  totalRemaining: number | null;
};

/**
 * 指定日のカフェ各スロットの空き状況を返す。
 * 既存のカフェ予約（department=カフェ, 非キャンセル）との占有重なりで在庫を減算する。
 */
export async function getCafeAvailability(dateStr: string): Promise<CafeSlotAvailability[]> {
  noStore();
  const admin = getAdminSupabase();
  if (!admin) return [];

  const config = await getCafeConfig();
  if (!config.hours) return [];

  const date = new Date(`${dateStr}T00:00:00+09:00`);
  const slots = getCafeSlots(date, config.hours);
  if (slots.length === 0) return [];

  // その日のカフェ予約を取得（占有判定用）
  const startOfDay = `${dateStr}T00:00:00+09:00`;
  const endOfDay = `${dateStr}T23:59:59+09:00`;
  const { data: appts } = await admin
    .from("appointments")
    .select("start_time, end_time, course_id, party_size")
    .eq("clinic_id", DEFAULT_CLINIC_ID)
    .eq("department", CAFE_DEPARTMENT)
    .neq("status", "cancelled")
    .gte("start_time", startOfDay)
    .lte("start_time", endOfDay);

  const existing = (appts ?? []).map((a) => ({
    startMin: isoToJstMinutes(a.start_time),
    endMin: a.end_time ? isoToJstMinutes(a.end_time) : isoToJstMinutes(a.start_time) + 90,
    courseId: a.course_id as string | null,
    party: typeof a.party_size === "number" ? a.party_size : 1,
  }));

  return slots.map((slot) => {
    const range = cafeOccupancyRange(date, slot.time, config.hours);
    const seatRemaining: Record<string, number> = {};
    let usedSeats = 0;

    for (const seat of config.seatTypes) {
      let usedCount = 0;
      if (range) {
        for (const a of existing) {
          const overlaps = a.startMin < range.endMin && a.endMin > range.startMin;
          if (overlaps && a.courseId === seat.id) usedCount += 1;
        }
      }
      seatRemaining[seat.id] =
        seat.inventory_count == null ? 99 : Math.max(0, seat.inventory_count - usedCount);
    }

    if (range) {
      for (const a of existing) {
        const overlaps = a.startMin < range.endMin && a.endMin > range.startMin;
        if (overlaps) usedSeats += a.party;
      }
    }

    return {
      ...slot,
      seatRemaining,
      totalRemaining: config.seatCapacity == null ? null : Math.max(0, config.seatCapacity - usedSeats),
    };
  });
}

/** 個室等の予約条件を満たすか判定（人数・子連れ例外）。 */
function partyMeetsSeatRule(
  seat: CafeSeatType,
  partySize: number,
  hasChildren: boolean,
): { ok: true } | { ok: false; error: string } {
  if (seat.max_party_size != null && partySize > seat.max_party_size) {
    return { ok: false, error: `「${seat.name}」は${seat.max_party_size}名様までです。人数または席種をご確認ください。` };
  }
  if (seat.min_party_size != null && partySize < seat.min_party_size) {
    const childOk = seat.allow_children_exception && hasChildren;
    if (!childOk) {
      return {
        ok: false,
        error: `「${seat.name}」は${seat.min_party_size}名様以上${seat.allow_children_exception ? "（またはお子様連れ）" : ""}でご利用いただけます。`,
      };
    }
  }
  return { ok: true };
}

async function notifyOwnerCafe(
  name: string,
  phone: string,
  rawDate: string,
  time: string,
  seatName: string,
  partySize: number,
  hasChildren: boolean,
  symptoms: string,
  reservationNumber: string,
) {
  const childLine = hasChildren ? "\nお子様連れ: はい" : "";
  const messageText = `☕【カフェ新規予約】\n\nお名前: ${name}\n日時: ${rawDate} ${time}\n席種: ${seatName}\n人数: ${partySize}名${childLine}\n電話: ${phone || "未入力"}\nご要望: ${symptoms || "なし"}\n予約番号: ${reservationNumber}`;
  await Promise.all([
    pushLineToOwners(PUBLIC_CLINIC_ID, messageText),
    sendEmailToOwners(PUBLIC_CLINIC_ID, `☕カフェ予約 ${name}様 ${rawDate} ${time}（${partySize}名）`, messageText),
  ]);
}

export async function createCafeReservation(formData: FormData) {
  try {
    const rawDate = formData.get("date") as string;
    const time = formData.get("time") as string;
    const seatTypeId = (formData.get("seatTypeId") as string) || "";
    const partySize = parseInt((formData.get("partySize") as string) || "0", 10);
    const hasChildren = formData.get("hasChildren") === "true";
    const name = (formData.get("name") as string) || "";
    const rawPhone = (formData.get("phone") as string) || "";
    const phone = rawPhone ? rawPhone.trim().replace(/[-\s]/g, "") : "";
    const visitType = (formData.get("visitType") as string) || "";
    const symptoms = (formData.get("symptoms") as string) || "";
    const requestedCustomerId = (formData.get("customerId") as string) || null;

    if (!rawDate || !time || !seatTypeId || !name || !partySize) {
      return { success: false, error: "必須項目が不足しています" };
    }
    if (partySize < 1) {
      return { success: false, error: "ご人数をご確認ください" };
    }
    const isFirstVisit = visitType === "new";
    if (isFirstVisit && !phone) {
      return { success: false, error: "初めての方は電話番号が必須です" };
    }

    const reservationDate = new Date(`${rawDate}T00:00:00+09:00`);
    if (!isDateWithinAllowedRange(reservationDate)) {
      return { success: false, error: "1ヶ月より先の予約はできません。" };
    }
    if (isTimeSlotWithinTwoHours(rawDate, time)) {
      return { success: false, error: "直前（2時間以内）のご予約はお電話またはLINEにてお問い合わせください。" };
    }

    const admin = getAdminSupabase();
    if (!admin) {
      // デモモード
      await new Promise((r) => setTimeout(r, 600));
      return { success: true, reservationNumber: Math.random().toString(36).slice(2, 8).toUpperCase() };
    }

    const config = await getCafeConfig();
    if (!config.hours) {
      return { success: false, error: "現在カフェのご予約を受け付けておりません。" };
    }

    const seat = config.seatTypes.find((s) => s.id === seatTypeId);
    if (!seat) {
      return { success: false, error: "選択された席種が見つかりません。最初からやり直してください。" };
    }

    // 席種の人数・個室条件
    const rule = partyMeetsSeatRule(seat, partySize, hasChildren);
    if (!rule.ok) return { success: false, error: rule.error };

    // 営業帯チェック＋占有区間
    const range = cafeOccupancyRange(reservationDate, time, config.hours);
    if (!range) {
      return { success: false, error: "選択された時間はカフェの営業時間外です。別のお時間をお選びください。" };
    }

    // 顧客照合（サロンと共有台帳）
    const lineUid = await getLineUidFromCookie();
    const resolved = await resolveBookingCustomer(admin, {
      clinicId: PUBLIC_CLINIC_ID,
      name,
      phone,
      requestedCustomerId,
      lineUid,
    });
    if (!resolved.ok) {
      return { success: false, error: resolved.error, requiresQuestionnaire: (resolved as { requiresQuestionnaire?: boolean }).requiresQuestionnaire };
    }
    const customerId = resolved.customerId;

    // ── 在庫の再チェック（タッチ差防止） ──
    const startOfDay = `${rawDate}T00:00:00+09:00`;
    const endOfDay = `${rawDate}T23:59:59+09:00`;
    const { data: appts } = await admin
      .from("appointments")
      .select("start_time, end_time, course_id, party_size")
      .eq("clinic_id", DEFAULT_CLINIC_ID)
      .eq("department", CAFE_DEPARTMENT)
      .neq("status", "cancelled")
      .gte("start_time", startOfDay)
      .lte("start_time", endOfDay);

    let usedThisSeat = 0;
    let usedSeats = 0;
    for (const a of appts ?? []) {
      const aStart = isoToJstMinutes(a.start_time);
      const aEnd = a.end_time ? isoToJstMinutes(a.end_time) : aStart + 90;
      const overlaps = aStart < range.endMin && aEnd > range.startMin;
      if (!overlaps) continue;
      if (a.course_id === seat.id) usedThisSeat += 1;
      usedSeats += typeof a.party_size === "number" ? a.party_size : 1;
    }

    if (seat.inventory_count != null && usedThisSeat >= seat.inventory_count) {
      return { success: false, error: "申し訳ありません、その時間の同席種は満席になりました。別のお時間または席種をお選びください。" };
    }
    if (config.seatCapacity != null && usedSeats + partySize > config.seatCapacity) {
      return { success: false, error: "申し訳ありません、その時間は満席です。別のお時間をお選びください。" };
    }

    // ── 予約作成 ──
    const startDateTimeStr = `${rawDate}T${time}:00+09:00`;
    const durationMin = range.endMin - range.startMin;
    const endDate = new Date(new Date(startDateTimeStr).getTime() + durationMin * 60000);
    const endDateTimeStr = endDate.toISOString();

    const { data: appointmentData, error: appointmentErr } = await admin
      .from("appointments")
      .insert([{
        customer_id: customerId,
        start_time: startDateTimeStr,
        end_time: endDateTimeStr,
        memo: symptoms,
        is_first_visit: isFirstVisit,
        status: "pending",
        clinic_id: DEFAULT_CLINIC_ID,
        department: CAFE_DEPARTMENT,
        party_size: partySize,
        course_id: seat.id,
        course_name: seat.name,
      }])
      .select()
      .single();

    if (appointmentErr || !appointmentData) {
      console.error("[createCafeReservation] insert error:", appointmentErr);
      return { success: false, error: "予約の登録に失敗しました。お手数ですがお電話またはLINEにてご予約ください。" };
    }

    const reservationNumber = appointmentData.id.split("-")[0].toUpperCase();
    await notifyOwnerCafe(name, phone, rawDate, time, seat.name, partySize, hasChildren, symptoms, reservationNumber);
    return { success: true, reservationNumber };
  } catch (err) {
    console.error("[createCafeReservation]", err);
    return { success: false, error: "エラーが発生しました。お手数ですが、お電話またはLINEにてご予約ください。" };
  }
}
