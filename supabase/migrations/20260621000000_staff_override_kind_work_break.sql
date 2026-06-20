-- staff_working_overrides.kind に 'break' と 'work' を追加
-- 既存データに影響なく制約を更新する
ALTER TABLE public.staff_working_overrides
  DROP CONSTRAINT IF EXISTS staff_working_overrides_kind_check;

ALTER TABLE public.staff_working_overrides
  ADD CONSTRAINT staff_working_overrides_kind_check
  CHECK (kind IN ('meeting', 'leave', 'training', 'other', 'break', 'work'));

-- status カラムが存在しない場合は追加（既存 override で使われている）
ALTER TABLE public.staff_working_overrides
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected'));
