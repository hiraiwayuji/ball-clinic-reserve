-- 外部・時事情報（天気・インフル・花粉・熱中症など）を保存する全院共有テーブル
-- - clinic_id 不要（都道府県単位）
-- - signal_type ごとに最新を upsert
-- - source: 'jma' (気象庁) / 'env_kafun' (環境省はなこさん) / 'mhlw_idwr' / 'manual'
CREATE TABLE IF NOT EXISTS public.external_health_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prefecture TEXT NOT NULL,
  signal_type TEXT NOT NULL,            -- 'weather_today'|'weather_forecast'|'influenza_weekly'|'pollen'|'heatstroke_alert'|'manual'
  observed_for DATE NOT NULL,           -- データの対象日（週次は週初日）
  payload JSONB NOT NULL,
  summary TEXT,                         -- 1 行サマリ。AI 秘書プロンプトに直接渡せる文字列
  source TEXT NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT external_health_signals_unique UNIQUE (prefecture, signal_type, observed_for)
);

CREATE INDEX IF NOT EXISTS idx_ehs_lookup
  ON public.external_health_signals(prefecture, signal_type, observed_for DESC);

ALTER TABLE public.external_health_signals ENABLE ROW LEVEL SECURITY;

-- 認証ユーザーは全件 SELECT 可能（院ごとデータではないため）
DROP POLICY IF EXISTS external_health_signals_select ON public.external_health_signals;
CREATE POLICY external_health_signals_select ON public.external_health_signals
  FOR SELECT TO anon, authenticated USING (true);

-- 書き込みは service_role のみ（cron route / 手動入力 server action）
DROP POLICY IF EXISTS external_health_signals_no_anon_write ON public.external_health_signals;
CREATE POLICY external_health_signals_no_anon_write ON public.external_health_signals
  FOR INSERT TO authenticated WITH CHECK (false);
