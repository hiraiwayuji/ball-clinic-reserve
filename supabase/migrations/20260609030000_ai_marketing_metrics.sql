-- AI集客投稿アシスタント 第3弾: 効果の見える化
-- 投稿ごとの反応（いいね・保存・コメント・リーチ・予約につながった数）を手動記録できるようにする。
-- 既存カラムには触らず ADD COLUMN のみ。

ALTER TABLE ai_marketing_posts
  ADD COLUMN IF NOT EXISTS metrics JSONB;  -- {likes,saves,comments,reach,reservations,memo}
