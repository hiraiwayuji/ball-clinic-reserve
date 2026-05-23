-- ============================================================
-- 全院 payment_categories を標準6項目に統一
-- ============================================================
-- ぼーるくん要望 (2026-05-23):
--   全院で共通の支払区分6項目に揃える。各院は + 追加カテゴリを設定可能。
--
-- 標準6項目:
--   1. 保険施術 (hoken)        sort_order=0
--   2. 自費施術 (jihi)         sort_order=1
--   3. 医療助成 (hagukumi)     sort_order=2
--   4. 自賠責/労災 (jibaiseki) sort_order=3  ← 旧 rosai を統合（rosai は is_active=FALSE で履歴保持）
--   5. 関係者 (kankeisha)      sort_order=4
--   6. その他 (other)          sort_order=5
--
-- karada は別途 20260523000000_karada_payment_categories.sql で先行整理済み。
-- このマイグレーションは karada 以外の全院に同じ整理を適用。
-- ============================================================

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT DISTINCT id FROM public.clinic_settings
     WHERE id != 'd3b55abc-46a6-4cbe-8198-21c0392d9a2e'  -- karada は既に整理済み
  LOOP
    UPDATE public.payment_categories
       SET label = '自費施術', sort_order = 1, is_active = TRUE
     WHERE clinic_id = c.id AND key = 'jihi';

    UPDATE public.payment_categories
       SET label = '医療助成', sort_order = 2, is_active = TRUE
     WHERE clinic_id = c.id AND key = 'hagukumi';

    UPDATE public.payment_categories
       SET label = '自賠責/労災', sort_order = 3, is_active = TRUE
     WHERE clinic_id = c.id AND key = 'jibaiseki';

    UPDATE public.payment_categories
       SET is_active = FALSE
     WHERE clinic_id = c.id AND key = 'rosai';

    UPDATE public.payment_categories
       SET label = 'その他', sort_order = 5, is_active = TRUE
     WHERE clinic_id = c.id AND key = 'other';

    INSERT INTO public.payment_categories (clinic_id, key, label, sort_order, is_active, is_system)
         VALUES (c.id, 'hoken', '保険施術', 0, TRUE, TRUE)
    ON CONFLICT (clinic_id, key) DO UPDATE
       SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, is_active = TRUE;

    INSERT INTO public.payment_categories (clinic_id, key, label, sort_order, is_active, is_system)
         VALUES (c.id, 'kankeisha', '関係者', 4, TRUE, FALSE)
    ON CONFLICT (clinic_id, key) DO UPDATE
       SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, is_active = TRUE;
  END LOOP;
END $$;
