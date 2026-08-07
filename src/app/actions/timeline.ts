"use server";

import { checkAdminAuth } from "./auth";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}

export type TimelineStaff = {
  id: string;
  name: string;
  sort_order: number;
  monthly_visit_target?: number | null;
  /** 退職などで「予約を受ける最終日」。この日を過ぎた日付では予約表のレーンに出さない */
  booking_until?: string | null;
};

export type TimelineAppointment = {
  id: string;
  clinic_id: string;          // 編集ダイアログで「前回来院日取得」のテナント絞り込みに必要
  start_time: string;
  end_time: string | null;
  status: string;
  checkin_status: string | null;
  is_first_visit: boolean;
  memo: string | null;
  course_id: string | null;
  course_name: string | null;
  staff_id: string | null;
  staff_name: string | null;
  room_id: string | null;      // 編集ダイアログで個室選択に必要
  room_name: string | null;
  series_id: string | null;    // 編集ダイアログで「以降の繰り返し含めて」操作に必要
  cancel_kind: string | null;  // キャンセル仕分け（unexcused/approved/clinic_reason）。薄い表示のラベルに使う
  no_show: boolean;            // 無断キャンセル（未来院）フラグ
  cancel_hidden: boolean;      // 薄い表示をカレンダーから隠すフラグ（削除ではない）
  customer_id: string | null;
  customer_name: string | null;
  medical_record_number: string | null;
  additional_courses: { course_id: string; course_name: string }[] | null;
  additional_staff: { staff_id: string; staff_name: string }[] | null;
  /** 部門（'サロン' | 'カフェ' 等）。部門なし院は null */
  department: string | null;
  /** 席予約（カフェ）の人数。施術予約は null */
  party_size: number | null;
};

/** 1日ぶんのタイムテーブル。週表示ではこれが7個並ぶ。 */
export type TimelineDay = {
  /** "yyyy-MM-dd"（JST） */
  date: string;
  appointments: TimelineAppointment[];
  /** 表示レンジ。土曜は別設定を持つので日ごとに変わりうる */
  scheduleStartHour: number;
  scheduleEndHour: number;
  /** "2026-07"。月次実績バッジの参照キー（週が月をまたぐため日ごとに持つ） */
  monthKey: string;
  monthLabel: string; // "7月" など
  /** 休診日（clinic_holidays に登録された日 or 定休曜日）。タイムテーブルで一目で分かるようにする */
  isHoliday: boolean;
};

export type TimelineData = {
  staff: TimelineStaff[];
  slotMinutes: number;
  /** 期間内の日を古い順に。1日表示なら要素1つ */
  days: TimelineDay[];
  /**
   * 月次の予約件数（status != cancelled）を「月 → staff_id」で集計。
   * 週が月をまたいでも各日が自分の月の実績を出せるように月キーで持つ。
   * 担当未設定分は __unassigned__ キー。
   */
  staffMonthCounts: Record<string, Record<string, number>>;
};

const JST_MS = 9 * 3600 * 1000;

/** ISO文字列 → JSTでの "yyyy-MM-dd" */
function jstDateKey(iso: string): string {
  return new Date(new Date(iso).getTime() + JST_MS).toISOString().slice(0, 10);
}

/** "yyyy-MM-dd" の from〜to（両端含む）を日付文字列の配列にする */
function eachDateStr(fromDateStr: string, toDateStr: string): string[] {
  const out: string[] = [];
  // 正午起点で進めることで、DST等の影響を受けずに日付だけを繰り上げる
  let cur = new Date(`${fromDateStr}T12:00:00Z`);
  const last = new Date(`${toDateStr}T12:00:00Z`);
  // 暴走防止（最大62日）
  for (let i = 0; cur <= last && i < 62; i++) {
    out.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 24 * 3600 * 1000);
  }
  return out;
}

const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 20;

// "HH:MM" → 時間（端数は切り上げ）
function parseHourCeil(timeStr: string | null | undefined, fallback: number): number {
  if (!timeStr) return fallback;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  return Math.min(24, h + (min > 0 ? 1 : 0));
}

// "HH:MM" → 時間（端数は切り捨て）
function parseHourFloor(timeStr: string | null | undefined, fallback: number): number {
  if (!timeStr) return fallback;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  return parseInt(m[1], 10);
}

/**
 * 期間（両端含む）のタイムテーブルを1回で取得する。
 *
 * 1日表示でも週表示でもこの1本を使う。日を1つずらすたびに取り直していた頃は
 * 「当月まるごとの件数集計」まで毎回引き直していて体感が重かったので、
 * 週ぶんをまとめて1往復で取る形にしている（週内の日移動は再取得ゼロ）。
 */
export async function getTimelineRange(
  fromDateStr: string,
  toDateStr: string,
): Promise<{ success: boolean; data?: TimelineData; error?: string }> {
  try {
    const { clinicId } = await checkAdminAuth();
    const sb = getAdminSupabase();
    if (!sb) return { success: false, error: "service role unavailable" };

    const dateStrs = eachDateStr(fromDateStr, toDateStr);
    if (dateStrs.length === 0) return { success: false, error: "期間が不正です" };
    const firstDate = dateStrs[0];
    const lastDate = dateStrs[dateStrs.length - 1];

    const rangeStart = `${firstDate}T00:00:00+09:00`;
    const rangeEnd = `${lastDate}T23:59:59+09:00`;

    // 月次件数は「期間がまたぐ月」をまとめて1回で取る（週が月をまたぐケースに対応）
    const [fy, fm] = firstDate.split("-").map((s) => parseInt(s, 10));
    const [ly, lm] = lastDate.split("-").map((s) => parseInt(s, 10));
    const monthStart = `${fy}-${String(fm).padStart(2, "0")}-01T00:00:00+09:00`;
    const lastDayOfMonth = new Date(ly, lm, 0).getDate();
    const monthEnd = `${ly}-${String(lm).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}T23:59:59+09:00`;

    const [staffRes, aptRes, monthAptRes, settingsRes, holidayRes] = await Promise.all([
      sb.from("reservation_staff")
        .select("id, name, sort_order, monthly_visit_target, booking_until")
        .eq("clinic_id", clinicId)
        .eq("is_active", true)
        .eq("show_in_timeline", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      // キャンセル済みも取得する（管理画面に薄く「○○様 キャンセル」と出すため）。
      // 患者側の空き状況・月間実績カウントには影響しない。
      sb.from("appointments")
        .select("id, start_time, end_time, status, checkin_status, is_first_visit, memo, course_id, course_name, staff_id, staff_name, room_id, room_name, series_id, cancel_kind, no_show, cancel_hidden, customer_id, additional_courses, additional_staff, department, party_size, customers(name, medical_record_number)")
        .eq("clinic_id", clinicId)
        .gte("start_time", rangeStart)
        .lte("start_time", rangeEnd)
        .order("start_time", { ascending: true }),
      // 月次の予約（件数集計のため staff_id と additional_staff を取得）
      // 担当が複数人の予約は、各スタッフの実績にそれぞれ +1 する
      sb.from("appointments")
        .select("staff_id, additional_staff, start_time")
        .eq("clinic_id", clinicId)
        .neq("status", "cancelled")
        .gte("start_time", monthStart)
        .lte("start_time", monthEnd),
      sb.from("clinic_settings")
        .select("slot_duration_minutes, business_open_weekday, business_close_weekday, business_open_saturday, business_close_saturday, admin_timeline_open_weekday, admin_timeline_close_weekday, admin_timeline_open_saturday, admin_timeline_close_saturday, closed_weekdays")
        .eq("id", clinicId)
        .maybeSingle(),
      // 休診日（臨時）。タイムテーブルで斜線＋バッジ表示するため
      sb.from("clinic_holidays")
        .select("date")
        .eq("clinic_id", clinicId)
        .gte("date", rangeStart.slice(0, 10))
        .lte("date", rangeEnd.slice(0, 10)),
    ]);

    if (staffRes.error) return { success: false, error: staffRes.error.message };
    if (aptRes.error) return { success: false, error: aptRes.error.message };

    const staff: TimelineStaff[] = (staffRes.data ?? []).map(s => ({
      id: s.id,
      name: s.name,
      sort_order: s.sort_order ?? 0,
      monthly_visit_target: s.monthly_visit_target ?? null,
      booking_until: (s as { booking_until?: string | null }).booking_until ?? null,
    }));

    // 「隠す」にしたキャンセルはタイムテーブルには出さない（予約カレンダー側のトグルでのみ再表示できる）
    const visibleRows = (aptRes.data ?? []).filter(
      (a: any) => !(a.status === "cancelled" && a.cancel_hidden),
    );
    const appointments: TimelineAppointment[] = visibleRows.map(a => {
      const cust = Array.isArray(a.customers) ? a.customers[0] : (a.customers as any);
      return {
        id: a.id,
        clinic_id: clinicId,
        start_time: a.start_time,
        end_time: a.end_time ?? null,
        status: a.status,
        checkin_status: a.checkin_status ?? null,
        is_first_visit: !!a.is_first_visit,
        memo: a.memo ?? null,
        course_id: a.course_id ?? null,
        course_name: a.course_name ?? null,
        staff_id: a.staff_id ?? null,
        staff_name: a.staff_name ?? null,
        room_id: (a as any).room_id ?? null,
        room_name: a.room_name ?? null,
        series_id: (a as any).series_id ?? null,
        cancel_kind: (a as any).cancel_kind ?? null,
        no_show: !!(a as any).no_show,
        cancel_hidden: !!(a as any).cancel_hidden,
        customer_id: a.customer_id ?? null,
        customer_name: cust?.name ?? null,
        medical_record_number: cust?.medical_record_number ?? null,
        additional_courses: (a.additional_courses ?? null) as { course_id: string; course_name: string }[] | null,
        additional_staff:   (a.additional_staff   ?? null) as { staff_id:  string; staff_name:  string }[] | null,
        department: (a as any).department ?? null,
        party_size: (a as any).party_size ?? null,
      };
    });

    const slotV = settingsRes.data?.slot_duration_minutes;
    const slotMinutes = (slotV === 10 || slotV === 15 || slotV === 20 || slotV === 30) ? slotV : 30;

    // 予約を JST の日付ごとに振り分ける
    const aptsByDate = new Map<string, TimelineAppointment[]>();
    for (const a of appointments) {
      const key = jstDateKey(a.start_time);
      if (!aptsByDate.has(key)) aptsByDate.set(key, []);
      aptsByDate.get(key)!.push(a);
    }

    // 月次件数を「月 → staff_id」で集計（メイン担当 + 追加担当の各人に +1）
    const staffMonthCounts: Record<string, Record<string, number>> = {};
    (monthAptRes.data ?? []).forEach((row: any) => {
      const monthKey = jstDateKey(row.start_time).slice(0, 7);
      if (!staffMonthCounts[monthKey]) staffMonthCounts[monthKey] = {};
      const bucket = staffMonthCounts[monthKey];
      const targetIds = new Set<string>();
      targetIds.add(row.staff_id ?? "__unassigned__");
      const add = row.additional_staff;
      if (Array.isArray(add)) {
        for (const s of add) {
          if (s?.staff_id) targetIds.add(s.staff_id);
        }
      }
      for (const key of targetIds) {
        bucket[key] = (bucket[key] ?? 0) + 1;
      }
    });

    // 休診日セット（臨時休診＋定休曜日）
    const holidaySet = new Set<string>(
      (holidayRes?.data ?? []).map((h: { date: string }) => String(h.date).slice(0, 10)),
    );
    const closedWeekdays = new Set<number>(
      String(settingsRes.data?.closed_weekdays ?? "")
        .split(",").map((x) => x.trim()).filter(Boolean).map(Number),
    );

    const days: TimelineDay[] = dateStrs.map((dateStr) => {
      // 曜日判定（土曜は別の営業時間設定を使う）
      const isSaturday = new Date(`${dateStr}T12:00:00+09:00`).getDay() === 6;
      // 表示範囲は「管理画面タイムテーブル専用設定 (admin_timeline_*)」を最優先、
      // 設定が無ければ患者LP用の営業時間 (business_*) にフォールバック。
      const openStr = isSaturday
        ? (settingsRes.data?.admin_timeline_open_saturday ?? settingsRes.data?.business_open_saturday)
        : (settingsRes.data?.admin_timeline_open_weekday ?? settingsRes.data?.business_open_weekday);
      const closeStr = isSaturday
        ? (settingsRes.data?.admin_timeline_close_saturday ?? settingsRes.data?.business_close_saturday)
        : (settingsRes.data?.admin_timeline_close_weekday ?? settingsRes.data?.business_close_weekday);
      const monthKey = dateStr.slice(0, 7);
      const dow = new Date(`${dateStr}T12:00:00+09:00`).getDay();
      return {
        date: dateStr,
        appointments: aptsByDate.get(dateStr) ?? [],
        scheduleStartHour: parseHourFloor(openStr, DEFAULT_START_HOUR),
        scheduleEndHour: parseHourCeil(closeStr, DEFAULT_END_HOUR),
        monthKey,
        monthLabel: `${parseInt(monthKey.slice(5), 10)}月`,
        isHoliday: holidaySet.has(dateStr) || closedWeekdays.has(dow),
      };
    });

    return {
      success: true,
      data: { staff, slotMinutes, days, staffMonthCounts },
    };
  } catch (err: any) {
    console.error("getTimelineRange error:", err);
    return { success: false, error: err?.message ?? "unknown" };
  }
}
