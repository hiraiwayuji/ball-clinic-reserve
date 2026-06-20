-- 朝イチお知らせ・カルテ作業・LINE通知 のための staff_tasks 拡張
-- AI秘書が生成 → 院長承認ゲート → 先生に表示／LINE という流れを支える。

ALTER TABLE public.staff_tasks
  -- タスク種別：manual=手動 / karte=カルテ作業 / morning=朝の定型 / sns / cleaning / other
  ADD COLUMN IF NOT EXISTS task_kind TEXT NOT NULL DEFAULT 'manual'
    CHECK (task_kind IN ('manual','karte','morning','sns','cleaning','other')),
  -- カルテ作業など、紐づく予約（患者）がある場合
  ADD COLUMN IF NOT EXISTS linked_appointment_id UUID,
  -- 院長承認ゲート：AI生成タスクは false で作られ、承認されると先生に出る／LINEが飛ぶ
  ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT TRUE,
  -- 生成元：ai=AI秘書自動 / manual=手動
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('ai','manual')),
  -- LINE 送信済み時刻（重複送信防止）
  ADD COLUMN IF NOT EXISTS line_sent_at TIMESTAMPTZ;

-- 既存の手動タスクは承認済み扱い（approved=true デフォルトでOK）

-- 承認待ち（AI生成・未承認）を素早く引くためのインデックス
CREATE INDEX IF NOT EXISTS idx_staff_tasks_clinic_approval
  ON public.staff_tasks(clinic_id, approved, due_date)
  WHERE status = 'pending';

-- カルテ作業の重複生成防止（同じ予約に同じ種別のタスクは1つ）
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_tasks_appt_kind
  ON public.staff_tasks(linked_appointment_id, task_kind)
  WHERE linked_appointment_id IS NOT NULL;

COMMENT ON COLUMN public.staff_tasks.task_kind IS 'manual/karte/morning/sns/cleaning/other';
COMMENT ON COLUMN public.staff_tasks.approved IS '院長承認ゲート：falseは先生に非表示・LINE未送信';
COMMENT ON COLUMN public.staff_tasks.source IS 'ai=AI秘書生成 / manual=手動';

-- ─────────────────────────────────────────────────────────────
-- 先生個人 LINE 連携（Phase3 で使用、土台のみ先に用意）
-- 既存の公式アカウントを流用し、連携コードで reservation_staff に紐付ける
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.reservation_staff
  ADD COLUMN IF NOT EXISTS line_user_id TEXT,
  ADD COLUMN IF NOT EXISTS line_link_code TEXT,
  ADD COLUMN IF NOT EXISTS line_link_code_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS line_linked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_reservation_staff_line_user
  ON public.reservation_staff(clinic_id, line_user_id)
  WHERE line_user_id IS NOT NULL;
