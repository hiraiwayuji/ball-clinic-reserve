-- ============================================================
-- 患者向け予約LP用フィールド：clinic_settings 拡張
-- ============================================================
-- /reserve/menu と /reserve スタートページを各院HPに合わせた
-- ランディングページ化するために必要なフィールドを追加。
-- 全カラム IF NOT EXISTS で冪等。値は院ごとに異なる前提で NULL 許可。
-- ============================================================

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS hero_subtitle      TEXT,
  ADD COLUMN IF NOT EXISTS hero_image_url     TEXT,
  ADD COLUMN IF NOT EXISTS hero_background_url TEXT,
  ADD COLUMN IF NOT EXISTS lp_features        JSONB,
  ADD COLUMN IF NOT EXISTS lp_target_problems JSONB,
  ADD COLUMN IF NOT EXISTS lp_voice_quote     TEXT,
  ADD COLUMN IF NOT EXISTS lp_voice_author    TEXT,
  ADD COLUMN IF NOT EXISTS lp_cta_text        TEXT,
  ADD COLUMN IF NOT EXISTS theme_color        TEXT;

COMMENT ON COLUMN public.clinic_settings.hero_subtitle
  IS 'LP ヒーロー直下のサブキャッチ。例：「メディセルでどこにも行っても良くならない慢性痛を改善」';
COMMENT ON COLUMN public.clinic_settings.hero_image_url
  IS 'LP メインビジュアル（施術風景・院内など 1枚）。横長推奨 1200x600';
COMMENT ON COLUMN public.clinic_settings.hero_background_url
  IS 'LP ヒーロー全体背景画像（任意）。指定なしなら theme_color のグラデ';
COMMENT ON COLUMN public.clinic_settings.lp_features
  IS '強み一覧。例: [{"icon":"sparkles","title":"メディセル筋膜リリース","description":"..."}, ...]';
COMMENT ON COLUMN public.clinic_settings.lp_target_problems
  IS 'お悩みリスト。例: ["どこに行っても良くならない慢性痛","ぎっくり腰","頭痛・不眠"]';
COMMENT ON COLUMN public.clinic_settings.lp_voice_quote
  IS '代表的な患者の声（短文）';
COMMENT ON COLUMN public.clinic_settings.lp_voice_author
  IS '声の発信者属性（例：「30代女性 会社員」）';
COMMENT ON COLUMN public.clinic_settings.lp_cta_text
  IS 'メインCTAボタンの文言（指定なしなら「クーポン・メニューから予約」）';
COMMENT ON COLUMN public.clinic_settings.theme_color
  IS 'LP テーマ色。Tailwind カラー名（blue/violet/emerald/amber/rose/sky/teal/indigo のいずれか）。primary_color と分離して LP 専用に変えられる';

-- 公開LPで anon ユーザーが特定院の設定を読めるようにする RLS ポリシー
-- （既存の anon 読み取り許可があるかチェックして、足りないものだけ追加）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'clinic_settings'
      AND policyname = 'anon_can_read_public_lp_fields'
  ) THEN
    CREATE POLICY anon_can_read_public_lp_fields
      ON public.clinic_settings
      FOR SELECT
      USING (true);
  END IF;
END $$;
