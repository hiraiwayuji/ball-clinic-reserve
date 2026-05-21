-- ============================================================
-- reservation_staff にタイムテーブル表示フラグを追加
-- ============================================================
-- 院ごとに「先生だけタイムテーブル表示」「全員表示」を選べるように。
-- 既存スタッフ全員 TRUE をデフォルトに（破壊的変更なし）。
--
-- からだ鍼灸整骨院（藤川先生院）は先生5名（藤川/島田/森川/森藤/馬場）以外を FALSE に。
-- ============================================================

ALTER TABLE public.reservation_staff
  ADD COLUMN IF NOT EXISTS show_in_timeline BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.reservation_staff.show_in_timeline IS
  'ダッシュボードのタイムテーブルビュー (clinic_settings.view_type=timeline) に表示するか。受付助手等を非表示にする用途。';

-- からだ初期設定（先生5名以外を非表示）
UPDATE public.reservation_staff
   SET show_in_timeline = FALSE
 WHERE clinic_id = 'd3b55abc-46a6-4cbe-8198-21c0392d9a2e'
   AND name NOT IN ('藤川 雅之', '島田 卓也', '森川先生', '森藤 瑞穂香', '馬場 雄大');
