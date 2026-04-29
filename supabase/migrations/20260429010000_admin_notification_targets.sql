-- Phase 2: 複数管理者通知先テーブル
-- OWNER_LINE_USER_ID 単独 push から、クリニックごとの複数 LINE/メール通知先を管理する形式へ。

CREATE TABLE IF NOT EXISTS public.admin_notification_targets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID        NOT NULL REFERENCES public.clinic_settings(id) ON DELETE CASCADE,
  label         TEXT        NOT NULL,                         -- 例: "院長 LINE", "受付スマホ"
  line_user_id  TEXT,                                          -- LINE 個人 user_id
  email         TEXT,                                          -- 通知メール（任意）
  enabled       BOOLEAN     NOT NULL DEFAULT true,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_notification_targets_clinic_idx
  ON public.admin_notification_targets (clinic_id, enabled);

ALTER TABLE public.admin_notification_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read own clinic targets" ON public.admin_notification_targets;
CREATE POLICY "Members can read own clinic targets" ON public.admin_notification_targets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid() AND cu.clinic_id = admin_notification_targets.clinic_id
    )
  );

DROP POLICY IF EXISTS "Service role can manage targets" ON public.admin_notification_targets;
CREATE POLICY "Service role can manage targets" ON public.admin_notification_targets
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
