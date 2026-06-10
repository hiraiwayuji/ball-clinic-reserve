-- 料金プラン（フリーミアム）。free=基本の文章生成まで / premium=画像・動画・生成AI画像など上位機能も。
-- 販売者（ぼーるくん）制御のため settingsData には載せない＝オーナーの設定UIからは変更不可（読み取り専用）。
-- 既存院はデフォルト free。ボール接骨院（自院）は premium。

ALTER TABLE clinic_settings
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

-- ボール接骨院（自院）はプレミアム
UPDATE clinic_settings SET plan = 'premium'
  WHERE id = '00000000-0000-0000-0000-000000000001';
