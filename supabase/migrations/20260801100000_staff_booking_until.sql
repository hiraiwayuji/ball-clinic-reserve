-- スタッフの「予約の受付をやめる日」（最終出勤日）。この日までは予約可、翌日から不可。
-- NULL = 期限なし（通常）。退職・産休などで先の日付を入れておくと、
-- 当日に誰かが手で止めなくても自動で予約枠から外れる。
-- 過去の予約・売上を残すため is_active は落とさない運用にする。
alter table public.reservation_staff
  add column if not exists booking_until date;

comment on column public.reservation_staff.booking_until is
  'この日までネット予約を受け付ける（最終出勤日）。翌日から予約不可・定員から除外。NULL=期限なし';
