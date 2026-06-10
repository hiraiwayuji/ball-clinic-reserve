-- AI集客投稿アシスタント 第2弾: 画像・動画・生成AI画像対応
-- ai_marketing_posts へ素材・各種パック・投稿予定/実績カラムを追加。Storageバケットも用意。
-- 既存カラムには触らず ADD COLUMN のみ（後方互換）。

ALTER TABLE ai_marketing_posts
  ADD COLUMN IF NOT EXISTS materials JSONB NOT NULL DEFAULT '[]'::jsonb,        -- 素材一覧 [{url,mime,category,kind,memo,name,size}]
  ADD COLUMN IF NOT EXISTS media_modes JSONB NOT NULL DEFAULT '[]'::jsonb,      -- 使用予定媒体・制作前提
  ADD COLUMN IF NOT EXISTS video_context TEXT,                                  -- 動画内容のテキスト説明（MVP: 手入力）
  ADD COLUMN IF NOT EXISTS image_pack JSONB,                                    -- 画像投稿用パック
  ADD COLUMN IF NOT EXISTS reel_pack JSONB,                                     -- リール動画用パック
  ADD COLUMN IF NOT EXISTS ai_image_pack JSONB,                                 -- AI画像生成プロンプト群
  ADD COLUMN IF NOT EXISTS story_extras JSONB,                                  -- ストーリー追加（アンケート/質問スタンプ/予約導線）
  ADD COLUMN IF NOT EXISTS scheduled_date DATE,                                 -- 投稿予定日
  ADD COLUMN IF NOT EXISTS posted_date DATE;                                    -- 実際に投稿した日

-- Storage バケット（画像・動画素材）。public 読み取り、最大100MB。
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ai-marketing-materials',
  'ai-marketing-materials',
  true,
  104857600,  -- 100MB
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','video/mp4','video/quicktime','video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- Storage ポリシー（既存 expense-receipts と同じ方針：ログイン者のみ upload/select/delete）
DROP POLICY IF EXISTS "ai_marketing upload" ON storage.objects;
CREATE POLICY "ai_marketing upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'ai-marketing-materials');

DROP POLICY IF EXISTS "ai_marketing select" ON storage.objects;
CREATE POLICY "ai_marketing select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'ai-marketing-materials');

DROP POLICY IF EXISTS "ai_marketing delete" ON storage.objects;
CREATE POLICY "ai_marketing delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'ai-marketing-materials');
