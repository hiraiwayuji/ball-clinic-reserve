-- 1. clinic_holidays テーブルの作成
CREATE TABLE IF NOT EXISTS public.clinic_holidays (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Row Level Security (RLS) の有効化
ALTER TABLE public.clinic_holidays ENABLE ROW LEVEL SECURITY;

-- 3. 誰でも読み取れるようにするポリシー（プロトタイプ・公開用）
CREATE POLICY "Allow anon read access on clinic_holidays"
  ON public.clinic_holidays
  FOR SELECT
  USING (true);

-- 4. 誰でも追加・削除できるようにするポリシー（プロトタイプ管理用）
CREATE POLICY "Allow anon insert access on clinic_holidays"
  ON public.clinic_holidays
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow anon delete access on clinic_holidays"
  ON public.clinic_holidays
  FOR DELETE
  USING (true);
