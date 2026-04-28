-- ============================================================
-- メニュー・クーポンLP化対応：reservation_courses 拡張
-- ============================================================
-- 既存の reservation_courses テーブルを拡張し、
-- ホットペッパー風 LP 表示に必要なメタデータを追加する。
-- 新テーブル（coupons / service_menus）は作らず、既存テーブルを拡張する設計。
--
-- 追加カラム：
--   image_url           : Supabase Storage の写真URL
--   is_coupon           : true=クーポン / false=通常メニュー
--   is_first_visit_only : 新規限定フラグ
--   badge_label         : 「人気No.1」「期間限定」などの任意ラベル
-- ============================================================

ALTER TABLE public.reservation_courses
  ADD COLUMN IF NOT EXISTS image_url           TEXT,
  ADD COLUMN IF NOT EXISTS is_coupon           BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_first_visit_only BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_repeat_only      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS regular_price       INTEGER,
  ADD COLUMN IF NOT EXISTS badge_label         TEXT;

COMMENT ON COLUMN public.reservation_courses.image_url
  IS 'Supabase Storage の写真URL（クーポンLP用）';
COMMENT ON COLUMN public.reservation_courses.is_coupon
  IS 'true=クーポン / false=通常メニュー';
COMMENT ON COLUMN public.reservation_courses.is_first_visit_only
  IS '新規限定フラグ（対象区分「新規」）';
COMMENT ON COLUMN public.reservation_courses.is_repeat_only
  IS '再来（2回目以降）限定フラグ（対象区分「再来」）。新規限定と排他';
COMMENT ON COLUMN public.reservation_courses.regular_price
  IS '通常価格（クーポンの「¥XX,XXX → ¥X,XXX」訴求用。NULL なら割引表示なし）';
COMMENT ON COLUMN public.reservation_courses.badge_label
  IS '「人気No.1」「期間限定」「水曜限定」などのカスタムバッジラベル';

-- 一覧クエリでクーポン/通常を素早く分けるための部分インデックス
CREATE INDEX IF NOT EXISTS idx_reservation_courses_active_coupon
  ON public.reservation_courses(clinic_id, is_coupon, sort_order)
  WHERE is_active = true;
