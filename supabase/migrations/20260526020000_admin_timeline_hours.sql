-- ============================================================
-- 管理画面のタイムテーブル表示時間を「公開予約画面の営業時間」と分離
-- ============================================================
-- ぼーるくん要望 (2026-05-26):
--   表向き（患者LP）の予約受付は 10:00-20:00 のままで、
--   管理画面のタイムテーブルは前後の準備時間を含めて 9:00-21:00 まで
--   表示したい。
--
-- 設計:
-- - business_open/close_* (既存) = 患者LP用。NULL 時のフォールバック先
-- - admin_timeline_open/close_* (新規) = 管理画面のタイムテーブル専用。
--   NULL なら business_* に自動フォールバック（後方互換）
-- - 土曜は別設定で持つ（既存 business_*_saturday と同じ運用）
-- ============================================================

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS admin_timeline_open_weekday   TEXT,
  ADD COLUMN IF NOT EXISTS admin_timeline_close_weekday  TEXT,
  ADD COLUMN IF NOT EXISTS admin_timeline_open_saturday  TEXT,
  ADD COLUMN IF NOT EXISTS admin_timeline_close_saturday TEXT;

COMMENT ON COLUMN public.clinic_settings.admin_timeline_open_weekday  IS '管理画面タイムテーブルの平日 開始時刻 "HH:MM"。NULL なら business_open_weekday にフォールバック';
COMMENT ON COLUMN public.clinic_settings.admin_timeline_close_weekday IS '管理画面タイムテーブルの平日 終了時刻 "HH:MM"。NULL なら business_close_weekday にフォールバック';
COMMENT ON COLUMN public.clinic_settings.admin_timeline_open_saturday  IS '管理画面タイムテーブルの土曜 開始時刻 "HH:MM"。NULL なら business_open_saturday にフォールバック';
COMMENT ON COLUMN public.clinic_settings.admin_timeline_close_saturday IS '管理画面タイムテーブルの土曜 終了時刻 "HH:MM"。NULL なら business_close_saturday にフォールバック';
