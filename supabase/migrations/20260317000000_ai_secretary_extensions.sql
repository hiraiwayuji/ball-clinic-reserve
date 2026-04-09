-- AI Memos Table
CREATE TABLE IF NOT EXISTS ai_memos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Weekly Blog Proposals Table
CREATE TABLE IF NOT EXISTS ai_blog_proposals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    week_start DATE NOT NULL,
    title TEXT NOT NULL,
    content_draft TEXT,
    keywords TEXT[],
    status TEXT DEFAULT 'proposed', -- proposed, used, discarded
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE ai_memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_blog_proposals ENABLE ROW LEVEL SECURITY;

-- Admins only
CREATE POLICY "Admins can do everything on ai_memos" ON ai_memos
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Admins can do everything on ai_blog_proposals" ON ai_blog_proposals
  FOR ALL TO authenticated USING (true);
