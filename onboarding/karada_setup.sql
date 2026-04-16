-- ================================================================
-- karada 鍼灸整骨院（川内）— 事前セットアップSQL
-- 実行場所: Supabase SQL Editor (本番プロジェクト)
-- 実行タイミング: 導入当日より前に実行しておく
-- ================================================================

-- STEP 1: クリニック設定レコードを作成
-- 実行後に表示される id (UUID) をメモしておくこと → STEP2で使用
INSERT INTO clinic_settings (
  clinic_name,
  custom_expense_categories
) VALUES (
  'karada鍼灸整骨院',
  '{}'
)
RETURNING id, clinic_name;

-- ↑ 実行後に出力された id をメモ: ________________________________


-- ================================================================
-- STEP 2: デフォルトコース設定
-- 下記の {KARADA_CLINIC_ID} を STEP1 で取得した UUID に置き換えて実行
-- ================================================================

/*
INSERT INTO reservation_courses (clinic_id, name, duration_minutes, price, description, is_active, sort_order) VALUES
  ('{KARADA_CLINIC_ID}', '初回検査・施術', 60, 0, '初めての方：お体の状態確認と施術', true, 1),
  ('{KARADA_CLINIC_ID}', '再診施術', 30, 0, '2回目以降の施術', true, 2),
  ('{KARADA_CLINIC_ID}', '鍼灸治療', 45, 5000, '鍼とお灸による施術', true, 3),
  ('{KARADA_CLINIC_ID}', '整体・矯正', 45, 5000, '骨盤・背骨の矯正施術', true, 4),
  ('{KARADA_CLINIC_ID}', '電気療法＋手技', 30, 0, '電気治療と手技を組み合わせた施術', true, 5);
*/


-- ================================================================
-- STEP 3: 導入当日に実行 — 管理者アカウント作成
-- ================================================================

-- ※ /auth/register から登録するか、Supabase Dashboard の Authentication → Users → Add User から作成
-- 作成後に下記で紐付け:
/*
INSERT INTO clinic_users (user_id, clinic_id, role)
VALUES (
  '{AUTH_USER_ID}',    -- Dashboard で確認した User ID
  '{KARADA_CLINIC_ID}', -- STEP1 で取得した UUID
  'owner'
);
*/


-- ================================================================
-- 確認クエリ（セットアップ後に実行して確認）
-- ================================================================
-- SELECT id, clinic_name FROM clinic_settings WHERE clinic_name LIKE '%karada%';
-- SELECT * FROM reservation_courses WHERE clinic_id = '{KARADA_CLINIC_ID}';
