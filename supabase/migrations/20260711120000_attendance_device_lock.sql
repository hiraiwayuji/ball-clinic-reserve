-- 打刻の端末ロック（院のパソコンでのみ打刻できるようにする）
-- clinic_settings に「端末ロック ON/OFF」と「打刻用パスワードのハッシュ」を追加。
-- 既定 OFF・全院無影響。からだ鍼灸整骨院が院の設定で ON にして使う。
alter table public.clinic_settings
  add column if not exists attendance_device_lock boolean not null default false,
  add column if not exists attendance_passcode_hash text;

comment on column public.clinic_settings.attendance_device_lock is
  '打刻を登録端末（院のPC）のみに制限するか。ON かつ端末未登録だと打刻画面が出ない';
comment on column public.clinic_settings.attendance_passcode_hash is
  '打刻端末を登録するためのパスワードの SHA-256 ハッシュ（未設定=null・平文は保存しない）';
