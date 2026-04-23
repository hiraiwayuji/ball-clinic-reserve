-- ================================================================
-- マッスル整体 — 事前セットアップSQL
-- 実行場所: Supabase SQL Editor（本番共有プロジェクト）
-- 実行タイミング: 導入当日より前に実行しておく
-- ================================================================

-- STEP 1: クリニック設定レコードを作成
-- 実行後に表示される id (UUID) をメモしておくこと → STEP2・Vercel環境変数で使用
INSERT INTO clinic_settings (
  clinic_name,
  phone_number,
  address,
  instagram_url,
  hp_url,
  area_name,
  custom_expense_categories
) VALUES (
  'マッスル整体',
  '087-888-8144',
  '〒761-8078 香川県高松市仏生山町甲1667-1',
  'https://www.instagram.com/muscle8144',
  'https://www.muscle8144.com/',
  '高松市 仏生山',
  '{}'
)
RETURNING id, clinic_name;

-- ↑ 実行後に出力された id をメモ: ________________________________


-- ================================================================
-- STEP 2: コース設定
-- 下記の {MUSCLE_CLINIC_ID} を STEP1 で取得した UUID に置き換えて実行
-- ================================================================

/*
INSERT INTO reservation_courses (clinic_id, name, duration_minutes, price, description, is_active, sort_order) VALUES
  ('{MUSCLE_CLINIC_ID}', 'メディセル筋膜リリース',  60, NULL, NULL, true, 1),
  ('{MUSCLE_CLINIC_ID}', 'メディセル整体',          60, NULL, NULL, true, 2),
  ('{MUSCLE_CLINIC_ID}', 'メディセルスポーツ整体',  60, NULL, NULL, true, 3),
  ('{MUSCLE_CLINIC_ID}', '整体',                    45, NULL, NULL, true, 4),
  ('{MUSCLE_CLINIC_ID}', 'フットマッサージ',        30, NULL, NULL, true, 5),
  ('{MUSCLE_CLINIC_ID}', '高気圧水素浴カプセル',    60, NULL, NULL, true, 6);
*/


-- ================================================================
-- STEP 3: 導入当日 — 管理者アカウント作成
-- /register からSETUP_PASSWORDで登録してもらうのが最も簡単
-- ================================================================

-- ※ /register を使う場合は SETUP_PASSWORD を川上様に伝えるだけでOK
-- ※ SQL で直接作成する場合:
/*
  Supabase Dashboard → Authentication → Users → "Add User"
  - Email: 川上様のメールアドレス
  - Password: 初期パスワード（本人に変更依頼）
  - Auto Confirm User: ON

  作成後、表示された user.id をメモして下記を実行:

INSERT INTO clinic_users (user_id, clinic_id, role)
VALUES (
  '{AUTH_USER_ID}',
  '{MUSCLE_CLINIC_ID}',
  'owner'
);
*/


-- ================================================================
-- 確認クエリ（セットアップ後に実行）
-- ================================================================
-- SELECT id, clinic_name FROM clinic_settings WHERE clinic_name LIKE '%マッスル%';
-- SELECT * FROM reservation_courses WHERE clinic_id = '{MUSCLE_CLINIC_ID}';
