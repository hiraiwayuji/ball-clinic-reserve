-- AI集客投稿アシスタント: LINE一斉配信の実績記録
-- 生成した LINE 配信文を履歴からワンクリックで患者へ一斉配信できるようにする。
-- 既存カラムには触れず ADD COLUMN のみ（後方互換）。

ALTER TABLE ai_marketing_posts
  ADD COLUMN IF NOT EXISTS line_sent_at TIMESTAMPTZ,   -- 一斉配信した日時（未配信は NULL）
  ADD COLUMN IF NOT EXISTS line_sent_count INTEGER;    -- 配信成功した人数
