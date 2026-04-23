-- appointments テーブルのRLS強化
-- 背景: 20260311_allow_anon_update_delete.sql で匿名UPDATEが許可されたが
--       20260403000000_remove_anon_appointment_policies.sql で削除済み。
--       ただしapplicationsの UPDATE/DELETE に対して認証済みユーザー向けの
--       明示的ポリシーが欠けていたため追加する。

-- 既存の匿名ポリシーを念のため削除（べき等）
DROP POLICY IF EXISTS "Enable update for anon users" ON public.appointments;
DROP POLICY IF EXISTS "Enable delete for anon users" ON public.appointments;

-- 認証済みクリニックメンバーのみ予約を更新・キャンセル可能
CREATE POLICY "Clinic members can update appointments" ON public.appointments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = appointments.clinic_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = appointments.clinic_id
    )
  );

-- 認証済みクリニックメンバーのみ予約を削除可能
CREATE POLICY "Clinic members can delete appointments" ON public.appointments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_users.user_id = auth.uid()
      AND clinic_users.clinic_id = appointments.clinic_id
    )
  );

-- 注意: キャンセルAPIはSERVICE_ROLE_KEYを使用しているためRLSをバイパスする。
-- アプリケーション層での所有者確認（route.ts の電話番号照合）が主たる防衛線。
-- SELECT は 20260313000001_allow_public_select.sql の USING(true) を維持（空き確認に必要）。
