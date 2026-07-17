-- トレーニング評価レポートを患者（保護者）へLINEで送るための列。
--   - report_token   : 患者向け公開レポートページ /report/training/<token> の鍵（推測不可のランダム文字列）
--   - report_sent_at : 最後に送信した日時（重複送信の気づき用）
-- 公開ページは anon では読ませず、サーバー側で service_role + token 照合で取得する
-- （RLSは有効のまま・authenticated限定ポリシーを維持。runbook_supabase_rls_exposure 準拠）。
-- 2026-07-17 追加。

ALTER TABLE public.training_assessments ADD COLUMN IF NOT EXISTS report_token   TEXT;
ALTER TABLE public.training_assessments ADD COLUMN IF NOT EXISTS report_sent_at TIMESTAMPTZ;

-- トークンは一意（NULL は複数あってOK＝未発行）
CREATE UNIQUE INDEX IF NOT EXISTS idx_training_assessments_report_token
  ON public.training_assessments (report_token)
  WHERE report_token IS NOT NULL;
