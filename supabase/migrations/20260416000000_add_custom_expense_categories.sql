-- clinic_settings に カスタム経費カテゴリ列を追加
ALTER TABLE clinic_settings
  ADD COLUMN IF NOT EXISTS custom_expense_categories text[] NOT NULL DEFAULT '{}';
