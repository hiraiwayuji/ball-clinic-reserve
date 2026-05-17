-- スタッフタスク管理テーブル
-- 月次タスクリスト・割当・期限管理用。owner/admin/staff から CRUD する。
-- staff_id NULL = 未割当タスク（後で誰かにアサインする想定）

CREATE TABLE IF NOT EXISTS public.staff_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL,
  staff_id UUID REFERENCES public.reservation_staff(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 集計や一覧用のインデックス
CREATE INDEX IF NOT EXISTS idx_staff_tasks_clinic_status
  ON public.staff_tasks(clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_staff_tasks_staff_status
  ON public.staff_tasks(staff_id, status);
CREATE INDEX IF NOT EXISTS idx_staff_tasks_due
  ON public.staff_tasks(clinic_id, due_date) WHERE status = 'pending';

ALTER TABLE public.staff_tasks ENABLE ROW LEVEL SECURITY;

-- 自院 (clinic_users 経由) なら認証ユーザーは全タスク RW
-- role 別の権限 (delete は owner/admin のみ) は server action 側で制御
DROP POLICY IF EXISTS staff_tasks_clinic_isolation ON public.staff_tasks;
CREATE POLICY staff_tasks_clinic_isolation ON public.staff_tasks
  FOR ALL TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()));

-- 更新時刻トリガー（completed_at は server action で set するため不要）
-- created_at は DEFAULT NOW() で十分

COMMENT ON TABLE public.staff_tasks IS 'スタッフ別タスク管理（月次タスクリスト等）';
COMMENT ON COLUMN public.staff_tasks.staff_id IS 'NULL = 未割当タスク';
COMMENT ON COLUMN public.staff_tasks.status IS 'pending / done';
COMMENT ON COLUMN public.staff_tasks.priority IS 'low / normal / high';
