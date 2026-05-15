-- reservation_staff の RLS ポリシーが本番に欠けていた問題の修正
-- 20260515000000_staff_schedule.sql で書き漏らした
-- スタッフ追加時に "new row violates row-level security policy" エラーが出ていた

ALTER TABLE public.reservation_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reservation_staff_anon_select ON public.reservation_staff;
CREATE POLICY reservation_staff_anon_select ON public.reservation_staff
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS reservation_staff_auth_write ON public.reservation_staff;
CREATE POLICY reservation_staff_auth_write ON public.reservation_staff
  FOR ALL TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()));
