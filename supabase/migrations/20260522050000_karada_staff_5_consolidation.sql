-- ============================================================
-- からだ鍼灸整骨院: スタッフを 5 名体制に整理
-- ============================================================
-- 藤川先生から「以下の 5 名以外はいらない」との指示（2026-05-22）。
--
-- 施術担当 4 名:
--   1. 藤川（柔道整復師・鍼灸師・トレーナー）
--   2. 島田（柔道整復師・鍼灸マッサージ師）   ※オンライン予約除外を維持
--   3. 森藤（鍼灸師）
--   4. 森川（柔道整復師・トレーナー）
--
-- トレーニング担当 1 名:
--   5. 馬場（トレーナー）
--
-- 既存予約との関係を破壊しないため DELETE せず is_active = FALSE で非表示化。
-- 既に done済の reservation_staff 重複削除（2026-05-21）と整合する。
-- ============================================================

DO $$
DECLARE
  v_clinic_id UUID := 'd3b55abc-46a6-4cbe-8198-21c0392d9a2e';
BEGIN
  -- 1) 上記 5 名以外を非アクティブ＆タイムライン非表示
  UPDATE public.reservation_staff
     SET is_active = FALSE,
         show_in_timeline = FALSE,
         available_for_online_booking = FALSE
   WHERE clinic_id = v_clinic_id
     AND NOT (
       name LIKE '%藤川%' OR
       name LIKE '%島田%' OR
       name LIKE '%森藤%' OR
       name LIKE '%森川%' OR
       name LIKE '%馬場%'
     );

  -- 2) 5 名は is_active = TRUE / show_in_timeline = TRUE / sort_order を整理
  --    available_for_online_booking は触らない（島田は false のまま維持）
  UPDATE public.reservation_staff
     SET sort_order = 1, is_active = TRUE, show_in_timeline = TRUE
   WHERE clinic_id = v_clinic_id AND name LIKE '%藤川%';

  UPDATE public.reservation_staff
     SET sort_order = 2, is_active = TRUE, show_in_timeline = TRUE
   WHERE clinic_id = v_clinic_id AND name LIKE '%島田%';

  UPDATE public.reservation_staff
     SET sort_order = 3, is_active = TRUE, show_in_timeline = TRUE
   WHERE clinic_id = v_clinic_id AND name LIKE '%森藤%';

  UPDATE public.reservation_staff
     SET sort_order = 4, is_active = TRUE, show_in_timeline = TRUE
   WHERE clinic_id = v_clinic_id AND name LIKE '%森川%';

  UPDATE public.reservation_staff
     SET sort_order = 5, is_active = TRUE, show_in_timeline = TRUE
   WHERE clinic_id = v_clinic_id AND name LIKE '%馬場%';
END $$;

-- 確認用 (実行後に手で確認):
-- SELECT id, name, role, sort_order, is_active, show_in_timeline, available_for_online_booking
--   FROM public.reservation_staff
--  WHERE clinic_id = 'd3b55abc-46a6-4cbe-8198-21c0392d9a2e'
--  ORDER BY is_active DESC, sort_order, name;
