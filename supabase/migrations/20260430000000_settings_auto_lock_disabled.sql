-- 設定画面ロック: 自動再ロック無効モード
-- スタッフ不在院向け: 最初に 0000 で解錠したあとは、オーナーが「再ロック」を押すまで解錠状態を維持する。

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS settings_auto_lock_disabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.clinic_settings.settings_auto_lock_disabled IS
  '設定画面ロックの自動再ロック（30分）を無効化するフラグ。TRUE のとき解錠 cookie の TTL を 1 年に延長する。';
