-- ============================================================
-- 予約画面・予約一覧グリッドが参照する営業時間範囲
-- ============================================================
-- 既存の hours_lines/hours_closed はテキスト表示用、こちらは予約スロット生成用。
-- 形式: "HH:MM" 文字列で持つ（TIME 型より JS との相性が良い）。
-- NULL の場合は time-slots.ts のデフォルト値を使う（後方互換）。
--
-- closed_weekdays は JS の getDay() 値をカンマ区切りで保持（日=0, 月=1, ..., 土=6）
-- 例: "0,3" = 日曜と水曜が休診
-- ============================================================

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS business_open_weekday   TEXT,
  ADD COLUMN IF NOT EXISTS business_close_weekday  TEXT,
  ADD COLUMN IF NOT EXISTS business_open_saturday  TEXT,
  ADD COLUMN IF NOT EXISTS business_close_saturday TEXT,
  ADD COLUMN IF NOT EXISTS closed_weekdays         TEXT;

COMMENT ON COLUMN public.clinic_settings.business_open_weekday IS  '平日の営業開始時刻 "HH:MM"。NULL なら 12:00 (default)';
COMMENT ON COLUMN public.clinic_settings.business_close_weekday IS '平日の営業終了時刻 "HH:MM"。NULL なら 22:30';
COMMENT ON COLUMN public.clinic_settings.business_open_saturday IS '土曜の営業開始時刻 "HH:MM"。NULL なら 10:00';
COMMENT ON COLUMN public.clinic_settings.business_close_saturday IS '土曜の営業終了時刻 "HH:MM"。NULL なら 17:30';
COMMENT ON COLUMN public.clinic_settings.closed_weekdays IS '休診曜日。JS getDay() 値のカンマ区切り（日=0, 月=1, ..., 土=6）。NULL なら "0,3" (日水)';

-- からだ鍼灸整骨院: HP に従い 10:00-20:00、休 水・日
UPDATE public.clinic_settings
   SET business_open_weekday   = '10:00',
       business_close_weekday  = '20:00',
       business_open_saturday  = '10:00',
       business_close_saturday = '20:00',
       closed_weekdays         = '0,3'
 WHERE id = 'd3b55abc-46a6-4cbe-8198-21c0392d9a2e';
