-- 勤怠まわりの追加設定（からだ鍼灸整骨院の要望）
--
-- 1) wage_passcode_hash
--    時給欄は role としては owner 専用だが、受付PCが院のオーナーアカウントで
--    ログインしっぱなしになるため、スタッフがメニューから開けてしまっていた。
--    そこで「時給を表示するときだけ院長の合言葉を求める」ための合言葉を持つ。
--    平文は保存せず SHA-256 ハッシュのみ（attendance_passcode_hash と同じ方式）。
--    ※打刻端末用の attendance_passcode_hash とは別物。あちらは受付で
--      スタッフの目の前で入力するので、時給には使えない。
--
-- 2) overtime_grace_minutes
--    残業判定を「固定時刻（20:15）以降」から「その人のシフト終了＋猶予」に変える。
--    既定 10 分＝シフト終わりから10分以内の退社は残業扱いにしない。
--    シフトが登録されていない日は、従来どおり overtime_reason_after で判定する
--    （＝シフト未設定の院・スタッフの挙動は変わらない）。

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS wage_passcode_hash TEXT,
  ADD COLUMN IF NOT EXISTS overtime_grace_minutes INTEGER NOT NULL DEFAULT 10;

COMMENT ON COLUMN public.clinic_settings.wage_passcode_hash IS
  '時給欄を開くための院長の合言葉（SHA-256）。NULL=未設定（未設定なら時給は誰にも表示しない）。';
COMMENT ON COLUMN public.clinic_settings.overtime_grace_minutes IS
  'シフト終了から何分までを残業扱いにしないか（既定10分）。シフト未登録日は overtime_reason_after にフォールバック。';

-- 値が壊れていても判定が暴走しないように 0〜120 分に制限
ALTER TABLE public.clinic_settings
  DROP CONSTRAINT IF EXISTS clinic_settings_overtime_grace_minutes_range;
ALTER TABLE public.clinic_settings
  ADD CONSTRAINT clinic_settings_overtime_grace_minutes_range
  CHECK (overtime_grace_minutes >= 0 AND overtime_grace_minutes <= 120);
