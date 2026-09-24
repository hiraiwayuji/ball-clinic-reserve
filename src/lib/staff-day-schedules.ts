import {
  buildStaffSchedule,
  type StaffSchedule,
  type StaffScheduleRow,
  type StaffWeeklyHoursRow,
} from "@/lib/staff-availability";
import { fetchStaffDateBreaks } from "@/lib/staff-break-overrides";

/** reservation_staff の1行（この関数が select している列だけ） */
type StaffRow = StaffScheduleRow & { id: string };
/** staff_booking_dates の1行（その日だけの受付時間の上書き） */
type BookingDateRow = { staff_id: string; available: boolean | null; start_time: string | null; end_time: string | null };
/** staff_working_hours の1行（曜日ごとの勤務時間） */
type WeeklyRow = StaffWeeklyHoursRow & { staff_id: string };

/** "HH:MM:SS"/"HH:MM"/null → "HH:MM"/null。スタッフ出勤時間（TIMEカラム）の正規化用 */
function normStaffTime(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  return t.length >= 5 ? t.slice(0, 5) : t;
}

/**
 * 指定した先生たちの「その日の受付時間・休憩」をまとめて作る共通ローダー。
 *
 * 優先順位は buildStaffSchedule / getStaffHoursForYmd と同じ:
 *   ①その日だけの上書き（staff_booking_dates）→ ②手入力の受付時間 → ③勤務表（曜日ごと）→ ④制限なし
 * 休憩は ①その日だけ（staff_working_overrides kind="break"）→ ②手入力 → ③勤務表 の順。
 *
 * 🚨 ここを使うところ（ぜんぶ同じ材料で判定する）:
 *   - 患者さんの空き表示      reserve.ts getDailyAvailability
 *   - 患者さんの登録ガード     reserve.ts createReservation
 *   - 患者さんの日時変更ガード  manage-reservation.ts rescheduleMyReservation
 *
 * 取得に失敗したら空の Map を返す＝「制限なし」に倒す。
 * ここで全員を予約不可にすると、DB障害のときに院ぜんたいの枠が黙って消えるため。
 */
export async function getStaffSchedulesForDate(
  db: any,
  clinicId: string,
  dateStr: string,
  staffIds: string[],
): Promise<Map<string, StaffSchedule | null>> {
  const out = new Map<string, StaffSchedule | null>();
  if (!staffIds || staffIds.length === 0) return out;
  try {
    const [{ data: staffRows }, { data: dateRows }, { data: weeklyRows }, { data: settings }] = await Promise.all([
      db.from("reservation_staff")
        .select("id, schedule_based_booking, booking_weekdays, booking_start_time, booking_end_time, booking_break_start, booking_break_end, booking_until")
        .eq("clinic_id", clinicId).in("id", staffIds),
      db.from("staff_booking_dates").select("staff_id, available, start_time, end_time")
        .eq("clinic_id", clinicId).eq("date", dateStr),
      db.from("staff_working_hours").select("staff_id, day_of_week, start_time, end_time, break_start, break_end")
        .eq("clinic_id", clinicId),
      db.from("clinic_settings").select("booking_follow_work_schedule, booking_prep_minutes")
        .eq("id", clinicId).maybeSingle(),
    ]);
    const followSchedule = !!settings?.booking_follow_work_schedule;
    const prep = followSchedule ? Number(settings?.booking_prep_minutes ?? 0) || 0 : 0;
    const dateBreaksByStaff = await fetchStaffDateBreaks(db, clinicId, { date: dateStr, staffIds });
    for (const st of (staffRows ?? []) as StaffRow[]) {
      const id = st.id;
      const ovr = ((dateRows ?? []) as BookingDateRow[]).find((d) => d.staff_id === id);
      out.set(
        id,
        buildStaffSchedule(
          st,
          ovr ? [{ date: dateStr, available: !!ovr.available, start: normStaffTime(ovr.start_time), end: normStaffTime(ovr.end_time) }] : [],
          followSchedule ? ((weeklyRows ?? []) as WeeklyRow[]).filter((w) => w.staff_id === id) : [],
          prep,
          dateBreaksByStaff.get(id) ?? [],
        ),
      );
    }
  } catch (e) {
    console.error("[getStaffSchedulesForDate] failed:", e);
    return new Map<string, StaffSchedule | null>();
  }
  return out;
}
