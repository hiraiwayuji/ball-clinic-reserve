-- ================================================================
-- RELAQ（リラッキュー）専用 LP データ シード
-- 実行場所: hiraiwayuji@gmail.com の Supabase（4院共有 単一DB）
-- 出典    : 公式サイト https://relaq.jp/
-- 抽出日  : 2026-04-28
-- ================================================================
-- ✅ 院情報:
--   〒771-0212 徳島県板野郡松茂町中喜来字前原東一番越1-7
--   TEL 088-678-7949
--   平日 9:00-18:30 / 土日 10:00-17:30 / 火曜は午前のみ
--   定休日: 月曜・祝日
--   2013年開院 / LINE予約対応
--
-- ✅ 院長 大西浩司先生：
--   ・鍼灸あん摩マッサージ指圧師（国家資格）
--   ・ストレングス＆コンディショニングトレーナー
--   ・カナダ Canadian Sports Business Academy 修了
--   ・Whistler の医療施設でスポーツ障害患者の治療経験
--   ・保健体育科教員免許・健康運動実践指導者・障がい者スポーツ指導員 等多数の資格
--
-- ✅ 実運用 clinic_id 候補:
--   021efe2a-a768-4fa6-9de8-62cae9a79d47 (relaq 鍼灸マッサージ治療院)
--   ef17f537-f1d9-4ddf-8a5e-d9bec35ba99e (RELAQ)
--   → memory には 021efe2a-... と記録あり。Vercel の NEXT_PUBLIC_CLINIC_ID と
--     一致を確認してから実行してください。
--
-- ⚠️ 全クエリが clinic_id でスコープ限定されているため、他院（本院/マッスル/からだ）
--    のデータには一切影響しません。
-- ================================================================

-- ---------------------------------------------------------------
-- STEP 0: 必要カラム追加（既に追加済みなら何もしない）
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
  clinic_name         = 'RELAQ（リラッキュー）',
  hero_title          = 'RELAQ｜松茂町の鍼灸マッサージ治療院',
  hero_subtitle       = 'カナダでスポーツトレーナーを学んだ院長による、国家資格「あん摩マッサージ指圧師」の本格マッサージ。鍼灸・美容鍼・ラジオ波まで多彩なメニューで、あなたの不調と美容を整えます。',
  theme_color         = 'teal',
  lp_cta_text         = 'メニューから予約する',
  phone_number        = '088-678-7949',
  address             = '〒771-0212 徳島県板野郡松茂町中喜来字前原東一番越1-7',
  area_name           = '板野郡 松茂町',
  hp_url              = 'https://relaq.jp/',
  lp_target_problems  = '[
    "肩こり・腰痛・膝痛が慢性化している",
    "便秘・自律神経失調症・めまい・耳鳴り",
    "妊活中の体調管理をしたい",
    "顔のたるみ・むくみ・くすみが気になる",
    "スポーツ障害・パフォーマンス向上を目指したい",
    "デスクワーク疲れの頭・首肩リセットがしたい"
  ]'::jsonb,
  lp_features         = '[
    {"icon": "stethoscope", "title": "国家資格者によるマッサージ", "description": "「あん摩マッサージ指圧師」の免許を持つ専門家のみが行う本格施術。筋肉を手でもみほぐし、血行をよくし、疲労やこりを根本から改善します。"},
    {"icon": "award", "title": "カナダで学んだスポーツトレーナー院長", "description": "院長・大西浩司先生はカナダ Sports Business Academy 修了、ナショナルチームトレーナーから直接学んだ実践派。スポーツ障害から妊活まで幅広く対応。"},
    {"icon": "sparkles", "title": "美容鍼 × 5Dリフトで内側からキレイに", "description": "美容鍼に最新の5Dリフトを組み合わせた最強プログラム。たるみ・むくみの原因となる表情筋のコリにアプローチし、お顔を整えます。"},
    {"icon": "heart", "title": "毎回同じスタッフが担当", "description": "専任のスタッフが対応するため、毎回1から説明する必要がありません。あなたの体の変化を継続的にサポートします。"}
  ]'::jsonb,
  lp_voice_quote      = '美容鍼を受けるのは初めてでしたが、お顔だけでなく自律神経も整えてもらえてびっくり。回数券を使って通いやすいのもありがたいです。',
  lp_voice_author     = '40代女性 徳島市在住'
WHERE id = '021efe2a-a768-4fa6-9de8-62cae9a79d47';

-- ---------------------------------------------------------------
-- STEP 2: 既存コースを非表示化
-- ---------------------------------------------------------------
UPDATE public.reservation_courses
SET is_active = false
WHERE clinic_id = '021efe2a-a768-4fa6-9de8-62cae9a79d47';

-- ---------------------------------------------------------------
-- STEP 3: 公式サイトの料金表に基づくメニュー10件を投入
-- ---------------------------------------------------------------
INSERT INTO public.reservation_courses
  (clinic_id, name, duration_minutes, price, regular_price, description, is_active, sort_order, image_url, is_coupon, is_first_visit_only, is_repeat_only, badge_label)
VALUES
('021efe2a-a768-4fa6-9de8-62cae9a79d47', 'クイックコース｜ウォーターベッド+マッサージ10分', 10, 1200, NULL, 'ウォーターベッドによるマッサージと、鍼灸あん摩マッサージ指圧師（国家資格）によるマッサージ10分またははりがセット。基本ご予約不要。頭痛・肩こり・腰痛・むくみ改善に。', true, 1, NULL, true, false, false, '予約不要'),
('021efe2a-a768-4fa6-9de8-62cae9a79d47', 'あんま・マッサージ 30分｜お好きな部位（全身もOK）', 30, 4500, NULL, '国家資格「あん摩マッサージ指圧師」の免許を持つ人のみが行える施術。筋肉を手でもみほぐし血行をよくし、疲労やこりなどを改善。肩こり・頭痛・全身のだるさ・神経痛などに効果的。', true, 2, NULL, true, false, false, '国家資格'),
('021efe2a-a768-4fa6-9de8-62cae9a79d47', '鍼灸（はり・きゅう）30分', 30, 4500, NULL, '鍼や灸でツボを刺激し、人間の自然治癒力を高める施術方法。お悩みの疾患・症状・体質を考慮し、有効なツボを選びその人に合った治療を行います。妊活・耳鳴り・自律神経にも対応。', true, 3, NULL, true, false, false, NULL),
('021efe2a-a768-4fa6-9de8-62cae9a79d47', '美容鍼｜加齢に伴うお悩み特化コース', 60, 5000, NULL, '頬のたるみ、目元の疲れ、頭部のお悩みに特化した美容鍼コース。お肌の表情筋にアプローチし、お顔の印象を整えます。最新の5Dリフトとの組み合わせもおすすめです。', true, 4, NULL, true, false, false, '人気'),
('021efe2a-a768-4fa6-9de8-62cae9a79d47', '頭ほぐしリラックスケア 20分｜院長施術', 20, 2980, NULL, '院長による頭皮ヘッドマッサージ。頭皮中心にゆったりマッサージし、首肩もじんわり緩める「頭リセット」コース。スキマ時間にもおすすめ。', true, 5, NULL, true, false, false, '院長施術'),
('021efe2a-a768-4fa6-9de8-62cae9a79d47', '頭ほぐしリラックスケア 40分｜首肩・デコルテまで', 40, 4800, NULL, '頭全体＋首・肩・デコルテまでしっかりアプローチ。呼吸も深まり、リラックス効果◎。自律神経のバランスを整えるヘッドマッサージ。', true, 6, NULL, true, false, false, '院長施術'),
('021efe2a-a768-4fa6-9de8-62cae9a79d47', 'アロマフェイシャルトリートメント 20分', 20, 2800, NULL, '女性専用メニュー。アロマオイルを用いたフェイシャルトリートメント。外部刺激（紫外線など）からお肌を守り、内側からキレイに。トーンアップ・くすみ解消に。', true, 7, NULL, true, false, false, '女性専用'),
('021efe2a-a768-4fa6-9de8-62cae9a79d47', 'ラジオ波エステ｜美尻美脚コース 40分', 40, 3800, NULL, '女性専用メニュー。垂れ尻や太い太もも、パンパンのふくらはぎを何とかしたい方に。深部をじっくり温め、冷え予防・疲労回復・代謝アップ・痩身効果が期待できます。', true, 8, NULL, true, false, false, '女性専用'),
('021efe2a-a768-4fa6-9de8-62cae9a79d47', 'ラジオ波エステ｜ガチガチ背中解消コース 40分', 40, 3800, NULL, '女性専用メニュー。背中・肩・腰の痛みやコリを、ラジオ波の温熱で深部から解消。血液循環がよくなり、疲労物質が溜まりにくい体質改善も期待できます。', true, 9, NULL, true, false, false, '女性専用'),
('021efe2a-a768-4fa6-9de8-62cae9a79d47', 'カッピング・骨盤調整・物療コースなど（要相談）', 30, NULL, NULL, '上記以外にもカッピング・骨盤調整・ラジオ波温熱療法・物療メニュー・トリートメントなど多彩なメニューをご用意しています。詳しくはお問い合わせください。', true, 10, NULL, true, false, false, '要相談');

-- ---------------------------------------------------------------
-- STEP 4: 確認クエリ（任意）
-- ---------------------------------------------------------------
-- SELECT id, clinic_name, hero_subtitle, theme_color FROM clinic_settings WHERE id = '021efe2a-a768-4fa6-9de8-62cae9a79d47';
-- SELECT name, price, duration_minutes, badge_label
--   FROM reservation_courses WHERE clinic_id = '021efe2a-a768-4fa6-9de8-62cae9a79d47' AND is_active = true ORDER BY sort_order;

-- ---------------------------------------------------------------
-- 補足：もう一つの RELAQ 行（ef17f537-...）は古い残骸の可能性
-- ---------------------------------------------------------------
-- データ件数を確認して、0 件なら削除候補：
-- SELECT id, clinic_name,
--   (SELECT COUNT(*) FROM reservation_courses WHERE clinic_id = clinic_settings.id) AS courses,
--   (SELECT COUNT(*) FROM customers WHERE clinic_id = clinic_settings.id) AS customers,
--   (SELECT COUNT(*) FROM appointments WHERE clinic_id = clinic_settings.id) AS appointments
-- FROM clinic_settings WHERE id = 'ef17f537-f1d9-4ddf-8a5e-d9bec35ba99e';
