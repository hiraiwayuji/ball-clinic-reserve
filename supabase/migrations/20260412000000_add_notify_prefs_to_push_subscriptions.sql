-- push_subscriptions に通知設定カラムを追加
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS member_name TEXT,
  ADD COLUMN IF NOT EXISTS notify_others BOOLEAN NOT NULL DEFAULT TRUE;
