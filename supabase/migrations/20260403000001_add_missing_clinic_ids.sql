-- 修正: SaaS化対応 - マルチテナント分離のためのclinic_id追加
-- 対象: clinic_holidays, pending_expenses, ai_chat_messages
-- 理由: これら3テーブルにclinic_idがなく、複数クリニック運用時にデータが混在する

-- ============================================================
-- 1. clinic_holidays に clinic_id を追加
-- ============================================================

-- clinic_idカラムを追加（既存データはデフォルトのクリニックIDを設定）
ALTER TABLE public.clinic_holidays
  ADD COLUMN IF NOT EXISTS clinic_id UUID
    NOT NULL
    DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES public.clinic_settings(id);

-- date の UNIQUE 制約を (clinic_id, date) の複合ユニークに変更
ALTER TABLE public.clinic_holidays
  DROP CONSTRAINT IF EXISTS clinic_holidays_date_key;

ALTER TABLE public.clinic_holidays
  ADD CONSTRAINT clinic_holidays_clinic_id_date_key UNIQUE (clinic_id, date);

-- INSERT/DELETE ポリシーを管理者（認証済み）のみに制限
DROP POLICY IF EXISTS "Allow anon insert access on clinic_holidays" ON public.clinic_holidays;
DROP POLICY IF EXISTS "Allow anon delete access on clinic_holidays" ON public.clinic_holidays;

CREATE POLICY "Authenticated users can insert clinic_holidays" ON public.clinic_holidays
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete clinic_holidays" ON public.clinic_holidays
  FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 2. pending_expenses に clinic_id を追加
-- ============================================================

ALTER TABLE public.pending_expenses
  ADD COLUMN IF NOT EXISTS clinic_id UUID
    NOT NULL
    DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES public.clinic_settings(id);

CREATE INDEX IF NOT EXISTS idx_pending_expenses_clinic_id
  ON public.pending_expenses (clinic_id);

-- ============================================================
-- 3. ai_chat_messages に clinic_id を追加
-- ============================================================

ALTER TABLE public.ai_chat_messages
  ADD COLUMN IF NOT EXISTS clinic_id UUID
    NOT NULL
    DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES public.clinic_settings(id);

CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_clinic_id
  ON public.ai_chat_messages (clinic_id);
