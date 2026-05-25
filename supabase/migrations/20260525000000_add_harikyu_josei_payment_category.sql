-- ============================================================
-- 全院 payment_categories に「はりきゅう助成券」を追加
-- ============================================================
-- ぼーるくん要望 (2026-05-25):
--   売上登録（受付）の支払区分に「はりきゅう助成券」を追加。
--   位置: 一番最後（その他の前）
--
-- 新並び順:
--   0. hoken          保険施術
--   1. jihi           自費施術
--   2. hagukumi       医療助成
--   3. jibaiseki      自賠責/労災
--   4. kankeisha      関係者
--   5. harikyu_josei  はりきゅう助成券   ← 新規
--   6. other          その他           ← 5→6 へシフト
-- ============================================================

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT DISTINCT id FROM public.clinic_settings
  LOOP
    -- その他 を 5 → 6 へシフト（先に動かす）
    UPDATE public.payment_categories
       SET sort_order = 6
     WHERE clinic_id = c.id AND key = 'other';

    -- はりきゅう助成券（sort_order=5, is_system=TRUE）を追加
    INSERT INTO public.payment_categories (clinic_id, key, label, sort_order, is_active, is_system)
         VALUES (c.id, 'harikyu_josei', 'はりきゅう助成券', 5, TRUE, TRUE)
    ON CONFLICT (clinic_id, key) DO UPDATE
       SET label = EXCLUDED.label,
           sort_order = EXCLUDED.sort_order,
           is_active = TRUE,
           is_system = TRUE;
  END LOOP;
END $$;

-- 確認用：
-- SELECT clinic_id, key, label, sort_order, is_active, is_system
--   FROM public.payment_categories
--  WHERE is_active = TRUE
--  ORDER BY clinic_id, sort_order;
