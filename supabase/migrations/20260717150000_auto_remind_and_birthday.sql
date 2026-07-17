-- 自動LINE配信の設定（当日リマインド／誕生日）。
--
-- 背景: /api/line/remind/appointments は auto_remind_enabled を見ているのに列が存在せず、
-- 毎日のcronが必ずskipしていた（＝自動リマインドは一度も動いていない）。列を追加して機能させる。
--
-- ★安全のため既定は false（OFF）。院ごとに設定画面でONにするまで患者さんへは一切送らない。
-- 2026-07-17 追加。

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS auto_remind_enabled   BOOLEAN NOT NULL DEFAULT false;

-- 送信時刻（"HH:MM"）。Vercel Hobby の cron は1日1回なので現状は表示・将来用。
ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS auto_remind_time      TEXT    NOT NULL DEFAULT '08:00';

-- 誕生日メッセージの自動送信（当日）
ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS auto_birthday_enabled BOOLEAN NOT NULL DEFAULT false;

-- 誕生日メッセージを送った年（同じ年に二重送信しないためのガード）
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS birthday_line_sent_year INTEGER;
