-- スタッフごとの休憩時間（オンライン予約を受け付けない時間帯）。
-- 例: からだ鍼灸整骨院 森川 和紀 = 12:00〜14:00 休憩。
-- booking_start_time / booking_end_time（受付時間）と同じく、
-- schedule_based_booking（出勤日だけ予約）とは独立して効く。
alter table public.reservation_staff
  add column if not exists booking_break_start time,
  add column if not exists booking_break_end   time;

comment on column public.reservation_staff.booking_break_start is
  'オンライン予約を受け付けない休憩の開始時刻。NULL=休憩なし';
comment on column public.reservation_staff.booking_break_end is
  'オンライン予約を受け付けない休憩の終了時刻。NULL=休憩なし';
