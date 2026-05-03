-- アドホック・リマインダー（緊急クエスト）
-- 院内業務中に思いついた一時的なリマインダーを登録 → 指定時刻に管理画面で
-- ポップアップ + 音 + メッセージで通知する。同院スタッフ全員に共有される。

CREATE TABLE IF NOT EXISTS public.reminders (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      UUID        NOT NULL REFERENCES public.clinic_settings(id) ON DELETE CASCADE,
  created_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email TEXT,                                     -- 作成者のメール（auth.users 削除されても残す）
  title          TEXT        NOT NULL,                        -- 例: "水素吸入の患者さん声かけ"
  message        TEXT,                                        -- 補足メッセージ
  fire_at        TIMESTAMPTZ NOT NULL,                        -- 発火時刻
  status         TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'fired', 'done', 'snoozed', 'cancelled')),
  snoozed_until  TIMESTAMPTZ,                                 -- スヌーズ後の次回発火時刻
  fired_at       TIMESTAMPTZ,                                 -- 実際に画面で発火した時刻
  done_at        TIMESTAMPTZ,                                 -- 完了押された時刻
  done_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ポーリング用インデックス: 自院の未完了で発火時刻が近いものを高速取得
CREATE INDEX IF NOT EXISTS reminders_clinic_active_idx
  ON public.reminders (clinic_id, status, fire_at)
  WHERE status IN ('pending', 'snoozed');

CREATE INDEX IF NOT EXISTS reminders_created_by_idx
  ON public.reminders (created_by);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- 自院のメンバー (clinic_users) は全員参照・操作可
DROP POLICY IF EXISTS "Clinic members can read reminders" ON public.reminders;
CREATE POLICY "Clinic members can read reminders" ON public.reminders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid() AND cu.clinic_id = reminders.clinic_id
    )
  );

DROP POLICY IF EXISTS "Clinic members can insert reminders" ON public.reminders;
CREATE POLICY "Clinic members can insert reminders" ON public.reminders
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid() AND cu.clinic_id = reminders.clinic_id
    )
  );

DROP POLICY IF EXISTS "Clinic members can update reminders" ON public.reminders;
CREATE POLICY "Clinic members can update reminders" ON public.reminders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid() AND cu.clinic_id = reminders.clinic_id
    )
  );

DROP POLICY IF EXISTS "Service role can manage reminders" ON public.reminders;
CREATE POLICY "Service role can manage reminders" ON public.reminders
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
