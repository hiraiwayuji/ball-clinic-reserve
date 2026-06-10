-- AI集客投稿アシスタント（全院共通機能。まずはボール接骨院で運用、他院は ai_marketing_profiles 未設定時にボール既定値へフォールバック）
-- 新規テーブルのみ追加（既存テーブルには触らない）。tenant isolation: clinic_id 必須・.eq 徹底

-- 1) 生成した投稿案の保存
CREATE TABLE IF NOT EXISTS ai_marketing_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL,

    -- 入力（再生成・履歴詳細で再利用）
    category TEXT NOT NULL,                 -- 症例紹介 / オスグッド / スポーツ障害 ...
    audience TEXT,                          -- 小学生 / 保護者 / アスリート ...
    sport TEXT,                             -- サッカー / 野球 ...
    theme TEXT,                             -- 症状・テーマ
    treatment TEXT,                         -- 施術内容
    message TEXT,                           -- 伝えたいこと
    has_media BOOLEAN NOT NULL DEFAULT false,
    tone TEXT,                              -- やさしい / 専門的 ...
    notes TEXT,                             -- 注意事項
    no_personal_info BOOLEAN NOT NULL DEFAULT true,

    -- 出力
    instagram_text TEXT,
    story_slides JSONB NOT NULL DEFAULT '[]'::jsonb,   -- ["1枚目","2枚目","3枚目"]
    google_text TEXT,
    line_text TEXT,
    blog JSONB,                              -- {seo_title, headings[], body, meta_description, keywords[], cta}

    status TEXT NOT NULL DEFAULT 'draft',    -- draft(下書き) | reviewed(確認済み) | posted(投稿済み) | rejected(ボツ)
    memo TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_marketing_posts_list
  ON ai_marketing_posts (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_marketing_posts_filter
  ON ai_marketing_posts (clinic_id, category, status);

ALTER TABLE ai_marketing_posts ENABLE ROW LEVEL SECURITY;

-- 管理画面（認証済み）はフル操作可。テナント分離はアプリ側 .eq("clinic_id") で担保
DROP POLICY IF EXISTS "Authenticated full access on ai_marketing_posts" ON ai_marketing_posts;
CREATE POLICY "Authenticated full access on ai_marketing_posts" ON ai_marketing_posts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- 2) 院ごとの AI 投稿プロファイル（将来の他院横展開用。未設定時はアプリ側でボール接骨院の既定値）
CREATE TABLE IF NOT EXISTS ai_marketing_profiles (
    clinic_id UUID PRIMARY KEY,
    clinic_name TEXT,                        -- 院名
    area_name TEXT,                          -- 地域名（藍住 / 徳島 など）
    address TEXT,                            -- 住所
    strengths JSONB NOT NULL DEFAULT '[]'::jsonb,             -- 強み（配列）
    menus JSONB NOT NULL DEFAULT '[]'::jsonb,                 -- メニュー（配列）
    targets JSONB NOT NULL DEFAULT '[]'::jsonb,               -- ターゲット（配列）
    tone TEXT,                               -- 文章の雰囲気（自由記述）
    banned_phrases JSONB NOT NULL DEFAULT '[]'::jsonb,        -- 禁止表現（配列）
    recommended_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,  -- 推奨キーワード（配列）
    sns_accounts JSONB NOT NULL DEFAULT '{}'::jsonb,          -- {instagram, google, line, ...}
    line_link TEXT,                          -- LINE 導線
    reserve_url TEXT,                        -- 予約URL

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_marketing_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated full access on ai_marketing_profiles" ON ai_marketing_profiles;
CREATE POLICY "Authenticated full access on ai_marketing_profiles" ON ai_marketing_profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
