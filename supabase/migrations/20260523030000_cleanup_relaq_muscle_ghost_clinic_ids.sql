-- ============================================================
-- RELAQ x2 と マッスル整体 x4 のゴースト clinic_settings 整理
-- ============================================================
-- ぼーるくん指示 (2026-05-23): マッスル整体は今夜実装予定。重複は全部解消する。
--
-- 本物（各院の Vercel env NEXT_PUBLIC_CLINIC_ID と一致）:
--   RELAQ      = 021efe2a-a768-4fa6-9de8-62cae9a79d47 (RELAQ（リラッキュー）, courses 10)
--   マッスル整体 = 9f2a3359-3f84-451a-9ccd-d50cb3dd8bbd (courses 32)
--
-- ゴースト4件:
--   ef17f537-f1d9-4ddf-8a5e-d9bec35ba99e (RELAQ, users 1)
--   52fe0bcc-c2e8-4909-a32d-e270af054848 (マッスル, users 1)
--   3ad4685f-57ed-4417-a597-f1f2b1d62b55 (マッスル, users 1, staff 2)
--   c4397788-0c0f-417a-97fc-921c06b3f814 (マッスル, 空)
--
-- 戦略:
--   - clinic_users / reservation_staff は本物に UPDATE 移管
--   - admin_notification_targets / clinic_targets / monthly_evaluations は
--     ゴースト同士の (clinic_id, month) 衝突があるため全 DELETE
--     （本格運用前のテストデータなので運用影響なし）
--   - payment_categories は本物にも 6 項目あるためゴースト側を DELETE
--
-- 実行: MCP で本番反映済み。このファイルは履歴目的。
-- ============================================================

BEGIN;

-- ゴースト側の補助データを削除
DELETE FROM public.admin_notification_targets
 WHERE clinic_id IN (
   'ef17f537-f1d9-4ddf-8a5e-d9bec35ba99e',
   '52fe0bcc-c2e8-4909-a32d-e270af054848',
   '3ad4685f-57ed-4417-a597-f1f2b1d62b55',
   'c4397788-0c0f-417a-97fc-921c06b3f814'
 );

DELETE FROM public.clinic_targets
 WHERE clinic_id IN (
   'ef17f537-f1d9-4ddf-8a5e-d9bec35ba99e',
   '52fe0bcc-c2e8-4909-a32d-e270af054848',
   '3ad4685f-57ed-4417-a597-f1f2b1d62b55',
   'c4397788-0c0f-417a-97fc-921c06b3f814'
 );

DELETE FROM public.monthly_evaluations
 WHERE clinic_id IN (
   'ef17f537-f1d9-4ddf-8a5e-d9bec35ba99e',
   '52fe0bcc-c2e8-4909-a32d-e270af054848',
   '3ad4685f-57ed-4417-a597-f1f2b1d62b55',
   'c4397788-0c0f-417a-97fc-921c06b3f814'
 );

DELETE FROM public.payment_categories
 WHERE clinic_id IN (
   'ef17f537-f1d9-4ddf-8a5e-d9bec35ba99e',
   '52fe0bcc-c2e8-4909-a32d-e270af054848',
   '3ad4685f-57ed-4417-a597-f1f2b1d62b55',
   'c4397788-0c0f-417a-97fc-921c06b3f814'
 );

-- clinic_users / reservation_staff は本物へ移管
UPDATE public.clinic_users SET clinic_id = '021efe2a-a768-4fa6-9de8-62cae9a79d47'
 WHERE clinic_id = 'ef17f537-f1d9-4ddf-8a5e-d9bec35ba99e';

UPDATE public.clinic_users SET clinic_id = '9f2a3359-3f84-451a-9ccd-d50cb3dd8bbd'
 WHERE clinic_id IN (
   '52fe0bcc-c2e8-4909-a32d-e270af054848',
   '3ad4685f-57ed-4417-a597-f1f2b1d62b55'
 );

UPDATE public.reservation_staff SET clinic_id = '9f2a3359-3f84-451a-9ccd-d50cb3dd8bbd'
 WHERE clinic_id IN (
   '52fe0bcc-c2e8-4909-a32d-e270af054848',
   '3ad4685f-57ed-4417-a597-f1f2b1d62b55',
   'c4397788-0c0f-417a-97fc-921c06b3f814'
 );

-- ゴースト clinic_settings 削除
DELETE FROM public.clinic_settings
 WHERE id IN (
   'ef17f537-f1d9-4ddf-8a5e-d9bec35ba99e',
   '52fe0bcc-c2e8-4909-a32d-e270af054848',
   '3ad4685f-57ed-4417-a597-f1f2b1d62b55',
   'c4397788-0c0f-417a-97fc-921c06b3f814'
 );

COMMIT;
