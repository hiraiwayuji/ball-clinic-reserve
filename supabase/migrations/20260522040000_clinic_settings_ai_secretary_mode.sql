-- ============================================================
-- clinic_settings に ai_secretary_mode 列を追加（AI秘書の表示範囲）
-- ============================================================
-- 院ごとに「全画面常駐 / 管理画面のみ（オーナー・管理者のみ）」を選べる。
-- 院によってはスタッフに AI秘書 のUIや文言を見せたくないという要望に対応。
--
-- 「機能 ON/OFF フラグ」ではなく「表示範囲の選択」なので、
-- 「クリニック単位の機能フラグ禁止」ルールには抵触しない（view_type と同類）。
--
-- - 'global'     : 全画面に AI秘書 を表示（現状の動作。デフォルト）
-- - 'admin_only' : 管理画面のみ + role が owner/admin の時だけ表示（staff には非表示）
--
-- 既存院デフォルト: 'global'（破壊的変更なし）
-- からだ鍼灸整骨院: 'admin_only'（藤川先生の要望）
-- ============================================================

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS ai_secretary_mode TEXT NOT NULL DEFAULT 'global';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinic_settings_ai_secretary_mode_check'
  ) THEN
    ALTER TABLE public.clinic_settings
      ADD CONSTRAINT clinic_settings_ai_secretary_mode_check
      CHECK (ai_secretary_mode IN ('global', 'admin_only'));
  END IF;
END $$;

COMMENT ON COLUMN public.clinic_settings.ai_secretary_mode IS
  'AI秘書の表示範囲。global=全画面常駐(現状)、admin_only=管理画面のみ＆オーナー/管理者のみ表示';

-- からだ鍼灸整骨院: スタッフには AI秘書を見せない運用
UPDATE public.clinic_settings
   SET ai_secretary_mode = 'admin_only'
 WHERE id = 'd3b55abc-46a6-4cbe-8198-21c0392d9a2e';
