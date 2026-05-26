-- ============================================================
-- reservation_staff.email カラムの存在保証（冪等）
-- ============================================================
-- 2026-05-15 の staff_schedule migration の CREATE TABLE 内で email は
-- 定義されているが、本番テーブルが手動作成されている院では存在しない
-- 可能性があるため、ALTER ADD COLUMN IF NOT EXISTS で明示的に追加。
--
-- 用途: /admin/my-schedule（自分の休み希望提出）で
--   auth.email == reservation_staff.email で本人レコードを引き当て。
-- ============================================================

ALTER TABLE public.reservation_staff
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN public.reservation_staff.email IS
  'スタッフのログイン用メールアドレス。/admin/my-schedule で本人スタッフレコード解決に使う。';

-- メール検索用 partial index（重複は許す: 1人で複数 staff レコード等のレアケース対応）
CREATE INDEX IF NOT EXISTS idx_reservation_staff_email
  ON public.reservation_staff (clinic_id, lower(email))
  WHERE email IS NOT NULL;
