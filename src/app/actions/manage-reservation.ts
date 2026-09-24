"use server";

import { createClient } from "@supabase/supabase-js";
import { PUBLIC_CLINIC_ID } from "@/lib/default-clinic-id";
import { getLineUidFromCookie } from "@/app/actions/family-line";
import { pushLineToOwners } from "@/lib/admin-notify";
import { isDateWithinAllowedRange, isTimeSlotWithinTwoHours, isTodayJST } from "@/lib/time-slots";
import { getBookingHorizonDays, getCurrentSlotDuration } from "@/app/actions/clinic-slot";
import { getSpecialDayForDate } from "@/app/actions/special-days";
import { getStaffSchedulesForDate } from "@/lib/staff-day-schedules";
import { offDutyStaffAt } from "@/lib/staff-availability";
import { getDailyAvailability } from "@/app/actions/reserve";

const CLINIC_ID = PUBLIC_CLINIC_ID;

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type MyReservation = {
  id: string;
  customerName: string;
  startTime: string; // ISO
  endTime: string | null;
  courseId: string | null;
  courseName: string | null;
  staffName: string | null;
  status: string;
};

/** cookie の LINE userId に紐づく顧客の「今後の予約」を返す（本人確認の土台）。 */
async function getLinkedCustomerIds(sb: ReturnType<typeof getServiceClient>): Promise<string[]> {
  if (!sb) return [];
  const lineUid = await getLineUidFromCookie();
  if (!lineUid) return [];
  const { data } = await sb
    .from("customer_line_links")
    .select("customer_id")
    .eq("line_user_id", lineUid)
    .eq("clinic_id", CLINIC_ID);
  return (data ?? []).map((r: { customer_id: string }) => r.customer_id);
}

export async function getMyUpcomingReservations(): Promise<{ ok: boolean; reservations: MyReservation[]; error?: string }> {
  const sb = getServiceClient();
  if (!sb) return { ok: false, reservations: [], error: "server unavailable" };
  const customerIds = await getLinkedCustomerIds(sb);
  if (customerIds.length === 0) {
    return { ok: false, reservations: [], error: "LINEからの本人確認ができませんでした。お手数ですがLINEのメニューから開き直してください。" };
  }
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("appointments")
    .select("id, start_time, end_time, course_id, course_name, staff_name, status, customers!inner(name)")
    .eq("clinic_id", CLINIC_ID)
    .in("customer_id", customerIds)
    .in("status", ["pending", "confirmed", "waiting"])
    .gte("start_time", nowIso)
    .order("start_time", { ascending: true });
  if (error) {
    console.error("[manage] getMyUpcomingReservations error:", error.message);
    return { ok: false, reservations: [], error: "予約の取得に失敗しました" };
  }
  const reservations: MyReservation[] = (data ?? []).map((a: any) => {
    const cust = Array.isArray(a.customers) ? a.customers[0] : a.customers;
    return {
      id: a.id,
      customerName: cust?.name ?? "",
      startTime: a.start_time,
      endTime: a.end_time ?? null,
      courseId: a.course_id ?? null,
      courseName: a.course_name ?? null,
      staffName: a.staff_name ?? null,
      status: a.status,
    };
  });
  return { ok: true, reservations };
}

/** 本人の予約か（cookie の LINE に紐づく顧客の予約か）を検証して返す。 */
async function loadOwnedAppointment(sb: NonNullable<ReturnType<typeof getServiceClient>>, appointmentId: string) {
  const customerIds = await getLinkedCustomerIds(sb);
  if (customerIds.length === 0) return null;
  const { data } = await sb
    .from("appointments")
    .select("id, customer_id, start_time, end_time, course_id, staff_id, course_name, customers(name)")
    .eq("id", appointmentId)
    .eq("clinic_id", CLINIC_ID)
    .maybeSingle();
  if (!data || !customerIds.includes(data.customer_id as string)) return null;
  return data as any;
}

export async function cancelMyReservation(appointmentId: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getServiceClient();
  if (!sb) return { ok: false, error: "server unavailable" };
  const apt = await loadOwnedAppointment(sb, appointmentId);
  if (!apt) return { ok: false, error: "ご本人の予約として確認できませんでした。" };

  const { error } = await sb
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", appointmentId)
    .eq("clinic_id", CLINIC_ID);
  if (error) return { ok: false, error: "キャンセルに失敗しました。お手数ですがお電話・LINEでご連絡ください。" };

  const cust = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
  const jst = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  void pushLineToOwners(
    CLINIC_ID,
    `🚫【患者キャンセル】${cust?.name ?? "(患者)"}様\n日時: ${jst(apt.start_time)}${apt.course_name ? `\nメニュー: ${apt.course_name}` : ""}\n（患者さんがLINEからキャンセルされました）`,
  );
  return { ok: true };
}

export async function rescheduleMyReservation(
  appointmentId: string,
  newDate: string, // YYYY-MM-DD
  newTime: string, // HH:mm
): Promise<{ ok: boolean; error?: string }> {
  const sb = getServiceClient();
  if (!sb) return { ok: false, error: "server unavailable" };
  const apt = await loadOwnedAppointment(sb, appointmentId);
  if (!apt) return { ok: false, error: "ご本人の予約として確認できませんでした。" };

  if (!newDate || !newTime) return { ok: false, error: "日付と時間を選んでください。" };
  const horizonDays = await getBookingHorizonDays();
  if (!isDateWithinAllowedRange(new Date(newDate), false, horizonDays)) return { ok: false, error: `${horizonDays}日より先の予約はできません。` };
  if (isTimeSlotWithinTwoHours(newDate, newTime)) return { ok: false, error: "直前（2時間以内）への変更はお電話・LINEでお願いします。" };

  // 臨時営業日（お盆など）：休診・当日予約停止・時短の時間外への変更を弾く。
  // 新規予約（createReservation）と同じルールを、時間変更にも適用する。
  const special = await getSpecialDayForDate(newDate);
  if (special?.closed) return { ok: false, error: "その日は休診です。別の日をお選びください。" };
  if (special?.blockSameDay && isTodayJST(newDate)) return { ok: false, error: "当日のご予約への変更はお電話・LINEでお願いします。" };
  if (special && (special.openTime || special.closeTime)) {
    const toMin = (hm: string) => { const [h, m] = hm.slice(0, 5).split(":").map(Number); return h * 60 + m; };
    const t = toMin(newTime);
    if (special.openTime && t < toMin(special.openTime)) return { ok: false, error: `その日は ${special.openTime} 以降のご予約です。` };
    if (special.closeTime && t >= toMin(special.closeTime)) return { ok: false, error: `その日は ${special.closeTime} までのご予約です。` };
  }

  // 所要時間は元予約を維持。
  // 下限を30分で固定していたため、20分刻みの院（からだ鍼灸整骨院）で
  // 患者さんが日時を変更すると20分の施術が30分に伸びていた。院の枠サイズを下限にする。
  const slotMinutes = await getCurrentSlotDuration();
  const oldStart = new Date(apt.start_time);
  const oldEnd = apt.end_time ? new Date(apt.end_time) : new Date(oldStart.getTime() + slotMinutes * 60000);
  const durationMs = Math.max(slotMinutes * 60000, oldEnd.getTime() - oldStart.getTime());
  const newStartIso = `${newDate}T${newTime}:00+09:00`;
  const newStart = new Date(newStartIso);
  const newEndIso = new Date(newStart.getTime() + durationMs).toISOString();

  const staffId = (apt.staff_id as string | null) ?? null;
  const durationMinutes = Math.max(1, Math.round(durationMs / 60000));

  // 🚨 2026-09-24（からだ 9/24 17:40）と同じ穴をここにも塞ぐ。
  // 日時変更は「他の予約と重なっていないか」しか見ていなかったので、
  // 勤務時間外・休憩中・院ぜんたいの休憩（祝日の休憩など）・対応不可の時間へ動かせてしまった。
  //
  // ① 誰でも受けられるか（定員・院ぜんたいの休憩・受付時間外）は、患者さんの空き表示と
  //    まったく同じ getDailyAvailability で判定する。別の式を書くと「画面では選べるのに
  //    変更できない」「変更だけ抜け道になる」が必ず起きる（判定は1か所に寄せる）。
  //    ただし自分の予約と時間が重なる move（同じ日の隣の枠へずらす等）では、自分自身が
  //    「埋まっている側」に数えられてしまうので使わない。その場合は下の②③で担保する。
  const oldYmd = new Date(apt.start_time).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const overlapsSelf = oldYmd === newDate
    && oldStart.getTime() < new Date(newEndIso).getTime()
    && oldEnd.getTime() > newStart.getTime();
  // 担当未設定の予約は、下の③（担当の勤務時間・レーン）が効かない。
  // 自分と重なる move でも①だけは必ず通す（誤って弾いてもLINEで相談できるほうが安全）。
  if (!overlapsSelf || !staffId) {
    // メニューが削除された昔の予約は courseId を渡さない。
    // getDailyAvailability は自院に無い courseId を「全時刻ふさがり」で返すので、
    // 渡すと何時を選んでも必ず弾かれる（2026-09-24 検品2回目の指摘）。
    let courseIdForCheck = (apt.course_id as string | null) ?? null;
    if (courseIdForCheck) {
      const { data: courseRow } = await sb
        .from("reservation_courses")
        .select("id")
        .eq("id", courseIdForCheck)
        .eq("clinic_id", CLINIC_ID)
        .maybeSingle();
      if (!courseRow) courseIdForCheck = null;
    }
    const blocked = await getDailyAvailability(newDate, courseIdForCheck, { allowWithoutCourse: true });
    if (blocked.includes(newTime)) {
      return {
        ok: false,
        error: "その時間は受け付けておりません（すでに埋まっている・休憩・受付時間外など）。別のお時間をお選びいただくか、LINEからご相談ください。",
      };
    }
  }

  // ② 院ぜんたいの休憩（staff_id なし）と、担当の先生だけの「対応不可」。
  //    ①を通らなかった move でも必ず見る。
  {
    const { data: ngRows } = await sb
      .from("clinic_blocked_slots")
      .select("start_time, end_time, staff_id")
      .eq("clinic_id", CLINIC_ID)
      .eq("date", newDate);
    const toMinLocal = (hm?: string | null) => {
      if (!hm) return null;
      const [h, m] = String(hm).slice(0, 5).split(":").map(Number);
      return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
    };
    const wantStart = toMinLocal(newTime)!;
    const wantEnd = wantStart + durationMinutes;
    const hitNg = (ngRows ?? []).some((b: { start_time?: string | null; end_time?: string | null; staff_id?: string | null }) => {
      // 他の先生だけのNGは、この予約には関係ない（担当未設定の予約には院ぜんたいの休憩だけ効く）
      if (b.staff_id && b.staff_id !== staffId) return false;
      const bs = toMinLocal(b.start_time);
      const be = toMinLocal(b.end_time);
      if (bs === null || be === null) return false;
      return wantStart < be && wantEnd > bs; // 半開区間
    });
    if (hitNg) {
      return {
        ok: false,
        error: "その時間は受け付けておりません（休憩・対応不可の時間です）。別のお時間をお選びいただくか、LINEからご相談ください。",
      };
    }
  }

  // ③ 担当(レーン)があれば、その先生の勤務時間・休憩と、レーンの空き（自分自身は除外）
  if (staffId) {
    const schedules = await getStaffSchedulesForDate(sb, CLINIC_ID, newDate, [staffId]);
    const offDuty = offDutyStaffAt(schedules, newDate, newTime, durationMinutes);
    if (offDuty.has(staffId)) {
      return {
        ok: false,
        error: "ご予約の担当は、その時間は受け付けておりません（勤務時間外・休憩など）。別のお時間をお選びいただくか、LINEからご相談ください。",
      };
    }
    const { data: conf } = await sb
      .from("appointments")
      .select("id")
      .eq("clinic_id", CLINIC_ID)
      .eq("staff_id", staffId)
      .neq("status", "cancelled")
      .neq("id", appointmentId)
      .lt("start_time", newEndIso)
      .gt("end_time", newStartIso)
      .limit(1);
    if (conf && conf.length > 0) {
      return { ok: false, error: "その時間はすでに埋まっています。別のお時間をお選びください。" };
    }
  }

  const { error } = await sb
    .from("appointments")
    .update({ start_time: newStartIso, end_time: newEndIso, status: "pending" })
    .eq("id", appointmentId)
    .eq("clinic_id", CLINIC_ID);
  if (error) {
    // DB排他制約（単一資源の重複）に当たった場合もここに来る
    return { ok: false, error: "その時間は予約できませんでした。別のお時間をお選びください。" };
  }

  const cust = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
  const jst = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  void pushLineToOwners(
    CLINIC_ID,
    `🔁【患者が時間変更】${cust?.name ?? "(患者)"}様\n旧: ${jst(apt.start_time)}\n新: ${jst(newStartIso)}${apt.course_name ? `\nメニュー: ${apt.course_name}` : ""}\n（患者さんがLINEから変更されました）`,
  );
  return { ok: true };
}
