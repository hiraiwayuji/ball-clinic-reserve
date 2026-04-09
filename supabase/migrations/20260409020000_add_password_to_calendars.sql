-- Add password column to calendars table
ALTER TABLE IF EXISTS public.calendars ADD COLUMN IF NOT EXISTS password TEXT;

-- RLS: calendar_idを知っていてもパスワードが設定されている場合は、
-- 将来的にRLSでガードすることも可能ですが、
-- 現状はアプリケーション層（Server Actions）でチェックを行うため、
-- ここではカラムの追加のみにとどめます。
