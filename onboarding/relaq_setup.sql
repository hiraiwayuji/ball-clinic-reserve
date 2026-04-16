-- ================================================================
-- relaq 鍼灸マッサージ治療院 — 事前セットアップSQL
-- 実行場所: Supabase SQL Editor (本番プロジェクト)
-- 実行タイミング: 導入当日より前に実行しておく
-- ================================================================

-- STEP 1: クリニック設定レコードを作成
-- 実行後に表示される id (UUID) をメモしておくこと → STEP2で使用
INSERT INTO clinic_settings (
  clinic_name,
  custom_expense_categories
) VALUES (
  'relaq 鍼灸マッサージ治療院',
  '{}'
)
RETURNING id, clinic_name;

-- ↑ 実行後に出力された id をメモ: ________________________________


-- ================================================================
-- STEP 2: デフォルトコース設定
-- 下記の {RELAQ_CLINIC_ID} を STEP1 で取得した UUID に置き換えて実行
-- ================================================================

/*
INSERT INTO reservation_courses (clinic_id, name, duration_minutes, price, description, is_active, sort_order) VALUES
  ('{RELAQ_CLINIC_ID}', '鍼灸治療', 60, 8000, '全身の気の流れを整える鍼灸施術', true, 1),
  ('{RELAQ_CLINIC_ID}', 'マッサージ', 30, 4000, '筋肉のコリをほぐすマッサージ', true, 2),
  ('{RELAQ_CLINIC_ID}', 'マッサージ（60分）', 60, 7000, 'じっくりほぐすフルコースマッサージ', true, 3),
  ('{RELAQ_CLINIC_ID}', '鍼灸＋マッサージ', 90, 12000, '鍼灸とマッサージのセット施術', true, 4),
  ('{RELAQ_CLINIC_ID}', '初回カウンセリング＋施術', 90, 8000, 'お体の状態確認から施術まで', true, 5);
*/


-- ================================================================
-- STEP 3: 導入当日に実行 — 管理者アカウント作成
-- /auth/register から登録するか、下記SQL（要 Service Role）を使用
-- ================================================================

-- ※ /auth/register を使う場合は SETUP_PASSWORD を相手に伝えるだけでOK
-- ※ SQL で直接作成する場合（Service Role Key が必要）:
/*
  Supabase Dashboard → Authentication → Users → "Add User" から
  - Email: 【relaqの担当者メールアドレス】
  - Password: 【初期パスワード（本人に変更依頼）】
  - Auto Confirm User: ON

  作成後、表示された user.id をメモして下記を実行:

INSERT INTO clinic_users (user_id, clinic_id, role)
VALUES (
  '{AUTH_USER_ID}',   -- Dashboard で確認した User ID
  '{RELAQ_CLINIC_ID}', -- STEP1 で取得した UUID
  'owner'
);
*/


-- ================================================================
-- 確認クエリ（セットアップ後に実行して確認）
-- ================================================================
-- SELECT id, clinic_name FROM clinic_settings WHERE clinic_name LIKE '%relaq%';
-- SELECT * FROM reservation_courses WHERE clinic_id = '{RELAQ_CLINIC_ID}';
