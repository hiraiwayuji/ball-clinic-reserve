-- ============================================================
-- シフト希望の「募集ラウンド」＋スタッフ個別LINE通知
-- ============================================================
-- からだ鍼灸整骨院・藤川先生の要望 (2026-07-11):
--   出勤希望の提出リンクを、締切の少し前に各自の LINE へ自動配信し、
--   期限までに未提出の人には催促を届けたい。締切は院ごとに月2回など
--   自由に設定したい（例: 8/1-15＝締切7/5、8/16-31＝締切7/20）。
--
-- 設計:
--   - shift_request_rounds に「対象期間・提出締切・リンク配信日」を院長が登録。
--     cron が link_send_date に提出リンクを配信し、締切前に未提出者へ催促する。
--   - スタッフ個別 LINE 送信は reservation_staff.line_user_id（連携済みの人）へ。
--     未連携の人へは従来どおりメール（保険）。
--   - 院ごとの機能ハードフラグは作らない方針。ラウンド未登録の院は従来の
--     「毎月1日に翌月分」運用のまま（他院無影響）。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shift_request_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL,
  label TEXT,                         -- 表示用（例: 8月前半）
  period_start DATE NOT NULL,         -- 対象期間の開始（この期間の希望を集める）
  period_end   DATE NOT NULL,         -- 対象期間の終了
  deadline     DATE NOT NULL,         -- スタッフの提出締切
  link_send_date DATE NOT NULL,       -- 提出リンクを配信する日（通常は締切の1週間前）
  status TEXT NOT NULL DEFAULT 'open',-- open / closed
  sent JSONB NOT NULL DEFAULT '{}'::jsonb, -- 送信済みフラグ（link / d3 / d1 / d0）で二重送信防止
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_rounds_clinic
  ON public.shift_request_rounds(clinic_id, link_send_date);

-- RLS（authenticated のみ・自院のみ。cron/フォームは service role でバイパス）
ALTER TABLE public.shift_request_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shift_rounds_auth_all ON public.shift_request_rounds;
CREATE POLICY shift_rounds_auth_all ON public.shift_request_rounds
  FOR ALL TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.set_shift_rounds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shift_rounds_updated_at ON public.shift_request_rounds;
CREATE TRIGGER trg_shift_rounds_updated_at
  BEFORE UPDATE ON public.shift_request_rounds
  FOR EACH ROW EXECUTE FUNCTION public.set_shift_rounds_updated_at();

COMMENT ON TABLE public.shift_request_rounds IS
  'シフト希望の募集ラウンド。院長が対象期間・提出締切・リンク配信日を設定。cronが配信/催促。';

-- reservation_staff の LINE 連携カラムは既に 20260621100000 で追加済み
-- （line_user_id / line_link_code / line_link_code_expires_at / line_linked_at）。
-- 念のため未適用環境でも動くよう保険で用意する。
ALTER TABLE public.reservation_staff
  ADD COLUMN IF NOT EXISTS line_user_id TEXT,
  ADD COLUMN IF NOT EXISTS line_link_code TEXT,
  ADD COLUMN IF NOT EXISTS line_link_code_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS line_linked_at TIMESTAMPTZ;
