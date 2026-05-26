-- ============================================================
-- スタッフごとの月間施術数目標
-- ============================================================
-- ぼーるくん要望 (2026-05-26):
--   タイムテーブルのスタッフ名横に当月実績を表示済み。
--   その隣に「月間施術目標」も並べて表示したい（例: 71 / 120）。
--
-- 設計:
-- - reservation_staff に monthly_visit_target INT を持つ
-- - NULL or 0 の場合は実績のみ表示（目標は出さない）
-- ============================================================

ALTER TABLE public.reservation_staff
  ADD COLUMN IF NOT EXISTS monthly_visit_target INT;

COMMENT ON COLUMN public.reservation_staff.monthly_visit_target IS
  'スタッフの月間施術数目標。NULL or 0 ならタイムテーブルに目標を表示しない（実績のみ）';
