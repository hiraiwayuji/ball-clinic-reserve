-- push_subscriptions: Web Push 購読情報の管理テーブル
-- calendar_id 単位で端末を管理（家族カレンダー向け）

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  calendar_id TEXT        NOT NULL,
  endpoint    TEXT        NOT NULL UNIQUE,
  p256dh      TEXT        NOT NULL,
  auth        TEXT        NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス: calendar_id で絞り込む通知送信に使用
CREATE INDEX IF NOT EXISTS push_subscriptions_calendar_id_idx
  ON public.push_subscriptions (calendar_id);

-- RLS 有効化
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 匿名ユーザー・認証ユーザーどちらでも自分の endpoint を登録・削除可能
CREATE POLICY "Anyone can subscribe" ON public.push_subscriptions
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can unsubscribe their endpoint" ON public.push_subscriptions
  FOR DELETE TO anon, authenticated
  USING (true);

-- 通知送信はサービスロール（サーバーサイド）のみ
CREATE POLICY "Service role can read subscriptions" ON public.push_subscriptions
  FOR SELECT TO service_role
  USING (true);

CREATE POLICY "Service role can delete stale subscriptions" ON public.push_subscriptions
  FOR DELETE TO service_role
  USING (true);
