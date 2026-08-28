-- clinic_blocked_slots に「特定の先生だけ」を対象にしたブロックを追加できるようにする。
-- 従来は staff_id が無く、院ぜんたいを塞ぐ「休憩」専用だった。
-- staff_id が NULL のまま＝院ぜんたいを塞ぐ（既存の休憩機能はそのまま）。
-- staff_id を入れる＝その先生の行だけを塞ぐ（受付が忙しい時に「この先生この時間NG」を即置きする用）。
-- 2026-08-28 新規。

ALTER TABLE public.clinic_blocked_slots
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.reservation_staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clinic_blocked_slots_staff
  ON public.clinic_blocked_slots (staff_id)
  WHERE staff_id IS NOT NULL;

-- 旧UNIQUE制約は (clinic_id, date, start_time) のみだったため、
-- 「同じ時刻に先生Aと先生BをそれぞれNGにする」が二重登録エラーになってしまう。
-- staff_id を含めて張り直す。NULLS NOT DISTINCT で、院ぜんたいブロック（staff_id NULL）
-- 同士の重複防止という既存の挙動はそのまま維持する（PG15+で対応、本番は17系）。
ALTER TABLE public.clinic_blocked_slots
  DROP CONSTRAINT IF EXISTS clinic_blocked_slots_unique;

ALTER TABLE public.clinic_blocked_slots
  ADD CONSTRAINT clinic_blocked_slots_unique
  UNIQUE NULLS NOT DISTINCT (clinic_id, date, start_time, staff_id);
