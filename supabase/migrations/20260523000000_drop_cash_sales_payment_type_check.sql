-- ============================================================
-- cash_sales.payment_type の固定値 CHECK 制約を削除
-- ============================================================
-- 緊急対応 (2026-05-23): からだ鍼灸整骨院で売上登録が失敗。
-- 原因: payment_type CHECK が ('self_pay','jibaiseki','rosai','hagukumi','other')
-- に固定されていたが、payment_categories マスタは院ごとに自由カテゴリを設定可能。
-- karada では「保険施術」(key=hoken) 等が登録されており、これを選ぶと制約違反で
-- INSERT 失敗 → 「保存に失敗しました」エラーになっていた。
--
-- 対応: CHECK 制約を削除。アプリ側 (normalizePaymentType) で 50 文字制限のみ。
-- 妥当性は payment_categories の参照側で別途判定するため、DB レベルでの enum 制約は不要。
-- ============================================================

ALTER TABLE public.cash_sales
  DROP CONSTRAINT IF EXISTS cash_sales_payment_type_check;
