-- ============================================================
-- 患者LP /reserve の予約フローを院ごとに切り替え
-- ============================================================
-- ぼーるくん要望 (2026-05-26):
--   からだ鍼灸整骨院は「メニュー→担当→空き時間」順で予約させたい。
--   既存の「日時→コース→担当」順とは患者UXが大きく違うため、院ごとに切替。
--
-- datetime_first : 既存挙動（日時 → コース → 担当）
-- menu_first     : 逆順（コース → 担当 → 空き日時）治療院系UXに近い
--
-- からだ鍼灸整骨院だけ menu_first をデフォルトに設定
-- ============================================================

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS public_reserve_flow TEXT NOT NULL DEFAULT 'datetime_first';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'clinic_settings_public_reserve_flow_check'
       AND table_name = 'clinic_settings'
  ) THEN
    ALTER TABLE public.clinic_settings
      ADD CONSTRAINT clinic_settings_public_reserve_flow_check
      CHECK (public_reserve_flow IN ('datetime_first', 'menu_first'));
  END IF;
END $$;

COMMENT ON COLUMN public.clinic_settings.public_reserve_flow IS
  '患者LP /reserve の入力フロー: datetime_first(日時先) / menu_first(メニュー先)';

UPDATE public.clinic_settings
   SET public_reserve_flow = 'menu_first'
 WHERE id = 'd3b55abc-46a6-4cbe-8198-21c0392d9a2e';
