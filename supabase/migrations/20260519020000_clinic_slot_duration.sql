-- 予約枠サイズ（表示グリッドの刻み）を院ごとに設定可能にする
--
-- 設計判断:
--  - 全院デフォルト 30 分（現状維持）
--  - 選択肢は 15 / 20 / 30 の 3 択のみ（CHECK 制約）
--  - 予約の duration はメニュー別に既に可変なので、ここは「表示グリッド」専用
--  - max_beds と同じ「院ごとの基本属性」扱い（機能フラグ禁止ルールには抵触しない）

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS slot_duration_minutes INTEGER NOT NULL DEFAULT 30;

-- CHECK 制約は IF NOT EXISTS が使えないので、存在しない場合のみ追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clinic_settings_slot_duration_check'
  ) THEN
    ALTER TABLE public.clinic_settings
      ADD CONSTRAINT clinic_settings_slot_duration_check
      CHECK (slot_duration_minutes IN (15, 20, 30));
  END IF;
END $$;

COMMENT ON COLUMN public.clinic_settings.slot_duration_minutes IS
  '予約画面で表示するグリッドの刻み（15/20/30分）。予約の所要時間はメニュー側で別途管理';
