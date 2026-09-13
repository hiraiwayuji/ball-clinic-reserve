-- トレーニング評価: 「軸・項目」を院ごとに編集できるように ＋ 評価の回ごとに写真を残せるように（2026-09-14）
--
-- 背景（からだ鍼灸整骨院・ボール接骨院からの要望）:
--   ・評価の項目を追加・編集したい（前屈・後屈など柔軟性の項目、測り方の説明など）
--   ・トレーニングごとに写真も残したい
--
-- ※ この共有Supabaseは手動スキーマ管理。2026-09-14 に本番へ適用済み。

-- ── 軸・項目の設定 ──
-- NULL なら標準セット（src/lib/training-catalog.ts の DEFAULT_CATALOG）。
-- key は保存済みの点数（training_measurements.item_key / axis）と紐づくため、変更・削除せず hidden で隠す。
ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS training_catalog jsonb;
COMMENT ON COLUMN clinic_settings.training_catalog IS 'トレーニング評価の「軸」と「項目」を院ごとに編集した内容。NULLなら標準セット。keyは保存済みの点数と紐づくため変更・削除せず hidden で隠す';

-- ── 写真 ──
-- ファイル本体は非公開バケット training-photos に置き、service role 経由でだけ読み書きする
-- （患者さんの体の写真なので、公開URLにはしない。表示は期限つきの署名URL）。
CREATE TABLE IF NOT EXISTS public.training_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinic_settings(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES public.training_assessments(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  caption text,
  show_in_report boolean NOT NULL DEFAULT false,
  width integer,
  height integer,
  size_bytes integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.training_photos IS 'トレーニング評価の回ごとの写真。ファイル本体は非公開バケット training-photos（service role 経由でのみ読み書き）';
COMMENT ON COLUMN public.training_photos.show_in_report IS '患者さん向けレポートに載せる（初期値は載せない）';
CREATE INDEX IF NOT EXISTS training_photos_clinic_assessment_idx ON public.training_photos (clinic_id, assessment_id);

-- training_assessments / training_measurements と同じ方針（院の分離はアプリ側の clinic_id 条件で行う）
ALTER TABLE public.training_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read training_photos" ON public.training_photos;
DROP POLICY IF EXISTS "Authenticated insert training_photos" ON public.training_photos;
DROP POLICY IF EXISTS "Authenticated update training_photos" ON public.training_photos;
DROP POLICY IF EXISTS "Authenticated delete training_photos" ON public.training_photos;
CREATE POLICY "Authenticated read training_photos" ON public.training_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert training_photos" ON public.training_photos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update training_photos" ON public.training_photos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete training_photos" ON public.training_photos FOR DELETE TO authenticated USING (true);

-- 非公開バケット（storage.objects にポリシーを作らない＝ログインユーザーからも直接は読めない）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('training-photos', 'training-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
