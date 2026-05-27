-- ============================================================
-- 院全体の休憩時間（昼休み等）を clinic_settings に追加
-- ============================================================
-- ぼーるくん要望 (2026-05-28):
--   マッスル整体さんでスタッフ全員が 12:00-14:00 に同時休憩しているが、
--   患者向け予約サイトでこの時間帯が「予約可能」として表示されていた。
--
-- 設計:
-- - clinic_settings に「院全体の休憩時間」カラムを追加（平日 / 土曜の2系統）
-- - NULL なら「休憩なし」（既存運用と互換）
-- - スタッフ単位の休憩は staff_working_hours.break_start/break_end として
--   既に持っているが、患者LP のスロット計算は staff レベルを集計しない
--   設計のため、ここでは「院単位の休憩」として持つことで全院休憩のケースを
--   シンプルに表現する。
-- ============================================================

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS business_break_start_weekday  TIME,
  ADD COLUMN IF NOT EXISTS business_break_end_weekday    TIME,
  ADD COLUMN IF NOT EXISTS business_break_start_saturday TIME,
  ADD COLUMN IF NOT EXISTS business_break_end_saturday   TIME;

COMMENT ON COLUMN public.clinic_settings.business_break_start_weekday IS
  '平日の院全体休憩開始時刻。NULL なら休憩なし。患者LP のスロット計算で除外される。';
COMMENT ON COLUMN public.clinic_settings.business_break_end_weekday IS
  '平日の院全体休憩終了時刻。NULL なら休憩なし。';
COMMENT ON COLUMN public.clinic_settings.business_break_start_saturday IS
  '土曜の院全体休憩開始時刻。NULL なら休憩なし。';
COMMENT ON COLUMN public.clinic_settings.business_break_end_saturday IS
  '土曜の院全体休憩終了時刻。NULL なら休憩なし。';
