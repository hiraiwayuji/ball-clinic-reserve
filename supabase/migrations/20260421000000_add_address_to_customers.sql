-- 顧客テーブルに住所フィールドを追加
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS address TEXT;

COMMENT ON COLUMN public.customers.address IS '顧客の住所（番地まで含む詳細住所）';
