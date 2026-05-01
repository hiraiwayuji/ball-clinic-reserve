-- cash_sales.payment_type: 0円計上を可能にする支払区分（全院共通）
-- 自賠責・労災・はぐくみ医療など、患者負担 0 円で受付するケースを
-- 明示的に保存するためのフラグ。NULL = 通常の自費。
--
-- 値:
--   self_pay  : 通常の自費（NULL でも同じ扱い、明示したい場合に使う）
--   jibaiseki : 自賠責保険
--   rosai     : 労災保険
--   hagukumi  : はぐくみ医療（こども医療費助成・各自治体の同等制度を含む）
--   other     : 上記以外の 0 円対応（任意の補助制度・院内サービス等）

ALTER TABLE public.cash_sales
  ADD COLUMN IF NOT EXISTS payment_type TEXT;

-- 過渡期に 'subsidy' を入れた既存データがあれば 'hagukumi' に移行（再実行可）
UPDATE public.cash_sales
   SET payment_type = 'hagukumi'
 WHERE payment_type = 'subsidy';

ALTER TABLE public.cash_sales
  DROP CONSTRAINT IF EXISTS cash_sales_payment_type_check;

ALTER TABLE public.cash_sales
  ADD CONSTRAINT cash_sales_payment_type_check
  CHECK (payment_type IS NULL OR payment_type IN ('self_pay', 'jibaiseki', 'rosai', 'hagukumi', 'other'));

CREATE INDEX IF NOT EXISTS idx_cash_sales_payment_type
  ON public.cash_sales(clinic_id, sale_date, payment_type)
  WHERE payment_type IS NOT NULL;

COMMENT ON COLUMN public.cash_sales.payment_type IS
  '支払区分: self_pay/jibaiseki/rosai/hagukumi/other。NULL は通常の自費。0 円計上時は必ず設定する運用。';
