-- コースに「売上に出さない」フラグを追加（ボール接骨院のさみ整体向け）
--
-- さみ整体は、お金を施術者（さみ整体さん）にそのまま渡しているため、
-- 院の売上としては計上しない。一括売上入力の一覧にも出さない。
-- ダブル施術（ボール施術＋さみ整体）で直後に追加された分も、単体予約も、同じ扱い。
--
-- 院ごとのフラグではなくコースの属性。さみ整体コードは他院に無いので、
-- 下の自動 ON は実質ボール接骨院だけに効く（他院では name 一致せず無変化）。

ALTER TABLE public.reservation_courses
  ADD COLUMN IF NOT EXISTS exclude_from_sales BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.reservation_courses.exclude_from_sales IS
  '売上に計上しない（お金が外部の施術者に渡るメニュー）。ONだと一括売上入力の一覧に出さない。さみ整体用。';

-- 既存の「さみ整体」メニューには自動でONにする（この移行を当てた院にさみ整体があれば）。
UPDATE public.reservation_courses
  SET exclude_from_sales = TRUE
  WHERE name = 'さみ整体' AND exclude_from_sales = FALSE;
