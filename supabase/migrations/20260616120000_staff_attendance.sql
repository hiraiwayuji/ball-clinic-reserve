-- ============================================================
-- 勤怠（出退勤の打刻）＋残業の見える化  [Phase 1]
-- ============================================================
-- からだ鍼灸整骨院・藤川先生の要望 (2026-06-16):
--   20:00以降の残業は院長の依頼以外は認めない。患者1人なのに3人残り
--   ムダなコストが出た。20:15以降の退社はアプリに残業理由を入力させ、
--   依頼/正当理由のない被りは折半。予約表・シフト表と連動して勤怠を管理。
--
-- Phase 1（このマイグレーション）= 「残業の見える化」:
--   - 出退勤の打刻（受付PC / 各自スマホ。ログイン不要・名前選択）
--   - 20:15以降の退社は残業理由（種類＋メモ）を必須化
--   - オーナー専用の勤怠一覧で残業を可視化
--
-- 設計方針:
--   - 時給・残業しきい値などは「運用モード設定」として clinic_settings に持つ
--     （院ごとの機能ON/OFFハードフラグは作らない方針。attendance_enabled は
--      運用モードであり既定 FALSE なので他院の挙動は変わらない）
--   - 時給・コストは owner 専用。打刻ページ(anon)は wage を SELECT しない。
--   - staff_attendance は sensitive なので anon SELECT を許可しない。
--     ログイン不要の打刻は service role 経由（RLS バイパス）で行う。
-- ============================================================

-- 1. clinic_settings: 運用モード＋残業しきい値
ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS attendance_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS work_end_target          TIME    NOT NULL DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS overtime_reason_after    TIME    NOT NULL DEFAULT '20:15',
  ADD COLUMN IF NOT EXISTS closing_allowance_until  TIME    NOT NULL DEFAULT '20:30',
  ADD COLUMN IF NOT EXISTS closing_staff_id         UUID;

COMMENT ON COLUMN public.clinic_settings.attendance_enabled IS
  '勤怠管理（打刻・残業見える化）を使うか。運用モード（既定OFF）。';
COMMENT ON COLUMN public.clinic_settings.work_end_target IS
  '原則退社の目標時刻（既定 20:00）。';
COMMENT ON COLUMN public.clinic_settings.overtime_reason_after IS
  'この時刻以降の退社は残業理由の入力を必須にする（既定 20:15）。';
COMMENT ON COLUMN public.clinic_settings.closing_allowance_until IS
  '締め担当が1人で締め作業をしてよい許容時刻（既定 20:30）。';
COMMENT ON COLUMN public.clinic_settings.closing_staff_id IS
  '締め作業の担当スタッフ（例: 森川）。reservation_staff.id。NULL なら未設定。';

-- 2. reservation_staff: 時給（owner専用。コスト計算 Phase 3 で使用、先生がアプリで入力）
ALTER TABLE public.reservation_staff
  ADD COLUMN IF NOT EXISTS hourly_wage INTEGER;

COMMENT ON COLUMN public.reservation_staff.hourly_wage IS
  '時給（円）。owner専用。スタッフ画面・anon には表示しない。NULL=未設定。';

-- 3. staff_attendance: 勤怠本体（1スタッフ1日1レコード）
CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL,
  staff_id UUID NOT NULL REFERENCES public.reservation_staff(id) ON DELETE CASCADE,
  staff_name TEXT NOT NULL,                 -- 表示用スナップショット
  work_date DATE NOT NULL,                  -- JSTの勤務日
  clock_in_at  TIMESTAMPTZ,                 -- 出勤打刻（任意）
  clock_out_at TIMESTAMPTZ,                 -- 退勤打刻
  is_overtime BOOLEAN NOT NULL DEFAULT FALSE, -- 退社がしきい値(既定20:15)以降だったか
  overtime_reason_type TEXT,                -- requested/closing/valid/other
  overtime_reason_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_attendance_reason_check
    CHECK (overtime_reason_type IS NULL
           OR overtime_reason_type IN ('requested', 'closing', 'valid', 'other')),
  CONSTRAINT staff_attendance_unique_day
    UNIQUE (clinic_id, staff_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_clinic_date
  ON public.staff_attendance(clinic_id, work_date);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_overtime
  ON public.staff_attendance(clinic_id, work_date) WHERE is_overtime = true;

-- 4. RLS（authenticated のみ。clinic_users 経由で自院のみ。anon は不可＝打刻は service role）
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_attendance_auth_all ON public.staff_attendance;
CREATE POLICY staff_attendance_auth_all ON public.staff_attendance
  FOR ALL TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()));

-- 5. updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION public.set_staff_attendance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_staff_attendance_updated_at ON public.staff_attendance;
CREATE TRIGGER trg_staff_attendance_updated_at
  BEFORE UPDATE ON public.staff_attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_staff_attendance_updated_at();

COMMENT ON TABLE public.staff_attendance IS
  'スタッフ勤怠（出退勤の打刻）。1スタッフ1日1レコード。残業の見える化用[Phase1]';
COMMENT ON COLUMN public.staff_attendance.overtime_reason_type IS
  'requested=院長の依頼 / closing=締め作業 / valid=正当な理由 / other=その他';
