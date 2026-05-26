-- ============================================================
-- コースカテゴリ & スタッフ目標のカテゴリ別分割
-- ============================================================
-- ぼーるくん要望 (2026-05-26):
--   スプレッドシートのように、メニューを「柔整／鍼灸／整体」に分けて
--   実績と目標を集計したい。
--
-- 設計:
-- - reservation_courses.category: "jusei" | "shinkyu" | "seitai" | null
--   （NULL は未分類＝集計に含めず「その他」表示）
-- - reservation_staff にカテゴリ別目標を 3 カラム追加
-- - 既存の monthly_visit_target は「合計目標（後方互換）」として残す
-- ============================================================

ALTER TABLE public.reservation_courses
  ADD COLUMN IF NOT EXISTS category TEXT;

COMMENT ON COLUMN public.reservation_courses.category IS
  'コース分類: jusei (柔整・保険) / shinkyu (鍼灸) / seitai (整体・マッサージ) / NULL (未分類)';

ALTER TABLE public.reservation_staff
  ADD COLUMN IF NOT EXISTS target_jusei   INT,
  ADD COLUMN IF NOT EXISTS target_shinkyu INT,
  ADD COLUMN IF NOT EXISTS target_seitai  INT;

COMMENT ON COLUMN public.reservation_staff.target_jusei   IS '月間目標: 柔整カテゴリ';
COMMENT ON COLUMN public.reservation_staff.target_shinkyu IS '月間目標: 鍼灸カテゴリ';
COMMENT ON COLUMN public.reservation_staff.target_seitai  IS '月間目標: 整体カテゴリ';
