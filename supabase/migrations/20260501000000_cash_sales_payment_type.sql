-- cash_sales.payment_type: 0円計上を可能にする支払区分
-- 自賠責保険・はぐくみ医療（徳島市の子ども医療費助成）など、患者負担 0 円で受付する
-- ケースを明示的に保存するためのフラグ。null = 通常の自費。
--
-- 値:
--   self_pay  : 通常の自費（NULL でも同じ扱い、明示したい場合に使う）
--   jibaiseki : 自賠責保険適用
--   hagukumi  : はぐくみ医療（こども医療費助成）適用
--   other     : 上記以外の 0 円対応（労災・公費等を後で追加するための予備）

ALTER TABLE public.cash_sales
  ADD COLUMN IF NOT EXISTS payment_type TEXT;

ALTER TABLE public.cash_sales
  DROP CONSTRAINT IF EXISTS cash_sales_payment_type_check;

ALTER TABLE public.cash_sales
  ADD CONSTRAINT cash_sales_payment_type_check
  CHECK (payment_type IS NULL OR payment_type IN ('self_pay', 'jibaiseki', 'hagukumi', 'other'));

CREATE INDEX IF NOT EXISTS idx_cash_sales_payment_type
  ON public.cash_sales(clinic_id, sale_date, payment_type)
  WHERE payment_type IS NOT NULL;

COMMENT ON COLUMN public.cash_sales.payment_type IS
  '支払区分: self_pay/jibaiseki/hagukumi/other。NULL は通常の自費。0 円計上時は必ず設定する運用。';
