-- 支払区分マスタテーブル
-- 既存ハードコード（自賠責/労災/はぐくみ医療/その他）を院ごとに自由に追加・編集できるよう
-- マスタ化する。鍼灸・トレーニング等の自費メニューも区分として登録可能。
--
-- 設計判断:
--  - key は既存 appointments.payment_type / sales.payment_type の文字列値と互換
--    （'jibaiseki', 'rosai', 'hagukumi', 'other', + 新規 'jihi'）
--  - is_system=true は標準カテゴリ（label 変更可、削除不可）
--  - is_active=false で論理削除（履歴は残す）

CREATE TABLE IF NOT EXISTS public.payment_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL,
  key TEXT NOT NULL,             -- 内部キー（appointments.payment_type と互換）
  label TEXT NOT NULL,           -- 表示名
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_categories_clinic_key_unique UNIQUE (clinic_id, key)
);

CREATE INDEX IF NOT EXISTS idx_payment_categories_clinic
  ON public.payment_categories(clinic_id) WHERE is_active = true;

-- RLS（既存パターン踏襲）
ALTER TABLE public.payment_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_categories_anon_select ON public.payment_categories;
CREATE POLICY payment_categories_anon_select ON public.payment_categories
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS payment_categories_auth_write ON public.payment_categories;
CREATE POLICY payment_categories_auth_write ON public.payment_categories
  FOR ALL TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()));

-- 全クリニックに標準カテゴリを 5 件投入
INSERT INTO public.payment_categories (clinic_id, key, label, sort_order, is_active, is_system)
SELECT id, 'jibaiseki', '自賠責',     0, true, true FROM public.clinic_settings
ON CONFLICT (clinic_id, key) DO NOTHING;

INSERT INTO public.payment_categories (clinic_id, key, label, sort_order, is_active, is_system)
SELECT id, 'rosai',     '労災',       1, true, true FROM public.clinic_settings
ON CONFLICT (clinic_id, key) DO NOTHING;

INSERT INTO public.payment_categories (clinic_id, key, label, sort_order, is_active, is_system)
SELECT id, 'hagukumi',  'はぐくみ医療', 2, true, true FROM public.clinic_settings
ON CONFLICT (clinic_id, key) DO NOTHING;

INSERT INTO public.payment_categories (clinic_id, key, label, sort_order, is_active, is_system)
SELECT id, 'jihi',      '実費',       3, true, true FROM public.clinic_settings
ON CONFLICT (clinic_id, key) DO NOTHING;

INSERT INTO public.payment_categories (clinic_id, key, label, sort_order, is_active, is_system)
SELECT id, 'other',     'その他',     4, true, true FROM public.clinic_settings
ON CONFLICT (clinic_id, key) DO NOTHING;

COMMENT ON TABLE public.payment_categories IS '院ごとの支払区分マスタ（自賠責/労災/はぐくみ医療/実費/その他 + 院独自）';
COMMENT ON COLUMN public.payment_categories.key IS '内部キー、appointments.payment_type / sales.payment_type と整合';
COMMENT ON COLUMN public.payment_categories.is_system IS 'true=標準カテゴリ、label変更可・削除不可';
