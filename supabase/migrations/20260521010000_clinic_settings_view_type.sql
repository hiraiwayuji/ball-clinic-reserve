-- ============================================================
-- clinic_settings に view_type 列を追加（ダッシュボード予約ビュー切替）
-- ============================================================
-- 院ごとに「一覧ビュー / スタッフ×時間軸タイムテーブル」を選べる。
-- 「機能 ON/OFF フラグ」ではなく「表示形式の選択」なので、
-- 「クリニック単位の機能フラグ禁止」ルールには抵触しない（max_beds 等と同類）。
--
-- - 既存院デフォルト: 'list'（破壊的変更なし）
-- - からだ鍼灸整骨院（藤川先生）: 'timeline'（手書き予約表を再現）
-- ============================================================

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS view_type TEXT NOT NULL DEFAULT 'list';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinic_settings_view_type_check'
  ) THEN
    ALTER TABLE public.clinic_settings
      ADD CONSTRAINT clinic_settings_view_type_check
      CHECK (view_type IN ('list', 'timeline'));
  END IF;
END $$;

COMMENT ON COLUMN public.clinic_settings.view_type IS
  '管理ダッシュボードに表示する予約ビューの形式。list=従来の一覧、timeline=スタッフ×時間軸グリッド';

-- からだ鍼灸整骨院は timeline をデフォルトに
UPDATE public.clinic_settings
   SET view_type = 'timeline'
 WHERE id = 'd3b55abc-46a6-4cbe-8198-21c0392d9a2e';
