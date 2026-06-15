-- 出勤日制スタッフ（さみ整体・ヘッドスパ等）の「出勤時間（時間帯）」を設定できるようにする。
-- これまでは出勤日（曜日＋個別日）だけ設定でき、予約可能な時間帯は院の営業時間そのままだった。
-- ・reservation_staff.booking_start_time / booking_end_time: そのスタッフの「既定の出勤時間」（全出勤日に適用）。NULL=院の営業時間どおり。
-- ・staff_booking_dates.start_time / end_time: 個別日ごとの出勤時間の上書き。NULL=既定の出勤時間（無ければ院の営業時間）。
-- いずれも NULL のままなら従来挙動（院の営業時間）を維持＝既存院・既存スタッフに影響なし。

ALTER TABLE public.reservation_staff
  ADD COLUMN IF NOT EXISTS booking_start_time TIME,
  ADD COLUMN IF NOT EXISTS booking_end_time   TIME;

ALTER TABLE public.staff_booking_dates
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time   TIME;
