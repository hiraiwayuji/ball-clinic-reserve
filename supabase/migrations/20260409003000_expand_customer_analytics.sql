-- 顧客分析の強化に向けたカラム追加
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS city_name text,
ADD COLUMN IF NOT EXISTS birth_date date,
ADD COLUMN IF NOT EXISTS referral_source text;

-- コメントの追加
COMMENT ON COLUMN public.customers.city_name IS '患者の居住市町村名';
COMMENT ON COLUMN public.customers.birth_date IS '患者の生年月日（正確な年齢計算用）';
COMMENT ON COLUMN public.customers.referral_source IS '来院のきっかけ（SNS, 紹介, 広告等）';
