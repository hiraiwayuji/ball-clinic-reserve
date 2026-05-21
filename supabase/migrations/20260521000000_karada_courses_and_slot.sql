-- ============================================================
-- からだ鍼灸整骨院 初期コースセットアップ + slot 20分化
-- ============================================================
-- 各院ごとに独立 Supabase を持つ構成のため、このマイグレーションは
-- 全院 DB で実行されるが、clinic_name = 'からだ鍼灸整骨院' でない院では
-- 何も行わない（早期 RETURN）。
--
-- 対象院（DB レベル）:
--   clinic_settings.clinic_name = 'からだ鍼灸整骨院'
--
-- 内容:
--   1. 表示グリッドの刻みを 20 分に変更
--   2. reservation_courses に 29 コース投入（HP料金参考、藤川先生承認待ち）
--      ・保険施術       : 初診40分 / 再診20分
--      ・鍼灸          : 部位制 1〜3部位 / 全身 + 小児鍼 / 置鍼 / 電気鍼
--      ・整体          : 半身 / 全身
--      ・マッサージ     : 20 / 40 / 60 分
--      ・テーピング     : 一般 / 学生（施術内併用）
--      ・じっくり全身調整（人気No.1）
--      ・経絡治療      : 初回 / 2回目以降
--      ・院長トータルリメイク: 初回80/110分 / 再診60/90分
--      ・パーソナルトレーニング: 20 / 40 / 60 分
--      ・ピラティス     : 20 / 40 / 60 分（料金未定）
--
-- 注意:
--   既存コースが残っている場合は名前重複で重複登録されるが、
--   migrate-on-build の applied tracking により本マイグレーションは
--   各 Supabase で 1 度しか走らないため、実害なし。
--   美容鍼は今回は登録しない（ぼーるくん指示）。
-- ============================================================

DO $$
DECLARE
  v_clinic_id uuid;
BEGIN
  -- からだ鍼灸整骨院の clinic_id を解決
  SELECT id INTO v_clinic_id
    FROM public.clinic_settings
   WHERE clinic_name = 'からだ鍼灸整骨院'
   LIMIT 1;

  IF v_clinic_id IS NULL THEN
    RAISE NOTICE '[karada-setup] からだ鍼灸整骨院 not found in this Supabase — skipping.';
  ELSE
    RAISE NOTICE '[karada-setup] Applying to clinic_id=%', v_clinic_id;

    -- 1. 予約グリッドの刻みを 20 分に
    UPDATE public.clinic_settings
       SET slot_duration_minutes = 20
     WHERE id = v_clinic_id;

    -- 2. コース投入
    INSERT INTO public.reservation_courses (
    clinic_id, name, duration_minutes, price, first_visit_price,
    description, is_active, sort_order, is_first_visit_only, is_repeat_only, badge_label
  ) VALUES
    -- 保険施術
    (v_clinic_id, '保険施術（初診）',           40, 1900, 1900, '急性の痛み・ケガに対する保険診療（負担割合により金額変動）', TRUE, 10, TRUE,  FALSE, NULL),
    (v_clinic_id, '保険施術（再診）',           20,  900,  900, '前回来院から1ヶ月以内の継続施術（負担割合により金額変動）', TRUE, 11, FALSE, TRUE,  NULL),

    -- 鍼灸（部位制 + サブメニュー）
    (v_clinic_id, '鍼灸 1部位',                 20, 2200, NULL, '局所1部位への鍼灸施術', TRUE, 20, FALSE, FALSE, NULL),
    (v_clinic_id, '鍼灸 2部位',                 40, 4000, NULL, '2部位への鍼灸施術', TRUE, 21, FALSE, FALSE, NULL),
    (v_clinic_id, '鍼灸 3部位',                 40, 6000, NULL, '3部位への鍼灸施術（HP約45分→20分単位で40分）', TRUE, 22, FALSE, FALSE, NULL),
    (v_clinic_id, '鍼灸 全身',                  60, 8000, NULL, '全身への鍼灸施術', TRUE, 23, FALSE, FALSE, NULL),
    (v_clinic_id, '小児鍼',                     20, 1100, NULL, '小児向けの鍼を使わない接触鍼', TRUE, 24, FALSE, FALSE, NULL),
    (v_clinic_id, '置鍼',                       20, 3300, NULL, '鍼を一定時間留置するコース（〜）', TRUE, 25, FALSE, FALSE, NULL),
    (v_clinic_id, '電気鍼',                     40, 4400, NULL, '鍼に低周波電流を流す施術（〜）', TRUE, 26, FALSE, FALSE, NULL),

    -- 整体
    (v_clinic_id, '整体 半身（上 or 下）',      20, 2200, NULL, '上半身 or 下半身に絞った整体（受付で部位確認）', TRUE, 30, FALSE, FALSE, NULL),
    (v_clinic_id, '整体 全身',                  40, 4400, NULL, '全身バランス調整', TRUE, 31, FALSE, FALSE, NULL),

    -- マッサージ
    (v_clinic_id, 'マッサージ 20分',            20, 2200, NULL, NULL, TRUE, 40, FALSE, FALSE, NULL),
    (v_clinic_id, 'マッサージ 40分',            40, 4400, NULL, NULL, TRUE, 41, FALSE, FALSE, NULL),
    (v_clinic_id, 'マッサージ 60分',            60, 6600, NULL, NULL, TRUE, 42, FALSE, FALSE, NULL),

    -- スパイラルテーピング（基本的に他施術と併用、単独予約は受付運用次第）
    (v_clinic_id, 'スパイラルテーピング 一般',  20,  900, NULL, '他施術と併用が基本。単独予約は受付確認', TRUE, 50, FALSE, FALSE, NULL),
    (v_clinic_id, 'スパイラルテーピング 学生',  20,  600, NULL, '学生料金。他施術と併用が基本', TRUE, 51, FALSE, FALSE, NULL),

    -- じっくり調整
    (v_clinic_id, 'じっくり全身調整',           60, 6600, NULL, 'じっくり時間をかけた専門施術', TRUE, 60, FALSE, FALSE, '人気No.1'),

    -- 経絡治療（初回/再診で分割）
    (v_clinic_id, '経絡治療（初回）',           60, 6600, 6600, '経絡の流れを整え根本から改善（初回のみ60分）', TRUE, 70, TRUE,  FALSE, NULL),
    (v_clinic_id, '経絡治療（2回目以降）',      40, 6600, NULL, '2回目以降は40分', TRUE, 71, FALSE, TRUE,  NULL),

    -- 院長トータルリメイク（初回はカウンセリング +20分）
    (v_clinic_id, '院長トータルリメイク 60分',  60, 19800, NULL, '院長による全身トータル施術（再診のみ）', TRUE, 80, FALSE, TRUE,  NULL),
    (v_clinic_id, '院長トータルリメイク 90分',  90, 29800, NULL, '院長による全身トータル施術（再診のみ）', TRUE, 81, FALSE, TRUE,  NULL),
    (v_clinic_id, '院長トータルリメイク 初回80分（カウンセリング込）',  80, 19800, 19800, '初回は施術60分 + カウンセリング20分', TRUE, 82, TRUE, FALSE, NULL),
    (v_clinic_id, '院長トータルリメイク 初回110分（カウンセリング込）', 110, 29800, 29800, '初回は施術90分 + カウンセリング20分', TRUE, 83, TRUE, FALSE, NULL),

    -- パーソナルトレーニング
    (v_clinic_id, 'パーソナルトレーニング 20分', 20, 2200, NULL, NULL, TRUE, 90, FALSE, FALSE, NULL),
    (v_clinic_id, 'パーソナルトレーニング 40分', 40, 4400, NULL, NULL, TRUE, 91, FALSE, FALSE, NULL),
    (v_clinic_id, 'パーソナルトレーニング 60分', 60, 6600, NULL, NULL, TRUE, 92, FALSE, FALSE, NULL),

    -- ピラティス（料金未定 → 藤川先生確認後に管理画面で入力）
    (v_clinic_id, 'ピラティス 20分',            20, NULL, NULL, '料金未定（藤川先生確認待ち）', TRUE, 100, FALSE, FALSE, NULL),
    (v_clinic_id, 'ピラティス 40分',            40, NULL, NULL, '料金未定（藤川先生確認待ち）', TRUE, 101, FALSE, FALSE, NULL),
    (v_clinic_id, 'ピラティス 60分',            60, NULL, NULL, '料金未定（藤川先生確認待ち）', TRUE, 102, FALSE, FALSE, NULL)
    ;

    RAISE NOTICE '[karada-setup] 29 courses inserted, slot_duration_minutes=20 applied';
  END IF;
END $$;
