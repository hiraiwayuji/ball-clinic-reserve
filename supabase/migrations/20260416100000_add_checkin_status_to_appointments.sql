-- 受付カウンター用チェックインステータスを appointments テーブルに追加
-- 値: null(未来院) | 'arrived'(来院済/待合室) | 'in_treatment'(施術中) | 'done'(会計完了)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS checkin_status text;
