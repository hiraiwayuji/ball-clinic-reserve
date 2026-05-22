-- ============================================================
-- からだ鍼灸整骨院: 支払区分マスタ（payment_categories）を新6カテゴリへ
-- ============================================================
-- 藤川先生からの指定（2026-05-23）：
--   1. 保険施術
--   2. 自費施術
--   3. 医療助成
--   4. 自賠責/労災
--   5. 関係者
--   6. その他
--
-- 戦略：既存の標準カテゴリ（appointments.payment_type / sales.payment_type と
-- 互換のある key）は label と sort_order を更新して再利用し、新カテゴリは
-- 新 key で追加する。既存履歴データの payment_type 文字列を壊さない。
--
-- karada clinic_id = d3b55abc-46a6-4cbe-8198-21c0392d9a2e
-- ============================================================

DO $$
DECLARE
  v_clinic_id UUID := 'd3b55abc-46a6-4cbe-8198-21c0392d9a2e';
BEGIN
  -- 1) 既存標準カテゴリの label / sort_order を更新

  -- jihi → 自費施術 (sort_order=1)
  UPDATE public.payment_categories
     SET label = '自費施術', sort_order = 1, is_active = TRUE
   WHERE clinic_id = v_clinic_id AND key = 'jihi';

  -- hagukumi → 医療助成 (sort_order=2)
  UPDATE public.payment_categories
     SET label = '医療助成', sort_order = 2, is_active = TRUE
   WHERE clinic_id = v_clinic_id AND key = 'hagukumi';

  -- jibaiseki → 自賠責/労災 に統合 (sort_order=3)
  UPDATE public.payment_categories
     SET label = '自賠責/労災', sort_order = 3, is_active = TRUE
   WHERE clinic_id = v_clinic_id AND key = 'jibaiseki';

  -- 旧 rosai は jibaiseki/労災 統合のため非アクティブ化（履歴は残す）
  UPDATE public.payment_categories
     SET is_active = FALSE
   WHERE clinic_id = v_clinic_id AND key = 'rosai';

  -- other → その他 (sort_order=5)
  UPDATE public.payment_categories
     SET label = 'その他', sort_order = 5, is_active = TRUE
   WHERE clinic_id = v_clinic_id AND key = 'other';

  -- 2) 新規カテゴリ INSERT（既に存在すれば label/sort_order を更新）

  -- 保険施術 (sort_order=0)
  INSERT INTO public.payment_categories (clinic_id, key, label, sort_order, is_active, is_system)
       VALUES (v_clinic_id, 'hoken', '保険施術', 0, TRUE, TRUE)
  ON CONFLICT (clinic_id, key) DO UPDATE
     SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, is_active = TRUE;

  -- 関係者 (sort_order=4)
  INSERT INTO public.payment_categories (clinic_id, key, label, sort_order, is_active, is_system)
       VALUES (v_clinic_id, 'kankeisha', '関係者', 4, TRUE, FALSE)
  ON CONFLICT (clinic_id, key) DO UPDATE
     SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, is_active = TRUE;
END $$;

-- 確認用 (実行後)：
-- SELECT key, label, sort_order, is_active, is_system
--   FROM public.payment_categories
--  WHERE clinic_id = 'd3b55abc-46a6-4cbe-8198-21c0392d9a2e'
--  ORDER BY is_active DESC, sort_order;
