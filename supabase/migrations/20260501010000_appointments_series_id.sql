-- appointments.series_id: 連続予約（毎週繰り返し）をひとつのシリーズとして識別する
-- 受付で「8週連続」「12週連続」などを作成すると、同じ series_id を持つ複数行が生成される。
-- 削除時に「この日のみ」「この日以降を全部」を選べるようにするため。
-- 単発予約は NULL のまま。

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS series_id UUID;

CREATE INDEX IF NOT EXISTS idx_appointments_series
  ON public.appointments(clinic_id, series_id, start_time)
  WHERE series_id IS NOT NULL;

COMMENT ON COLUMN public.appointments.series_id IS
  '連続予約シリーズ ID。NULL は単発予約。同一 series_id を持つ複数行が同じ繰り返しシリーズ。';
