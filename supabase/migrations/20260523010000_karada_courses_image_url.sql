-- ============================================================
-- からだ鍼灸整骨院: reservation_courses.image_url に HP 画像を設定
-- ============================================================
-- /reserve/menu の LP 表示で各メニューに画像を出すため、
-- karadakara.jp（HP）の画像 URL を流用してマッピング。
--
-- マッピング方針（2026-05-23 Claude が menu.html と各メニュー説明から判断、
-- 藤川先生の最終確認待ち）:
--   - 鍼灸系   : s-sk1/sk2/sk3.png（HP の「鍼・灸」セクションの画像）
--   - 整体     : s-ks1/ks2/ks3.png（からだ式整体）
--   - マッサージ: s-ms1/ms2.png
--   - テーピング: s-tp.png
--   - 保険施術 : img3.png（徳島市国民健康保険指定）
--   - 院長リメイク : prof-f.png（藤川院長 顔写真）
--   - パーソナル : prof-baba.jpg（馬場先生 顔写真）
--   - ピラティス : NULL（HP に画像なし、藤川先生から画像提供後に追加）
--
-- 画像 URL は独自ドメイン https://karadakara.jp/images/ を使用（HPデプロイ済）。
-- ============================================================

DO $karada_img$
DECLARE
  v_clinic_id uuid := 'd3b55abc-46a6-4cbe-8198-21c0392d9a2e';
  v_base text := 'https://karadakara.jp/images/';
BEGIN
  -- 保険施術
  UPDATE public.reservation_courses SET image_url = v_base || 'img3.png'
   WHERE clinic_id = v_clinic_id AND name IN ('保険施術（初診）', '保険施術（再診）');

  -- 鍼灸（部位制）
  UPDATE public.reservation_courses SET image_url = v_base || 's-sk1.png'
   WHERE clinic_id = v_clinic_id AND name = '鍼灸 1部位';
  UPDATE public.reservation_courses SET image_url = v_base || 's-sk2.png'
   WHERE clinic_id = v_clinic_id AND name = '鍼灸 2部位';
  UPDATE public.reservation_courses SET image_url = v_base || 's-sk3.png'
   WHERE clinic_id = v_clinic_id AND name = '鍼灸 3部位';
  UPDATE public.reservation_courses SET image_url = v_base || 's-sk1.png'
   WHERE clinic_id = v_clinic_id AND name = '鍼灸 全身';

  -- 鍼灸サブメニュー
  UPDATE public.reservation_courses SET image_url = v_base || 's-sk2.png'
   WHERE clinic_id = v_clinic_id AND name IN ('小児鍼', '置鍼');
  UPDATE public.reservation_courses SET image_url = v_base || 's-sk3.png'
   WHERE clinic_id = v_clinic_id AND name = '電気鍼';

  -- 整体
  UPDATE public.reservation_courses SET image_url = v_base || 's-ks1.png'
   WHERE clinic_id = v_clinic_id AND name = '整体 半身（上 or 下）';
  UPDATE public.reservation_courses SET image_url = v_base || 's-ks2.png'
   WHERE clinic_id = v_clinic_id AND name = '整体 全身';

  -- マッサージ
  UPDATE public.reservation_courses SET image_url = v_base || 's-ms1.png'
   WHERE clinic_id = v_clinic_id AND name IN ('マッサージ 20分', 'マッサージ 40分');
  UPDATE public.reservation_courses SET image_url = v_base || 's-ms2.png'
   WHERE clinic_id = v_clinic_id AND name = 'マッサージ 60分';

  -- スパイラルテーピング
  UPDATE public.reservation_courses SET image_url = v_base || 's-tp.png'
   WHERE clinic_id = v_clinic_id AND name IN ('スパイラルテーピング 一般', 'スパイラルテーピング 学生');

  -- じっくり全身調整（人気No.1）
  UPDATE public.reservation_courses SET image_url = v_base || 's-ks3.png'
   WHERE clinic_id = v_clinic_id AND name = 'じっくり全身調整';

  -- 経絡治療
  UPDATE public.reservation_courses SET image_url = v_base || 's-sk1.png'
   WHERE clinic_id = v_clinic_id AND name IN ('経絡治療（初回）', '経絡治療（2回目以降）');

  -- 院長トータルリメイク（全4種、藤川院長 顔写真）
  UPDATE public.reservation_courses SET image_url = v_base || 'prof-f.png'
   WHERE clinic_id = v_clinic_id
     AND name IN (
       '院長トータルリメイク 60分',
       '院長トータルリメイク 90分',
       '院長トータルリメイク 初回80分（カウンセリング込）',
       '院長トータルリメイク 初回110分（カウンセリング込）'
     );

  -- パーソナルトレーニング（馬場先生 顔写真）
  UPDATE public.reservation_courses SET image_url = v_base || 'prof-baba.jpg'
   WHERE clinic_id = v_clinic_id
     AND name IN (
       'パーソナルトレーニング 20分',
       'パーソナルトレーニング 40分',
       'パーソナルトレーニング 60分'
     );

  -- ピラティス（HP に画像なし、藤川先生から提供されるまで NULL のまま）
END $karada_img$;

-- 確認用 SELECT（実行後に手で）：
-- SELECT name, image_url FROM public.reservation_courses
--  WHERE clinic_id = 'd3b55abc-46a6-4cbe-8198-21c0392d9a2e'
--  ORDER BY sort_order;
