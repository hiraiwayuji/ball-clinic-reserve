-- 患者のWeb予約画面で「担当（スタッフ）を選ぶ」操作を許可するかの運用モード設定。
-- 既定 true（従来挙動＝担当切替タブ表示）。false の院（例: からだ鍼灸整骨院）では、
-- 患者は担当を選べず、メニューの required_staff_id によって担当が自動で決まる。
-- ※ updateClinicSettings の settingsData には載せない（直接DBで運用する読み取り専用フラグ）。
alter table public.clinic_settings
  add column if not exists patient_can_pick_staff boolean not null default true;
