-- ============================================================
-- マッスル整体 初期データセットアップ
-- ※ マッスル整体専用の新規Supabaseプロジェクトで実行すること
--    （全マイグレーション実行後にこのSQLを実行）
-- ============================================================

-- 1. clinic_settings を更新（マイグレーションでデフォルト行が作成済み）
UPDATE public.clinic_settings
SET
  clinic_name    = 'マッスル整体',
  primary_color  = 'violet',
  phone_number   = '087-888-8144',
  address        = '〒761-8078 香川県高松市仏生山町甲1667-1',
  instagram_url  = 'https://www.instagram.com/muscle8144',
  hp_url         = 'https://www.muscle8144.com/',
  area_name      = '高松市 仏生山',
  doctor_count   = 1,
  staff_count    = 1,
  max_beds       = 3
WHERE id = '00000000-0000-0000-0000-000000000001';

-- 2. reservation_courses に6コース登録
INSERT INTO public.reservation_courses (clinic_id, name, duration_minutes, price, description, is_active, sort_order)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'メディセル筋膜リリース',  60, NULL, NULL, true, 1),
  ('00000000-0000-0000-0000-000000000001', 'メディセル整体',          60, NULL, NULL, true, 2),
  ('00000000-0000-0000-0000-000000000001', 'メディセルスポーツ整体',  60, NULL, NULL, true, 3),
  ('00000000-0000-0000-0000-000000000001', '整体',                    45, NULL, NULL, true, 4),
  ('00000000-0000-0000-0000-000000000001', 'フットマッサージ',        30, NULL, NULL, true, 5),
  ('00000000-0000-0000-0000-000000000001', '高気圧水素浴カプセル',    60, NULL, NULL, true, 6)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 【マッスル整体 導入フルフロー】
--
-- Step 1: Supabase で新規プロジェクトを作成
--
-- Step 2: 全マイグレーションを実行
--   supabase/migrations/ 内のSQLファイルを
--   日付順にSQL Editorで全て実行する
--
-- Step 3: このSQLを実行（初期データ投入）
--
-- Step 4: 管理者ユーザーを作成
--   Authentication > Users > Add user
--   川上様のメールアドレスとパスワードを設定
--
-- Step 5: clinic_users に紐付け
--   INSERT INTO public.clinic_users (user_id, clinic_id, role)
--   VALUES ('<user_id>', '00000000-0000-0000-0000-000000000001', 'admin');
--
-- Step 6: Vercel で新規プロジェクト作成
--   - GitHubリポジトリ: hiraiwayuji/ball-clinic-reserve を接続
--   - 環境変数にマッスル整体のSupabase URLとキーを設定
--     NEXT_PUBLIC_SUPABASE_URL=（マッスル整体のSupabase URL）
--     NEXT_PUBLIC_SUPABASE_ANON_KEY=（マッスル整体のAnon Key）
--     SUPABASE_SERVICE_ROLE_KEY=（マッスル整体のService Role Key）
--
-- Step 7: 管理画面（/admin/settings）で
--         営業時間・定休日（月曜）を設定
-- ============================================================
