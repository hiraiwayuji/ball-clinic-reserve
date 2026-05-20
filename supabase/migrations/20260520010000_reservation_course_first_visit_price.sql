-- reservation_courses に「初診時価格」列を追加
--
-- 背景:
--   売上一括入力（/admin/sales/bulk）の元情報を AI 履歴予測ではなく
--   「予約時に選ばれたコースの価格」に切り替える方針（2026-05-20）。
--   初診と再診で価格が違う院に対応するため、コースに first_visit_price を持たせる。
--
-- 値の意味:
--   - first_visit_price IS NULL → 初診でも通常の price を使う（フォールバック）
--   - first_visit_price = 0 や負値はバリデーションを UI 側で行う
--
-- 影響:
--   既存行は NULL のままで、現行ロジックには影響なし（破壊的変更ではない）。

ALTER TABLE public.reservation_courses
  ADD COLUMN IF NOT EXISTS first_visit_price INTEGER NULL;

COMMENT ON COLUMN public.reservation_courses.first_visit_price IS
  '初診時の税込価格（NULLなら通常 price を使う）。bulk売上入力でコース価格を元情報にする際に使用。';
