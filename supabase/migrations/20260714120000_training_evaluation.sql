-- トレーニング評価アプリ（ボール・からだ・マッスルの3院のみで使用）。
-- ジュニアアスリート等の身体機能を「部位 × 3軸（筋力/反射/運動神経）× 左右」で
-- 0〜10点評価し、左右差・推移・宿題・次回目標を記録する。
--   - training_assessments  : 1回の評価セッション（来院日・担当・総合メモ・今週の宿題・次回目標）
--   - training_measurements : そのセッションの各項目スコア（部位×軸×左右）
-- スマホで採点、PCで推移・左右差を確認する運用。院ごとの項目編集は将来対応（今は標準セット固定）。
-- 2026-07-14 新規。

-- ── 評価セッション（ヘッダー） ──
CREATE TABLE IF NOT EXISTS public.training_assessments (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id     UUID        NOT NULL REFERENCES public.clinic_settings(id) ON DELETE CASCADE,
  customer_id   UUID        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  assessed_on   DATE        NOT NULL DEFAULT (timezone('Asia/Tokyo', now()))::date, -- 評価日
  assessor_name TEXT        NULL,                     -- 担当者名（任意）
  overall_memo  TEXT        NULL,                     -- その日の総合メモ（できたこと等）
  next_goal     TEXT        NULL,                     -- 次回の目標（"次はここまで"）
  homework      TEXT        NULL,                     -- 今週の宿題
  created_by    UUID        REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ── 各項目スコア（部位×軸×左右） ──
CREATE TABLE IF NOT EXISTS public.training_measurements (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id UUID        NOT NULL REFERENCES public.training_assessments(id) ON DELETE CASCADE,
  clinic_id     UUID        NOT NULL REFERENCES public.clinic_settings(id) ON DELETE CASCADE, -- テナント分離用に冗長保持
  item_key      TEXT        NOT NULL,                 -- 部位キー（toe/ankle/hip/iliopsoas/abs/back/reflex）
  axis          TEXT        NOT NULL,                 -- 軸（strength/reflex/motor）
  side          TEXT        NOT NULL DEFAULT 'both',  -- left/right/both
  score         SMALLINT    NULL,                     -- 0〜10（NULL=未測定）
  memo          TEXT        NULL,                     -- 項目ごとのメモ（任意）
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT training_measurements_score_range CHECK (score IS NULL OR (score >= 0 AND score <= 10)),
  CONSTRAINT training_measurements_side CHECK (side IN ('left','right','both')),
  -- 同一セッション内で 部位×軸×左右 は1レコード（採点の上書き用）
  CONSTRAINT training_measurements_unique UNIQUE (assessment_id, item_key, axis, side)
);

-- 院ごと・患者ごと・日付での取得を高速化
CREATE INDEX IF NOT EXISTS idx_training_assessments_clinic_customer
  ON public.training_assessments (clinic_id, customer_id, assessed_on DESC);

CREATE INDEX IF NOT EXISTS idx_training_measurements_assessment
  ON public.training_measurements (assessment_id);

CREATE INDEX IF NOT EXISTS idx_training_measurements_clinic
  ON public.training_measurements (clinic_id);

-- ── RLS（管理者のみ。患者Web予約からは参照しないので authenticated 限定） ──
ALTER TABLE public.training_assessments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_measurements ENABLE ROW LEVEL SECURITY;

-- training_assessments
DROP POLICY IF EXISTS "Authenticated read training_assessments" ON public.training_assessments;
CREATE POLICY "Authenticated read training_assessments"
  ON public.training_assessments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated insert training_assessments" ON public.training_assessments;
CREATE POLICY "Authenticated insert training_assessments"
  ON public.training_assessments FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated update training_assessments" ON public.training_assessments;
CREATE POLICY "Authenticated update training_assessments"
  ON public.training_assessments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated delete training_assessments" ON public.training_assessments;
CREATE POLICY "Authenticated delete training_assessments"
  ON public.training_assessments FOR DELETE TO authenticated USING (true);

-- training_measurements
DROP POLICY IF EXISTS "Authenticated read training_measurements" ON public.training_measurements;
CREATE POLICY "Authenticated read training_measurements"
  ON public.training_measurements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated insert training_measurements" ON public.training_measurements;
CREATE POLICY "Authenticated insert training_measurements"
  ON public.training_measurements FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated update training_measurements" ON public.training_measurements;
CREATE POLICY "Authenticated update training_measurements"
  ON public.training_measurements FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated delete training_measurements" ON public.training_measurements;
CREATE POLICY "Authenticated delete training_measurements"
  ON public.training_measurements FOR DELETE TO authenticated USING (true);
