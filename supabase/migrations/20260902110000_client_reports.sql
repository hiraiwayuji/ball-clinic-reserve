-- ============================================================
-- お客さま向け報告ページ（ログイン不要・トークンURL）
-- ============================================================
-- ぼーるくんの指示（2026-09-02）:
--   「アンケート答えてコピペするんじゃなくて、回答したら完了ボタン押して、
--     それしたら僕が確認しに行けるようにしてほしい。コピペ作業できない人もいるので」
--
-- これまでは報告ページを Artifact で出し、回答はお客さまの端末に残るだけで、
-- LINEに貼り付けてもらわないと届かなかった。貼り付け作業ができない方がいるため、
-- 「送信」を押したら保存され、こちらは同じURLを開けば読める形にする。
--
-- セキュリティ方針（runbook_supabase_rls_exposure / training レポートと同じ）:
--   - RLS は authenticated 限定のまま。anon から直接は読めない。
--   - 公開ページはサーバー側で service_role を使い、推測不可能な token 一致で1件だけ取る。
--   - 一覧・検索はできない。noindex。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    UUID NOT NULL,
  token        TEXT NOT NULL UNIQUE,      -- 推測不可能な文字列（URLに載る）
  title        TEXT NOT NULL,
  respondent   TEXT NOT NULL,             -- 回答する方のお名前（例: 藤川先生）
  body_html    TEXT NOT NULL,             -- 報告本文（<style> ＋ 本文。こちらで作る）
  answers      JSONB,                     -- 送信された回答（最後の送信で上書き）
  answered_at  TIMESTAMPTZ,
  is_open      BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE にすると送信を締め切る
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_reports_token_len CHECK (char_length(token) >= 16)
);

CREATE INDEX IF NOT EXISTS idx_client_reports_clinic ON public.client_reports(clinic_id, created_at DESC);

ALTER TABLE public.client_reports ENABLE ROW LEVEL SECURITY;

-- 読むだけ許す。書き込みは service_role（＝こちらの手作業）だけ。
-- body_html は公開ページにそのまま描くので、院のアカウントが漏れたときに
-- 任意のスクリプトを差し込まれる口を作らない。
DROP POLICY IF EXISTS client_reports_auth_all ON public.client_reports;
DROP POLICY IF EXISTS client_reports_auth_read ON public.client_reports;
CREATE POLICY client_reports_auth_read ON public.client_reports
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.set_client_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_reports_updated_at ON public.client_reports;
CREATE TRIGGER trg_client_reports_updated_at
  BEFORE UPDATE ON public.client_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_client_reports_updated_at();

COMMENT ON TABLE public.client_reports IS
  'お客さま向け報告ページ。/report/c/<token> で開き、その場で回答を送信できる。回答は answers に入る。';
COMMENT ON COLUMN public.client_reports.body_html IS
  '報告本文のHTML。<style> と本文だけ（<html>/<head>/<script> は入れない）。確認欄は .verdict[data-q][data-label] で置く。';
COMMENT ON COLUMN public.client_reports.answers IS
  '[{id,label,v:"ok"|"ng"|"",m:"メモ"}] の配列。最後の送信で上書きする。';
