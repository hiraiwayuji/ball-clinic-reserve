-- スタッフごとの「いつもの休憩（分）」。
-- 打刻では休憩を記録しないため、記録が無い日はこの値で実働・支給額の目安を計算する。
-- NULL＝未設定（労働基準法の最低ライン: 6時間まで0分／8時間まで45分／それ以上60分 で計算）。
-- 使うのは lib/attendance-pay.ts（勤怠一覧・給与、勤怠管理表Excel、スタッフ本人の記録確認）。
ALTER TABLE public.reservation_staff
  ADD COLUMN IF NOT EXISTS default_break_minutes integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reservation_staff_default_break_minutes_range'
  ) THEN
    ALTER TABLE public.reservation_staff
      ADD CONSTRAINT reservation_staff_default_break_minutes_range
      CHECK (default_break_minutes IS NULL OR (default_break_minutes BETWEEN 0 AND 600));
  END IF;
END $$;
