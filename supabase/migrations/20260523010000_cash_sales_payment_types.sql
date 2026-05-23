-- ============================================================
-- cash_sales: 支払区分の複数選択対応
-- ============================================================
-- ぼーるくん要望 (2026-05-23): 1 回の会計で「保険 + 自費 + 鍼」のように
-- 複数の支払区分が混在するケースに対応したい。
--
-- 設計:
-- - 既存の payment_type (TEXT) は legacy として残置（後方互換）
-- - 新規 payment_types (TEXT[]) を追加。複数選択時はこちらに配列で保存
-- - 集計側は payment_types を優先、空なら payment_type を1要素配列として扱う
-- ============================================================

ALTER TABLE public.cash_sales
  ADD COLUMN IF NOT EXISTS payment_types TEXT[];

COMMENT ON COLUMN public.cash_sales.payment_types IS
  '支払区分の複数選択値（payment_categories.key の配列）。1要素ならpayment_typeと同じ。複数あれば保険+自費 等の混在会計を表す。';

-- GIN index for array contains 検索（集計時に payment_types @> ARRAY['hoken'] 等）
CREATE INDEX IF NOT EXISTS idx_cash_sales_payment_types
  ON public.cash_sales USING GIN (payment_types);
