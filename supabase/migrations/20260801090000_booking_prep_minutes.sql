-- 勤務表（staff_working_hours）を、そのままネット予約の受付時間に使うかどうか。
-- 既定 false ＝ 従来どおり（勤務表は予約枠に影響しない）。
-- 勤務表の曜日データが正しく入っている院だけ true にする。
alter table public.clinic_settings
  add column if not exists booking_follow_work_schedule boolean not null default false;

-- 勤務時間の前後を「準備・片付け・事務」としてネット予約の受付から外す分数。
-- 0（既定）＝勤務時間そのまま受付。からだ鍼灸整骨院は 30。
alter table public.clinic_settings
  add column if not exists booking_prep_minutes integer not null default 0;

comment on column public.clinic_settings.booking_follow_work_schedule is
  'true=出勤調整の勤務表からネット予約の受付時間を自動で決める。false=従来どおり';
comment on column public.clinic_settings.booking_prep_minutes is
  '勤務時間の前後この分数はネット予約を受け付けない（準備・片付け・事務）。0=なし';
