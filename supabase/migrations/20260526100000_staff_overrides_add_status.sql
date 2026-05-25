-- ============================================================
-- staff_working_overrides に status カラムを追加
-- ============================================================
-- ぼーるくん要望 (2026-05-26):
--   スタッフが「来月の休み希望」を出し、オーナーが承認するフローを作る。
--   既存の staff_working_overrides を流用し、status で区別する。
--
-- status:
--   pending  : スタッフ希望（未承認）— 予約ブロックしない or 区別表示
--   approved : 承認済み（既存挙動と同じ・予約ブロック対象）
--   rejected : 却下（履歴のため残す）
--
-- 既存データは全部 approved 扱いに初期化（オーナー直接登録）。
-- ============================================================

ALTER TABLE public.staff_working_overrides
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'staff_working_overrides_status_check'
       AND table_name = 'staff_working_overrides'
  ) THEN
    ALTER TABLE public.staff_working_overrides
      ADD CONSTRAINT staff_working_overrides_status_check
      CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

COMMENT ON COLUMN public.staff_working_overrides.status IS
  'pending=スタッフ希望(未承認), approved=承認済み(予約ブロック), rejected=却下(履歴保持)';

UPDATE public.staff_working_overrides
   SET status = 'approved'
 WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_staff_overrides_clinic_status
  ON public.staff_working_overrides(clinic_id, status, date);
