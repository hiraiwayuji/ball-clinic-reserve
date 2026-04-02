-- Phase 2: RLSポリシー全面刷新
-- USING (true) → clinic_usersテーブル経由のclinic_idフィルタリングに変更
-- これにより認証済みユーザーが自テナントのデータのみアクセス可能になる

-- ============================================================
-- ヘルパー: clinic_idフィルタ用の共通パターン
-- EXISTS (SELECT 1 FROM clinic_users WHERE user_id = auth.uid() AND clinic_id = <table>.clinic_id)
-- ============================================================

-- ============================================================
-- 1. cash_sales
-- ============================================================
DROP POLICY IF EXISTS "Admins can do everything on cash_sales" ON cash_sales;

CREATE POLICY "Clinic members can manage cash_sales" ON cash_sales
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = cash_sales.clinic_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = cash_sales.clinic_id
    )
  );

-- ============================================================
-- 2. insurance_payments
-- ============================================================
DROP POLICY IF EXISTS "Admins can do everything on insurance_payments" ON insurance_payments;

CREATE POLICY "Clinic members can manage insurance_payments" ON insurance_payments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = insurance_payments.clinic_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = insurance_payments.clinic_id
    )
  );

-- ============================================================
-- 3. clinic_expenses
-- ============================================================
DROP POLICY IF EXISTS "Admins can do everything on clinic_expenses" ON clinic_expenses;

CREATE POLICY "Clinic members can manage clinic_expenses" ON clinic_expenses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = clinic_expenses.clinic_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = clinic_expenses.clinic_id
    )
  );

-- ============================================================
-- 4. clinic_targets
-- ============================================================
DROP POLICY IF EXISTS "Admins can do everything on clinic_targets" ON clinic_targets;

CREATE POLICY "Clinic members can manage clinic_targets" ON clinic_targets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = clinic_targets.clinic_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = clinic_targets.clinic_id
    )
  );

-- ============================================================
-- 5. monthly_evaluations
-- ============================================================
DROP POLICY IF EXISTS "Admins can do everything on monthly_evaluations" ON monthly_evaluations;

CREATE POLICY "Clinic members can manage monthly_evaluations" ON monthly_evaluations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = monthly_evaluations.clinic_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = monthly_evaluations.clinic_id
    )
  );

-- ============================================================
-- 6. daily_tasks
-- ============================================================
DROP POLICY IF EXISTS "Admins can do everything on daily_tasks" ON daily_tasks;

CREATE POLICY "Clinic members can manage daily_tasks" ON daily_tasks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = daily_tasks.clinic_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = daily_tasks.clinic_id
    )
  );

-- ============================================================
-- 7. ai_memos
-- ============================================================
DROP POLICY IF EXISTS "Admins can do everything on ai_memos" ON ai_memos;

CREATE POLICY "Clinic members can manage ai_memos" ON ai_memos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = ai_memos.clinic_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = ai_memos.clinic_id
    )
  );

-- ============================================================
-- 8. ai_blog_proposals
-- ============================================================
DROP POLICY IF EXISTS "Admins can do everything on ai_blog_proposals" ON ai_blog_proposals;

CREATE POLICY "Clinic members can manage ai_blog_proposals" ON ai_blog_proposals
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = ai_blog_proposals.clinic_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = ai_blog_proposals.clinic_id
    )
  );

-- ============================================================
-- 9. ai_chat_messages（clinic_idはPhase 1で追加済み）
-- ============================================================
DROP POLICY IF EXISTS "Admins can do everything on ai_chat_messages" ON ai_chat_messages;

CREATE POLICY "Clinic members can manage ai_chat_messages" ON ai_chat_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = ai_chat_messages.clinic_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = ai_chat_messages.clinic_id
    )
  );

-- ============================================================
-- 10. pending_expenses（clinic_idはPhase 1で追加済み）
-- ============================================================
DROP POLICY IF EXISTS "Admins can do everything on pending_expenses" ON pending_expenses;

CREATE POLICY "Clinic members can manage pending_expenses" ON pending_expenses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = pending_expenses.clinic_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = pending_expenses.clinic_id
    )
  );

-- ============================================================
-- 11. calendar_events
-- SELECTはiCal公開配信（サービスロールキー経由）のため公開維持
-- INSERT/UPDATE/DELETEを認証+clinic_idフィルタに制限
-- ============================================================
DROP POLICY IF EXISTS "Anyone can insert calendar_events" ON public.calendar_events;
DROP POLICY IF EXISTS "Anyone can update calendar_events" ON public.calendar_events;
DROP POLICY IF EXISTS "Anyone can delete calendar_events" ON public.calendar_events;

CREATE POLICY "Clinic members can insert calendar_events" ON public.calendar_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = calendar_events.clinic_id
    )
  );

CREATE POLICY "Clinic members can update calendar_events" ON public.calendar_events
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = calendar_events.clinic_id
    )
  );

CREATE POLICY "Clinic members can delete calendar_events" ON public.calendar_events
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = calendar_events.clinic_id
    )
  );
