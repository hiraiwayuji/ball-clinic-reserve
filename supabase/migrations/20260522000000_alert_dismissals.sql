-- ============================================================
-- AI秘書アラート「タスクに降格」記録テーブル
-- ============================================================
-- ぼーるくん要望（2026-05-22）: OwnerAlert を「今は解決しない」と
-- タップした際、daily_tasks に登録すると同時にこの alert_dismissals
-- へ記録 → 次回 briefing 生成時に同 alert_id を緊急枠から除外する。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.alert_dismissals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    uuid NOT NULL REFERENCES public.clinic_settings(id),
  alert_id     text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  dismissed_by uuid REFERENCES auth.users(id),
  UNIQUE (clinic_id, alert_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_dismissals_clinic ON public.alert_dismissals(clinic_id);

ALTER TABLE public.alert_dismissals ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.alert_dismissals IS
  'AI秘書 OwnerAlert を「タスクに降格（=もう緊急枠に出さない）」した記録。alert_id は alert 内容から決定的に生成（例: "duplicate-booking-2026-05-22-戎虹丸"）';
