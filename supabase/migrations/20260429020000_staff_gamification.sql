-- Phase 4: スタッフ・ゲーミフィケーション
-- 1) staff_points: スタッフ別の獲得ポイント明細（行追加方式、合計は集計クエリ or VIEW）
-- 2) staff_badges:獲得バッジ（unique 制約で同じバッジを 2 回付けない）

CREATE TABLE IF NOT EXISTS public.staff_points (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID        NOT NULL REFERENCES public.clinic_settings(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email    TEXT,                                                -- スナップショット
  points        INTEGER     NOT NULL,                                -- 正の値で加算、負も許容（ペナルティ）
  reason        TEXT NOT NULL,                                        -- 'appointment.create' / 'appointment.complete' / 'sales.record' 等
  source_table  TEXT,
  source_id     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_points_clinic_user_idx
  ON public.staff_points (clinic_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staff_points_clinic_created_idx
  ON public.staff_points (clinic_id, created_at DESC);

ALTER TABLE public.staff_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read own clinic points" ON public.staff_points;
CREATE POLICY "Members read own clinic points" ON public.staff_points
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid() AND cu.clinic_id = staff_points.clinic_id
    )
  );

DROP POLICY IF EXISTS "Service role manage points" ON public.staff_points;
CREATE POLICY "Service role manage points" ON public.staff_points
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── バッジ ──
CREATE TABLE IF NOT EXISTS public.staff_badges (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID        NOT NULL REFERENCES public.clinic_settings(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_code    TEXT NOT NULL,                                          -- 'first_100_points' / 'streak_7' 等
  awarded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, user_id, badge_code)
);

ALTER TABLE public.staff_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read own clinic badges" ON public.staff_badges;
CREATE POLICY "Members read own clinic badges" ON public.staff_badges
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid() AND cu.clinic_id = staff_badges.clinic_id
    )
  );

DROP POLICY IF EXISTS "Service role manage badges" ON public.staff_badges;
CREATE POLICY "Service role manage badges" ON public.staff_badges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 集計 VIEW ──
-- スタッフ別の合計ポイント・最終獲得日時
CREATE OR REPLACE VIEW public.staff_points_summary AS
SELECT
  clinic_id,
  user_id,
  user_email,
  COUNT(*) AS entry_count,
  COALESCE(SUM(points), 0) AS total_points,
  MAX(created_at) AS last_earned_at
FROM public.staff_points
GROUP BY clinic_id, user_id, user_email;
