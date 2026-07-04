-- appointments.cancel_hidden: キャンセル済み予約の「薄い表示」をカレンダーから隠すフラグ。
-- 削除ではなく非表示（記録・しめ作業・顧客キャンセル履歴には残る）。
-- 承認済み（cancel_kind='approved' / 'clinic_reason'）のキャンセルだけ隠せる運用。
-- 「非表示のキャンセルを表示」トグルでいつでも再表示できる。

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS cancel_hidden BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.appointments.cancel_hidden IS
  'キャンセル済みの薄い表示をカレンダーから隠す（削除はしない）。復活時は false に戻す。';
