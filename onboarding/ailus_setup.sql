-- ================================================================
-- PRIVATE SALON AILUS（アイラス）＋ KUKUNA CAFE — 事前セットアップSQL
-- 実行場所: Supabase SQL Editor（本番共有プロジェクト uatmzcnoumafeuzprkdo）
-- 実行タイミング: 共通機能マイグレーション（departments / 予約部門 / ブログ）適用後
-- 部門: サロン施術 ／ カフェ(KUKUNA) の2部門。講座はサロンのメニュー扱い。
-- ================================================================

-- STEP 1: クリニック設定レコードを作成
-- 実行後に表示される id (UUID) をメモ → STEP2以降・Vercel環境変数 NEXT_PUBLIC_CLINIC_ID で使用
INSERT INTO clinic_settings (
  clinic_name,
  phone_number,
  address,
  instagram_url,
  area_name,
  departments,                 -- 部門マスタ（経費・予約で共通利用）
  cafe_seat_capacity,          -- カフェ通常席=17（カウンター5＋2名×4＋4名×1）。個室は別枠・最大9名
  custom_expense_categories
) VALUES (
  'PRIVATE SALON AILUS',
  '088-635-8674',
  '〒771-1273 徳島県板野郡藍住町矢上字春日11-11',   -- ※郵便番号は要確認
  'https://www.instagram.com/ailus_mei',
  '藍住町',
  ARRAY['サロン','カフェ']::text[],
  17,
  '{}'
)
RETURNING id, clinic_name;

-- ↑ 実行後に出力された id をメモ: ________________________________
-- 営業時間・定休日・LINE(@aip5428p)・カラー等は導入後に /admin/settings で設定
-- カフェ通常席=17席。個室(最大9名・5名以上/子連れ限定)は STEP2 の席メニューで管理。


-- ================================================================
-- STEP 2: メニュー（コース）設定
-- {AILUS_CLINIC_ID} を STEP1 の UUID に置換して実行
-- department='サロン' は施術(capacity_type='service')、'カフェ' は席予約(capacity_type='seating')
-- ================================================================

/*
-- ── サロン施術（リンパ・エステ等） ──
INSERT INTO reservation_courses (clinic_id, name, duration_minutes, price, department, capacity_type, is_active, sort_order) VALUES
  ('{AILUS_CLINIC_ID}', 'ホルミシスリンパ（60分）',  60,  5500, 'サロン', 'service', true, 1),
  ('{AILUS_CLINIC_ID}', 'ホルミシスリンパ（90分）',  90,  8500, 'サロン', 'service', true, 2),
  ('{AILUS_CLINIC_ID}', 'ぬるしおリンパ（60分）',    60,  8000, 'サロン', 'service', true, 3),
  ('{AILUS_CLINIC_ID}', 'ぬるしおリンパ（90分）',    90, 12000, 'サロン', 'service', true, 4),
  ('{AILUS_CLINIC_ID}', 'ホルミシスエステ（顔）',    60,  4000, 'サロン', 'service', true, 5),
  ('{AILUS_CLINIC_ID}', 'ぬるしおエステ（顔）',      60,  6000, 'サロン', 'service', true, 6),
  ('{AILUS_CLINIC_ID}', 'ネトラバスティ（目）',      30,  3500, 'サロン', 'service', true, 7),
  ('{AILUS_CLINIC_ID}', '腸トリートメント',          60,  8000, 'サロン', 'service', true, 8);

-- ── 講座（スクール。サロン部門のメニューとして登録） ──
INSERT INTO reservation_courses (clinic_id, name, duration_minutes, price, department, capacity_type, is_active, sort_order) VALUES
  ('{AILUS_CLINIC_ID}', 'ぬるしお小顔フェイシャル講座（ディプロマ）', 180, 38500, 'サロン', 'service', true, 20),
  ('{AILUS_CLINIC_ID}', '腸マッサージ講座（ディプロマ）',           300, 38000, 'サロン', 'service', true, 21),
  ('{AILUS_CLINIC_ID}', 'セルフフェイシャル講座',                   60,  3500, 'サロン', 'service', true, 22),
  ('{AILUS_CLINIC_ID}', 'セルフ腸マッサージ講座',                   60,  3000, 'サロン', 'service', true, 23);

-- ── カフェ KUKUNA（席予約。人数で予約。食事は来店時に注文） ──
-- 通常席: 同時上限は clinic_settings.cafe_seat_capacity（通常席数の確定待ち）
-- 個室  : 子連れ or 5名以上限定・最大9名 → max_party_size=9
INSERT INTO reservation_courses (clinic_id, name, duration_minutes, price, department, capacity_type, max_party_size, is_active, sort_order) VALUES
  ('{AILUS_CLINIC_ID}', 'カフェ ご来店（テーブル席）', 90, NULL, 'カフェ', 'seating', NULL, true, 40),
  ('{AILUS_CLINIC_ID}', 'カフェ 個室（5名以上/お子様連れ）', 90, NULL, 'カフェ', 'seating', 9, true, 41);
*/


-- ================================================================
-- STEP 3: スタッフ登録
-- {AILUS_CLINIC_ID} を置換して実行
-- ================================================================

/*
INSERT INTO reservation_staff (clinic_id, name, is_active, available_for_online_booking, sort_order) VALUES
  ('{AILUS_CLINIC_ID}', 'MEI',   true, true, 1),
  ('{AILUS_CLINIC_ID}', 'yoko',  true, true, 2),
  ('{AILUS_CLINIC_ID}', 'haruki', true, true, 3);
*/


-- ================================================================
-- STEP 4: 導入当日 — 管理者アカウント作成
-- ================================================================

-- Supabase Dashboard → Authentication → Users → "Add User"
--   - Email: mei1026mei@icloud.com（MEI様）
--   - Password: 初期パスワード（本人に変更依頼）
--   - Auto Confirm User: ON
-- 作成後、表示された user.id をメモして下記を実行:
/*
INSERT INTO clinic_users (user_id, clinic_id, role)
VALUES (
  '{AUTH_USER_ID}',
  '{AILUS_CLINIC_ID}',
  'owner'
);
*/


-- ================================================================
-- 確認クエリ（セットアップ後に実行）
-- ================================================================
-- SELECT id, clinic_name, departments FROM clinic_settings WHERE clinic_name LIKE '%AILUS%';
-- SELECT name, department, capacity_type, price FROM reservation_courses WHERE clinic_id = '{AILUS_CLINIC_ID}' ORDER BY sort_order;
-- SELECT name FROM reservation_staff WHERE clinic_id = '{AILUS_CLINIC_ID}';
