-- 予約枠サイズに「10分刻み」を追加する。
-- ボール接骨院で保険施術（20分）が増え、10分グリッド上に
-- 保険=20分(2枠) / 実費=30分(3枠) をきれいに並べたいため。
-- 既存の 15 / 20 / 30 はそのまま許容し、10 を足すだけ（widening なので後方互換）。
ALTER TABLE public.clinic_settings
  DROP CONSTRAINT IF EXISTS clinic_settings_slot_duration_check;

ALTER TABLE public.clinic_settings
  ADD CONSTRAINT clinic_settings_slot_duration_check
  CHECK (slot_duration_minutes = ANY (ARRAY[10, 15, 20, 30]));
