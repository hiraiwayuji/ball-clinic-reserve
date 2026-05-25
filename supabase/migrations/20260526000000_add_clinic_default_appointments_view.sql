-- ============================================================
-- 院ごとに /admin/appointments のデフォルト表示モードを切り替え可能に
-- ============================================================
-- ぼーるくん要望 (2026-05-26):
--   からだ鍼灸整骨院は「スタッフ予約タイムテーブル」形式で予約一覧を管理したい。
--   院ごとにリスト/タイムテーブルなど表示モードを選べるようにする。
--
-- 値: 'week' (週グリッド/従来), 'day' (日), 'month' (月), 'timetable' (スタッフ別タイムテーブル)
-- デフォルト: 'week'（既存の挙動を維持）
-- からだ鍼灸整骨院だけ 'timetable' に初期化
-- ============================================================

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS default_appointments_view TEXT NOT NULL DEFAULT 'week';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'clinic_settings_default_appointments_view_check'
       AND table_name = 'clinic_settings'
  ) THEN
    ALTER TABLE public.clinic_settings
      ADD CONSTRAINT clinic_settings_default_appointments_view_check
      CHECK (default_appointments_view IN ('week', 'day', 'month', 'timetable'));
  END IF;
END $$;

COMMENT ON COLUMN public.clinic_settings.default_appointments_view IS
  '/admin/appointments のデフォルト表示モード: week=週, day=日, month=月, timetable=スタッフ別タイムテーブル。院ごとに変更可能';

-- からだ鍼灸整骨院は最初から timetable をデフォルトに（藤川先生希望）
UPDATE public.clinic_settings
   SET default_appointments_view = 'timetable'
 WHERE id = 'd3b55abc-46a6-4cbe-8198-21c0392d9a2e';
