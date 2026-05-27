-- ============================================================
-- 経費管理を「オーナー専用」に切り替えるフラグ
-- ============================================================
-- ぼーるくん要望 (2026-05-27):
--   院によっては経費の管理を完全にオーナーが行い、
--   スタッフには経費画面を一切見せたくない（からだ鍼灸整骨院など）。
--   ダッシュボードのショートカット・/admin/expenses ページ・関連
--   メニューを、role != 'owner' のユーザーから完全に非表示にする。
--
-- 設計:
-- - clinic_settings.expense_owner_only: BOOLEAN DEFAULT FALSE
--   true の院では、clinic_users.role = 'owner' 以外のユーザーから
--   経費関連の UI / ページが見えないようにフロント＆サーバー両方で
--   ガードする。
-- ============================================================

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS expense_owner_only BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.clinic_settings.expense_owner_only IS
  'true = 経費管理をオーナーのみに制限（staff/admin からは完全非表示）';
