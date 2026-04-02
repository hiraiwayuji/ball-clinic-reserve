-- 修正: プロトタイプ用の匿名UPDATE/DELETEポリシーを削除
-- 理由: 認証なしで誰でも他人の予約を変更・削除できるセキュリティリスクを解消
-- SaaS化に向けたマルチテナント安全基盤の整備（Phase 1 緊急対応）

-- 1. 匿名ユーザーへの UPDATE 許可ポリシーを削除
DROP POLICY IF EXISTS "Enable update for anon users" ON "public"."appointments";

-- 2. 匿名ユーザーへの DELETE 許可ポリシーを削除
DROP POLICY IF EXISTS "Enable delete for anon users" ON "public"."appointments";
