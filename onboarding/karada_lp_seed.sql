-- ================================================================
-- からだ鍼灸整骨院 専用 LP データ シード
-- 実行場所: hiraiwayuji@gmail.com の Supabase（4院共有 単一DB）
-- 出典    : ホットペッパービューティー salonH000748897
-- 抽出日  : 2026-04-28
-- ================================================================
-- ✅ アーキテクチャ: 4院は同じ Supabase を共有し、clinic_id で分離する方式
-- ✅ 院情報: 「筋肉の痛み専門家　からだ鍼灸整骨院」
--           静岡県静岡市葵区水道町86 / 静岡駅10分・新静岡駅8分
--           評価 4.92（52件）/ 国家資格者による施術
--
-- ⚠️ 重要：
--   このSQLを実行する前に、{{KARADA_CLINIC_ID}} を実運用の
--   clinic_id（Vercel karada-clinic の NEXT_PUBLIC_CLINIC_ID）に
--   置換してから Run してください。
--
--   候補（clinic_settings の確認結果から）:
--     d3b55abc-46a6-4cbe-8198-21c0392d9a2e  (karada鍼灸整骨院)
--     25d5c618-e958-44e3-bf01-82598ca2fec4  (からだ鍼灸整骨院)
--   どちらか Vercel と一致する方が本物。
--
-- 全クエリが clinic_id でスコープ限定されているため、他院（本院/マッスル/relaq）
-- のデータには一切影響しません。
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
  hero_subtitle       = '「もう無理…」と諦めかけた慢性痛に。国家資格者による筋膜リリース×トリガーポイント鍼で、深層筋から根本ケアします。',
  theme_color         = 'emerald',
  lp_cta_text         = 'クーポン・メニューから予約する',
  lp_target_problems  = '[
    "どこへ行っても改善しない首肩こり・腰痛",
    "「もう無理」と感じる根深い慢性痛",
    "眼精疲労・頭痛・自律神経の乱れ",
    "疲れているのに眠れない・朝スッキリしない",
    "原因がわからない体の不調"
  ]'::jsonb,
  lp_features         = '[
    {"icon": "stethoscope", "title": "国家資格者による施術", "description": "柔道整復師・はり師・きゅう師の国家資格を持つ専門家が、姿勢・筋肉・動作のクセを丁寧に評価します。"},
    {"icon": "sparkles", "title": "筋膜リリース × トリガーポイント鍼", "description": "マッサージで届かない深層筋の癒着・トリガーポイントへ、ピンポイントでアプローチ。即効性と持続性を両立。"},
    {"icon": "activity", "title": "動作・姿勢評価から始める根本ケア", "description": "症状だけでなく、不調の原因となる体のクセを可視化。納得の施術プランをご提案します。"},
    {"icon": "heart", "title": "鍼灸併用で自律神経も整える", "description": "肩こり・腰痛だけでなく、疲労回復・睡眠の質向上まで。心身ともに軽やかに。"}
  ]'::jsonb,
  lp_voice_quote      = 'マッサージや他の整骨院では届かなかった奥のコリに、トリガーポイント鍼で届いた感覚がありました。「そこだったのか！」と体で実感できる施術です。',
  lp_voice_author     = '40代女性 静岡市在住'
WHERE id = '{{KARADA_CLINIC_ID}}';

-- ---------------------------------------------------------------
-- STEP 2: 既存の汎用コースを非表示化
-- ---------------------------------------------------------------
UPDATE public.reservation_courses
SET is_active = false
WHERE clinic_id = '{{KARADA_CLINIC_ID}}';

-- ---------------------------------------------------------------
-- STEP 3: ホットペッパー掲載の全15クーポンを reservation_courses に投入
-- ---------------------------------------------------------------
INSERT INTO public.reservation_courses
  (clinic_id, name, duration_minutes, price, regular_price, description, is_active, sort_order, image_url, is_coupon, is_first_visit_only, is_repeat_only, badge_label)
VALUES
('{{KARADA_CLINIC_ID}}', '《火曜日限定》【筋膜リリース】肩・腰のお悩みに 60分', 60, 6600, 8800, '平日の火曜日限定。カウンセリング+施術60分の特別価格。筋膜リリース・深層筋アプローチを組み合わせた集中施術でスッキリ解消。', true, 1, 'https://imgbp.hotp.jp/CSP/IMG_SRC_K/36/70/C055903670/C055903670.jpg', true, false, false, '火曜限定'),
('{{KARADA_CLINIC_ID}}', '【人気No.1】筋膜リリース｜首肩・肩甲骨の動きをスムーズに 60分', 60, 7700, 8800, 'ガチガチに固まった首・肩・背中を、筋肉の専門家が徹底ケア。眼精疲労や頭痛の原因となる筋緊張をほぐし、スッキリ軽やかに。カウンセリング20分+マッサージ60分。', true, 2, 'https://imgbp.hotp.jp/CSP/IMG_SRC_K/35/76/C058423576/C058423576.jpg', true, true, false, '人気No.1'),
('{{KARADA_CLINIC_ID}}', '【人気No.2】筋膜リリース｜「もう無理」腰痛の根本に届く 60分', 60, 7700, 8800, 'ガチガチな腰の疲れに。マッサージで届かない深層筋と筋膜の癒着が慢性痛の原因。国家資格者が筋膜の癒着とトリガーポイントを正確に評価・施術し、「そこだったのか」を体で実感。', true, 3, 'https://imgbp.hotp.jp/CSP/IMG_SRC_K/60/51/C058346051/C058346051.jpg', true, true, false, '人気No.2'),
('{{KARADA_CLINIC_ID}}', '【人気No.3】鍼×筋膜リリース｜肩コリ・腰痛ケア 60分', 60, 7700, 8800, 'なかなか改善しない不調に。深層筋に潜むトリガーポイントへ、国家資格者が体のクセ・姿勢・筋肉の状態を評価し、コリにピンポイント鍼アプローチ。カウンセリング20分+鍼+マッサージ60分。', true, 4, 'https://imgbp.hotp.jp/CSP/IMG_SRC_K/36/11/C058423611/C058423611.jpg', true, true, false, '人気No.3'),
('{{KARADA_CLINIC_ID}}', '【迷ったらコレ】症状に合わせて施術プランをご提案 60分', 60, 7700, 8800, 'どのクーポンを選べばいいか分からない方や、ご自身の症状が当てはまらない方、とりあえず予約だけ入れておきたい方、なんでもOK。ご希望を簡単にお伝えください。60分の施術。', true, 5, 'https://imgbp.hotp.jp/CSP/IMG_SRC_K/45/15/C058424515/C058424515.jpg', true, true, false, NULL),
('{{KARADA_CLINIC_ID}}', '【迷ったらコレ】症状に合わせて施術プランをご提案 90分', 90, 12100, 13200, 'どのクーポンを選べばいいか分からない方や、ご自身の症状が当てはまらない方、とりあえず予約だけ入れておきたい方、なんでもOK。ご希望を簡単にお伝えください。90分のじっくり施術。', true, 6, 'https://imgbp.hotp.jp/CSP/IMG_SRC_K/44/75/C058424475/C058424475.jpg', true, true, false, NULL),
('{{KARADA_CLINIC_ID}}', '【まずは原因を知りたい方】カウンセリング+動作・姿勢チェック 30分', 30, 0, NULL, '首肩こり・腰痛…その原因を可視化しませんか？国家資格者が姿勢・筋肉・動作のクセを丁寧に評価し、最適なプランをご提案。施術（60分7,700円）は別途ご案内。', true, 7, 'https://imgbp.hotp.jp/CSP/IMG_SRC_K/65/50/C049226550/C049226550.jpg', true, true, false, '無料相談'),
('{{KARADA_CLINIC_ID}}', '【筋膜リリース】自律神経×疲労回復 深いリラックスへ 60分', 60, 7700, 8800, '疲れているのに眠れない・朝スッキリしない、そんな方に。深層筋までアプローチするマッサージで全身の緊張を解放。疲労回復＆質の高い睡眠へ。カウンセリング20分+マッサージ60分。', true, 8, 'https://imgbp.hotp.jp/CSP/IMG_SRC_K/36/50/C058423650/C058423650.jpg', true, true, false, NULL),
('{{KARADA_CLINIC_ID}}', '【筋膜リリース】肩・腰・足…全身ガチガチな方へ 90分', 90, 12100, 13200, 'どこへ行っても改善しない方に。筋膜の癒着・深層筋の硬結・動作のクセまで徹底的に原因分析。国家資格者が筋膜リリース整体で体の奥深くにアプローチし効果実感。', true, 9, 'https://imgbp.hotp.jp/CSP/IMG_SRC_K/09/88/C049710988/C049710988.jpg', true, true, false, NULL),
('{{KARADA_CLINIC_ID}}', '【筋膜リリース】全身疲労をリフレッシュ リカバリーケア 90分', 90, 12100, 13200, '蓄積した疲労・ストレスを徹底リセット。肩・首・腰・脚の血流＆代謝をUP。心身ともにスッキリ軽く、前向きな気持ちに。筋膜リリース＋深層筋アプローチ。カウンセリング20分+マッサージ90分。', true, 10, 'https://imgbp.hotp.jp/CSP/IMG_SRC_K/36/83/C058423683/C058423683.jpg', true, true, false, NULL),
('{{KARADA_CLINIC_ID}}', '【鍼×筋膜リリース】根深いコリを全身解消 本格ケア 90分', 90, 12100, 13200, '忙しい日々で限界を感じる方に。全身の深層筋・姿勢・動きのクセを分析。トリガーポイント鍼×整体でガチガチの筋肉と動作エラーを根本ケア。', true, 11, 'https://imgbp.hotp.jp/CSP/IMG_SRC_K/85/14/C058518514/C058518514.jpg', true, true, false, NULL),
('{{KARADA_CLINIC_ID}}', '【鍼×筋膜リリース】疲労回復・全身リフレッシュコース 90分', 90, 12100, 13200, '全身がだるい・疲れが取れない、そんなあなたに。疲れ・ストレス解消、肩・首・腰・足の重だるさをしっかりケア。自律神経を整える施術で心身ともにスッキリ。カウンセリング20分+施術90分。', true, 12, 'https://imgbp.hotp.jp/CSP/IMG_SRC_K/85/47/C058518547/C058518547.jpg', true, true, false, NULL),
('{{KARADA_CLINIC_ID}}', 'ホットペッパービューティーの口コミ割引', 60, 1000, NULL, 'ホットペッパービューティーの口コミを入れていただきましたら、ご利用いただけるクーポンです。', true, 13, 'https://imgbp.hotp.jp/CSP/IMG_SRC_K/92/06/C050709206/C050709206.jpg', true, false, false, '口コミ割'),
('{{KARADA_CLINIC_ID}}', '【2回目以降の方】60分 通常メニュー', 60, 8800, NULL, '2回目以降のご来院で、60分のご予約をお取りになる際にご利用ください。', true, 14, 'https://imgbp.hotp.jp/CSP/IMG_SRC_K/40/74/C058424074/C058424074.jpg', true, false, true, NULL),
('{{KARADA_CLINIC_ID}}', '【2回目以降の方】90分 通常メニュー', 90, 13200, NULL, '2回目以降のご来院で、90分施術のご予約をお取りになる際にご利用ください。', true, 15, 'https://imgbp.hotp.jp/CSP/IMG_SRC_K/40/91/C058424091/C058424091.jpg', true, false, true, NULL);

-- ---------------------------------------------------------------
-- STEP 4: 確認クエリ（任意）
-- ---------------------------------------------------------------
-- SELECT id, clinic_name, hero_subtitle, theme_color FROM clinic_settings WHERE id = '{{KARADA_CLINIC_ID}}';
-- SELECT name, price, regular_price, duration_minutes, is_coupon, is_first_visit_only, is_repeat_only, badge_label
--   FROM reservation_courses WHERE clinic_id = '{{KARADA_CLINIC_ID}}' AND is_active = true ORDER BY sort_order;
