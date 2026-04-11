-- 保険入金テーブルに振込日・通帳確認・画像URL・メモ列を追加
ALTER TABLE insurance_payments
  ADD COLUMN IF NOT EXISTS payment_date DATE,
  ADD COLUMN IF NOT EXISTS passbook_checked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;
