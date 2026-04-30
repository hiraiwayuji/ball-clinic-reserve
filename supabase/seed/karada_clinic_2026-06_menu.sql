-- ============================================================
-- からだ鍼灸整骨院 2026年6月 新料金 メニュー投入
-- ============================================================
-- このファイルは「シード（初期データ投入）」用です。
--
-- 実行方法:
--   1. からだ鍼灸整骨院の Supabase プロジェクトの SQL Editor を開く
--   2. このファイルの内容を貼り付けて実行
--   3. /admin/settings 画面でメニューが表示されることを確認
--
-- 既に同名コースが登録済みの場合はスキップされます（WHERE NOT EXISTS）。
-- 後から料金や時間を変更する場合は管理画面か UPDATE 文で更新してください。
-- ============================================================

-- ※ clinic_id はからだ鍼灸整骨院の Supabase プロジェクトで使われている ID に書き換えてください。
--    シード用デフォルト ID（環境変数 NEXT_PUBLIC_CLINIC_ID 未設定時）は下記のとおり。
DO $$
DECLARE
  v_clinic_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN

  -- 鍼灸（一般）
  INSERT INTO public.reservation_courses
    (clinic_id, name, duration_minutes, price, description, is_active, sort_order, is_coupon)
  SELECT v_clinic_id, '鍼灸 1部位', 15, 2200,
         '気になる1部位への鍼灸施術。', true, 10, false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.reservation_courses
    WHERE clinic_id = v_clinic_id AND name = '鍼灸 1部位'
  );

  INSERT INTO public.reservation_courses
    (clinic_id, name, duration_minutes, price, description, is_active, sort_order, is_coupon)
  SELECT v_clinic_id, '鍼灸 2部位', 30, 4000,
         '2部位への鍼灸施術。', true, 11, false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.reservation_courses
    WHERE clinic_id = v_clinic_id AND name = '鍼灸 2部位'
  );

  INSERT INTO public.reservation_courses
    (clinic_id, name, duration_minutes, price, description, is_active, sort_order, is_coupon)
  SELECT v_clinic_id, '鍼灸 3部位', 45, 6000,
         '3部位への鍼灸施術。', true, 12, false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.reservation_courses
    WHERE clinic_id = v_clinic_id AND name = '鍼灸 3部位'
  );

  INSERT INTO public.reservation_courses
    (clinic_id, name, duration_minutes, price, description, is_active, sort_order, is_coupon)
  SELECT v_clinic_id, '鍼灸 全身', 60, 8000,
         '全身への鍼灸施術。深層筋・自律神経まで丁寧にアプローチ。', true, 13, false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.reservation_courses
    WHERE clinic_id = v_clinic_id AND name = '鍼灸 全身'
  );

  -- 鍼灸（学生割）
  INSERT INTO public.reservation_courses
    (clinic_id, name, duration_minutes, price, regular_price, description, is_active, sort_order, is_coupon, badge_label)
  SELECT v_clinic_id, '鍼灸 全身（学生割）', 60, 5000, 8000,
         '学生証提示で全身鍼灸が割引価格に。', true, 14, true, '学生限定'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.reservation_courses
    WHERE clinic_id = v_clinic_id AND name = '鍼灸 全身（学生割）'
  );

  -- 美容鍼
  INSERT INTO public.reservation_courses
    (clinic_id, name, duration_minutes, price, description, is_active, sort_order, is_coupon, badge_label)
  SELECT v_clinic_id, '美容鍼', 45, 5500,
         'お顔への美容鍼。リフトアップ・血流改善で内側からのキレイをサポート。', true, 20, false, NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM public.reservation_courses
    WHERE clinic_id = v_clinic_id AND name = '美容鍼'
  );

  -- からだ式整体
  INSERT INTO public.reservation_courses
    (clinic_id, name, duration_minutes, price, description, is_active, sort_order, is_coupon)
  SELECT v_clinic_id, 'からだ式整体 半身', 20, 2200,
         '肩甲骨と骨盤を軸に半身の関節を整える整体。', true, 30, false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.reservation_courses
    WHERE clinic_id = v_clinic_id AND name = 'からだ式整体 半身'
  );

  INSERT INTO public.reservation_courses
    (clinic_id, name, duration_minutes, price, description, is_active, sort_order, is_coupon)
  SELECT v_clinic_id, 'からだ式整体 全身', 40, 4400,
         '肩甲骨・骨盤を軸に全身の関節を整える整体。', true, 31, false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.reservation_courses
    WHERE clinic_id = v_clinic_id AND name = 'からだ式整体 全身'
  );

  -- マッサージ
  INSERT INTO public.reservation_courses
    (clinic_id, name, duration_minutes, price, description, is_active, sort_order, is_coupon)
  SELECT v_clinic_id, 'マッサージ 30分', 30, 3300,
         '慢性疲労やコリへのリラクゼーションマッサージ。', true, 40, false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.reservation_courses
    WHERE clinic_id = v_clinic_id AND name = 'マッサージ 30分'
  );

  INSERT INTO public.reservation_courses
    (clinic_id, name, duration_minutes, price, description, is_active, sort_order, is_coupon)
  SELECT v_clinic_id, 'マッサージ 60分', 60, 6600,
         'じっくり60分の全身マッサージ。月数回のメンテナンスにも。', true, 41, false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.reservation_courses
    WHERE clinic_id = v_clinic_id AND name = 'マッサージ 60分'
  );

  -- 根本改善・専門施術
  INSERT INTO public.reservation_courses
    (clinic_id, name, duration_minutes, price, description, is_active, sort_order, is_coupon, badge_label)
  SELECT v_clinic_id, 'じっくり全身調整', 60, 6600,
         'じっくり時間をかけて全身を整える人気No.1の根本改善メニュー。',
         true, 50, false, '人気No.1'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.reservation_courses
    WHERE clinic_id = v_clinic_id AND name = 'じっくり全身調整'
  );

  INSERT INTO public.reservation_courses
    (clinic_id, name, duration_minutes, price, description, is_active, sort_order, is_coupon)
  SELECT v_clinic_id, '経絡治療', 60, 6600,
         '経絡の流れを整え、根本から改善する東洋医学ベースの専門施術。',
         true, 51, false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.reservation_courses
    WHERE clinic_id = v_clinic_id AND name = '経絡治療'
  );

  INSERT INTO public.reservation_courses
    (clinic_id, name, duration_minutes, price, description, is_active, sort_order, is_coupon, badge_label)
  SELECT v_clinic_id, '院長トータルリメイク 60分', 60, 19800,
         '院長が責任を持って全身を総合評価し、最適ルートで理想の身体へ導く特別メニュー。',
         true, 60, false, '院長施術'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.reservation_courses
    WHERE clinic_id = v_clinic_id AND name = '院長トータルリメイク 60分'
  );

  INSERT INTO public.reservation_courses
    (clinic_id, name, duration_minutes, price, description, is_active, sort_order, is_coupon, badge_label)
  SELECT v_clinic_id, '院長トータルリメイク 90分', 90, 29800,
         '本気で身体を変えたい方へ。90分でじっくり全身を再設計する院長専門メニュー。',
         true, 61, false, '院長施術'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.reservation_courses
    WHERE clinic_id = v_clinic_id AND name = '院長トータルリメイク 90分'
  );

  -- パーソナルトレーニング
  INSERT INTO public.reservation_courses
    (clinic_id, name, duration_minutes, price, description, is_active, sort_order, is_coupon)
  SELECT v_clinic_id, 'パーソナルトレーニング 30分', 30, 3300,
         '施術と組み合わせる短時間パーソナル。フォーム指導・セルフケアまで。',
         true, 70, false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.reservation_courses
    WHERE clinic_id = v_clinic_id AND name = 'パーソナルトレーニング 30分'
  );

  INSERT INTO public.reservation_courses
    (clinic_id, name, duration_minutes, price, description, is_active, sort_order, is_coupon)
  SELECT v_clinic_id, 'パーソナルトレーニング 60分', 60, 6600,
         '本格的なパーソナルトレーニング。健康・美容・競技力までトータルでサポート。',
         true, 71, false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.reservation_courses
    WHERE clinic_id = v_clinic_id AND name = 'パーソナルトレーニング 60分'
  );

END $$;

-- ============================================================
-- 投入後の確認クエリ
-- ============================================================
-- SELECT name, duration_minutes, price, sort_order, is_active, badge_label
-- FROM public.reservation_courses
-- WHERE clinic_id = '00000000-0000-0000-0000-000000000001'
-- ORDER BY sort_order;
