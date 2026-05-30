-- Blog feature (common across all clinics)
-- 管理画面から投稿 → 公開API(/api/public/blog/[clinicId]) → 外部HPがfetch読込
-- 新規テーブルのみ追加（既存テーブルには触らない）。tenant isolation: clinic_id 必須・.eq徹底

CREATE TABLE IF NOT EXISTS clinic_blog_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,                       -- URL用（clinic内で一意）
    content_html TEXT NOT NULL DEFAULT '',    -- 本文（HTML）
    excerpt TEXT,                             -- 一覧用の抜粋
    cover_image_url TEXT,                     -- アイキャッチ画像
    category TEXT,                            -- 任意のカテゴリ（リンパ/カフェ/お知らせ 等）
    status TEXT NOT NULL DEFAULT 'draft',     -- draft | published | archived
    published_at TIMESTAMPTZ,                 -- 公開日時（published のとき設定）
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (clinic_id, slug)
);

-- 公開記事の一覧取得（clinic_id × published × 新着順）を高速化
CREATE INDEX IF NOT EXISTS idx_clinic_blog_posts_public
  ON clinic_blog_posts (clinic_id, status, published_at DESC);

ALTER TABLE clinic_blog_posts ENABLE ROW LEVEL SECURITY;

-- 管理画面（認証済み）はフル操作可。テナント分離はアプリ側 .eq("clinic_id") で担保
CREATE POLICY "Authenticated full access on clinic_blog_posts" ON clinic_blog_posts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 外部HP（anon）は「公開済み」記事のみ閲覧可
CREATE POLICY "Public can read published blog posts" ON clinic_blog_posts
  FOR SELECT TO anon USING (status = 'published');
