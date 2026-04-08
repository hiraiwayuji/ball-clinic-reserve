-- clinic_settings テーブルを拡張して詳細情報を保存可能にする
ALTER TABLE public.clinic_settings 
ADD COLUMN IF NOT EXISTS phone_number TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS market_area TEXT,
ADD COLUMN IF NOT EXISTS target_generation TEXT,
ADD COLUMN IF NOT EXISTS doctor_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS staff_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS branch_count INTEGER DEFAULT 0;

-- 既存データの初期値調整が必要な場合
UPDATE public.clinic_settings 
SET doctor_count = 1 
WHERE doctor_count IS NULL;
