-- daily_tasksテーブルにAI提案の見本情報を保存するカラムを追加
ALTER TABLE public.daily_tasks ADD COLUMN IF NOT EXISTS reference_content TEXT;

-- 既存のマルチテナンシーポリシーでそのままアクセス可能なはずですが、念のため確認
-- (特に変更は不要)
