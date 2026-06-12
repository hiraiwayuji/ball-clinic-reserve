-- AI集客投稿アシスタント: 「お手本の雰囲気（参考作風）」を院ごとに登録できるようにする。
-- 投稿生成時に毎回この作風を参考にする（丸写しはしない・あくまで雰囲気の参考）。
ALTER TABLE ai_marketing_profiles
  ADD COLUMN IF NOT EXISTS reference_style TEXT;
