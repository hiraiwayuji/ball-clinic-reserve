-- 臨時の休憩枠（カレンダーから自由に追加する「休憩」「中抜け」「会議」など）。
-- clinic_holidays（休診日＝1日まるごと）とは別物で、こちらは「日付＋時間帯」を予約不可にする。
-- 管理カレンダーで追加・削除でき、患者Web予約のスロット計算からも除外される。
-- 2026-06-21 新規。

CREATE TABLE IF NOT EXISTS public.clinic_blocked_slots (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id   UUID        NOT NULL REFERENCES public.clinic_settings(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  start_time  TIME        NOT NULL,         -- "HH:MM"（開始・含む）
  end_time    TIME        NOT NULL,         -- "HH:MM"（終了・含まない）
  reason      TEXT        NOT NULL DEFAULT '休憩',
  created_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  -- 同じ院・同じ日・同じ開始時刻の二重登録を防ぐ
  CONSTRAINT clinic_blocked_slots_unique UNIQUE (clinic_id, date, start_time),
  -- 終了は開始より後でなければならない
  CONSTRAINT clinic_blocked_slots_time_order CHECK (end_time > start_time)
);

-- 院ごと・日付での絞り込みを高速化（カレンダー描画／空き判定で多用）
CREATE INDEX IF NOT EXISTS idx_clinic_blocked_slots_clinic_date
  ON public.clinic_blocked_slots (clinic_id, date);

ALTER TABLE public.clinic_blocked_slots ENABLE ROW LEVEL SECURITY;

-- 読み取りは患者Web予約（匿名）でもスロット計算に使うため全許可（clinic_id 絞りはアプリ側で実施）。
-- clinic_holidays と同じ運用方針（後続の RLS 強化監査でまとめて締める）。
DROP POLICY IF EXISTS "Allow read access on clinic_blocked_slots" ON public.clinic_blocked_slots;
CREATE POLICY "Allow read access on clinic_blocked_slots"
  ON public.clinic_blocked_slots
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated can insert clinic_blocked_slots" ON public.clinic_blocked_slots;
CREATE POLICY "Authenticated can insert clinic_blocked_slots"
  ON public.clinic_blocked_slots
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can delete clinic_blocked_slots" ON public.clinic_blocked_slots;
CREATE POLICY "Authenticated can delete clinic_blocked_slots"
  ON public.clinic_blocked_slots
  FOR DELETE TO authenticated
  USING (true);
