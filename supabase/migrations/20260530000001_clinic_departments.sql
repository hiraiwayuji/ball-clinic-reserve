-- 店舗の「部門」マスタ（サロン/カフェ 等）。経費・予約の両方で共通利用。全院共通機能。
-- 運用モード設定: clinic_settings.departments が空の院は従来通り（部門UIを出さない）。
-- 列追加のみ（nullable / default 空配列）＝後方互換・本番リスク最小。

ALTER TABLE clinic_settings
  ADD COLUMN IF NOT EXISTS departments TEXT[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE clinic_expenses
  ADD COLUMN IF NOT EXISTS department TEXT;
