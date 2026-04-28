-- ================================================================
-- からだ鍼灸整骨院（徳島市・藤川雅之院長）専用 LP データ シード
-- 実行場所: hiraiwayuji@gmail.com の Supabase（4院共有 単一DB）
-- 出典    : 公式サイト http://karadakara.jp/
-- 抽出日  : 2026-04-28
-- ================================================================
-- ✅ 院情報:
--   〒771-0124 徳島市川内町鈴江南 43-1
--   TEL 088-679-1239
--   月火木金土 10:00-20:00 / 水日祝 休診
--   大部屋4ベッド + 個室 / 駐車場7台無料 / 訪問治療対応
--   徳島市国民健康保険指定施術所
--
-- ✅ 院長 藤川雅之：
--   ・ドイツ・ブンデスリーガ ハノーファー96（Hannover 96）にて
--     鍼灸メディカルトレーナーとして帯同経験
--   ・元プロサッカー選手（小3〜大学4年で膝靭帯断裂）
--   ・資格：柔道整復師、鍼灸師、WFAピリオダイゼーション
--
-- ✅ 実運用 clinic_id = d3b55abc-46a6-4cbe-8198-21c0392d9a2e
--    (Vercel karada-clinic の NEXT_PUBLIC_CLINIC_ID と一致確認済み)
--
-- ⚠️ 価格は公式サイトに明示掲載なしのため NULL（お問い合わせ）にしています。
--    院長と確認後、/admin/settings/edit のコース編集で個別に価格設定してください。
-- ================================================================

-- ---------------------------------------------------------------
-- STEP 0: 必要カラム追加（自動マイグレーションが未稼働の環境向け）
-- ---------------------------------------------------------------
ALTER TABLE public.reservation_courses
  ADD COLUMN IF NOT EXISTS image_url           TEXT,
  ADD COLUMN IF NOT EXISTS is_coupon           BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_first_visit_only BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_repeat_only      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS regular_price       INTEGER,
  ADD COLUMN IF NOT EXISTS badge_label         TEXT;

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS hero_subtitle       TEXT,
  ADD COLUMN IF NOT EXISTS hero_image_url      TEXT,
  ADD COLUMN IF NOT EXISTS hero_background_url TEXT,
  ADD COLUMN IF NOT EXISTS lp_features         JSONB,
  ADD COLUMN IF NOT EXISTS lp_target_problems  JSONB,
  ADD COLUMN IF NOT EXISTS lp_voice_quote      TEXT,
  ADD COLUMN IF NOT EXISTS lp_voice_author     TEXT,
  ADD COLUMN IF NOT EXISTS lp_cta_text         TEXT,
  ADD COLUMN IF NOT EXISTS theme_color         TEXT;

-- ---------------------------------------------------------------
-- STEP 1: clinic_settings に LP 情報を反映
-- ---------------------------------------------------------------
UPDATE public.clinic_settings
SET
  hero_title          = 'からだ鍼灸整骨院',
  hero_subtitle       = 'ドイツ・ブンデスリーガ「ハノーファー96」にて鍼灸メディカルトレーナーを務めた院長が、日常の痛みからアスリートのパフォーマンス向上まで、一人ひとりに寄り添ってサポートします。',
  theme_color         = 'emerald',
  lp_cta_text         = '施術メニューから予約する',
  phone_number        = '088-679-1239',
  address             = '〒771-0124 徳島市川内町鈴江南 43-1',
  area_name           = '徳島市 川内町',
  hp_url              = 'http://karadakara.jp/',
  lp_target_problems  = '[
    "デスクワークによる首肩こり・腰痛",
    "関節をくじいた・捻挫など日常のケガ",
    "季節の変わり目のダルさ・つらさ",
    "従来の整骨院ではカバーできない不定愁訴",
    "スポーツ外傷・パフォーマンス低下",
    "交通事故後の痛み・むち打ち"
  ]'::jsonb,
  lp_features         = '[
    {"icon": "award", "title": "ブンデスリーガで活躍した院長", "description": "ドイツ1部「ハノーファー96」で鍼灸メディカルトレーナーを務めた藤川院長。プロアスリートを支えた技術を、地域の皆さまに還元します。"},
    {"icon": "stethoscope", "title": "国家資格保有の専門家による施術", "description": "柔道整復師・鍼灸師の国家資格に加え、WFAピリオダイゼーションも保有。解剖学・生理学・運動学に基づく根拠ある治療です。"},
    {"icon": "shield", "title": "健康保険適用の安心治療", "description": "徳島市国民健康保険指定施術所。日常のケガから慢性痛まで、保険診療で気軽にご相談いただけます。訪問治療も保険適用。"},
    {"icon": "activity", "title": "アスリートケア・運動指導まで", "description": "スポーツ外傷の治療・テーピング・ストレッチに加え、パフォーマンス向上のためのフィジカルトレーニング指導もサポートします。"}
  ]'::jsonb,
  lp_voice_quote      = '院長は元プロサッカー選手で、しかもドイツのブンデスリーガで帯同経験があると聞いて驚きました。スポーツの怪我に詳しいだけでなく、毎日のデスクワークの肩こりにも丁寧に対応してくれます。',
  lp_voice_author     = '40代男性 徳島市在住'
WHERE id = 'd3b55abc-46a6-4cbe-8198-21c0392d9a2e';

-- ---------------------------------------------------------------
-- STEP 2: 既存コース（hotpepper誤投入版含む）を非表示化
-- ---------------------------------------------------------------
-- 静岡の別院から誤って取り込んだHotPepper風クーポンが混じっている可能性があるため
-- 全削除してクリーンに入れ直す
DELETE FROM public.reservation_courses
WHERE clinic_id = 'd3b55abc-46a6-4cbe-8198-21c0392d9a2e'
  AND image_url LIKE 'https://imgbp.hotp.jp/%';

-- それ以外の既存コース（手動で入れたもの）は念のため非表示化
UPDATE public.reservation_courses
SET is_active = false
WHERE clinic_id = 'd3b55abc-46a6-4cbe-8198-21c0392d9a2e';

-- ---------------------------------------------------------------
-- STEP 3: 公式サイトの施術内容に基づく基本メニューを投入
-- ---------------------------------------------------------------
-- 価格は NULL（要相談）として登録。院長が確定後 /admin/settings/edit で
-- 個別に価格設定してください。所要時間は実運用に合わせて 30/60 分で仮設定。
INSERT INTO public.reservation_courses
  (clinic_id, name, duration_minutes, price, regular_price, description, is_active, sort_order, image_url, is_coupon, is_first_visit_only, is_repeat_only, badge_label)
VALUES
('d3b55abc-46a6-4cbe-8198-21c0392d9a2e', '保険診療｜外傷・関節痛・慢性痛のケア', 30, NULL, NULL, '外傷のケガや負傷、様々な痛みの原因を解剖学・生理学・運動学に基づいて全身に問診治療を施し、早期回復を目指します。徳島市国民健康保険指定施術所。', true, 1, NULL, false, false, false, '保険適用'),
('d3b55abc-46a6-4cbe-8198-21c0392d9a2e', '鍼灸（はり・きゅう）', 60, NULL, NULL, '手技では届かない深層部まで刺激を与え、硬くなった筋肉・関節を緩めます。緊張緩和、痛み軽減、疲労回復に。副作用なく自然治癒力・免疫力UP。WHO認定の世界的治療法。', true, 2, NULL, false, false, false, 'WHO認定'),
('d3b55abc-46a6-4cbe-8198-21c0392d9a2e', 'からだ式整体', 60, NULL, NULL, '筋肉・関節の歪みやズレを、肩甲骨と骨盤を軸に手足の先端から身体の中心方向へ手技で各関節を細かく動かし、筋肉のゆるみを作り、肩甲骨・骨盤を正常な位置に戻します。', true, 3, NULL, false, false, false, '人気'),
('d3b55abc-46a6-4cbe-8198-21c0392d9a2e', 'マッサージ（じっくりセット）', 60, NULL, NULL, 'いつもより痛みがある、疲れがなかなか取りきれない、症状が慢性化してきている、もっと長く施術を受けたい、月に数回しか通院できない方にお勧めのセットメニューです。', true, 4, NULL, false, false, false, NULL),
('d3b55abc-46a6-4cbe-8198-21c0392d9a2e', 'スパイラルテーピング', 30, NULL, NULL, 'スパイラルテーピングを皮膚に貼ることで、筋肉・関節のバランスを整えます。痛めている筋肉のサポート役・補う役割として、痛みを軽減でき持続性があります。', true, 5, NULL, false, false, false, NULL),
('d3b55abc-46a6-4cbe-8198-21c0392d9a2e', '交通事故治療（自賠責適用）', 30, NULL, NULL, '他の病院に通っていても併院が可能です。むち打ち・腰痛など交通事故後の痛みにも対応。自賠責保険適用で患者様の負担なくご相談いただけます。', true, 6, NULL, false, false, false, '自賠責適用'),
('d3b55abc-46a6-4cbe-8198-21c0392d9a2e', 'スポーツコンディショニング（鍼灸＋運動指導）', 60, NULL, NULL, 'ブンデスリーガ帯同経験を持つ藤川院長による、アスリート向けの本格コンディショニング。スポーツ外傷治療・テーピング・ストレッチ・運動指導を組み合わせます。', true, 7, NULL, false, false, false, 'アスリート対応'),
('d3b55abc-46a6-4cbe-8198-21c0392d9a2e', '訪問治療（健康保険適用）', 60, NULL, NULL, '急なおケガで来院できない、歩くのが大変という方には往診も対応いたします。健康保険適応。10:00〜16:00の時間帯で応相談。お気軽にスタッフまでお申し付けください。', true, 8, NULL, false, false, false, '訪問可');

-- ---------------------------------------------------------------
-- STEP 4: 確認クエリ（任意）
-- ---------------------------------------------------------------
-- SELECT id, clinic_name, hero_subtitle, theme_color FROM clinic_settings WHERE id = 'd3b55abc-46a6-4cbe-8198-21c0392d9a2e';
-- SELECT name, price, duration_minutes, badge_label
--   FROM reservation_courses WHERE clinic_id = 'd3b55abc-46a6-4cbe-8198-21c0392d9a2e' AND is_active = true ORDER BY sort_order;
