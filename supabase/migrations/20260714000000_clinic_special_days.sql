-- 臨時営業日（日付ごとの特別スケジュール）。
-- clinic_holidays（休診＝1日まるごと）や clinic_blocked_slots（時間帯を塞ぐ）とは別で、
-- 「この日だけ営業時間を変える／当日予約を止める／お知らせを出す」を1レコードで扱う。
--   - closed=true          → その日を休診にする（clinic_holidays と同等の効果）
--   - open_time/close_time → その日だけの臨時営業時間（通常営業時間の“外”にも開ける）
--   - block_same_day=true  → 事前予約は受けるが「当日予約」は不可にする
--   - note                 → 患者向けのひとことメモ（イベント告知など）
-- お盆・短縮営業・イベント日などの不規則な日を一元管理するため 2026-07-14 新規。

CREATE TABLE IF NOT EXISTS public.clinic_special_days (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id       UUID        NOT NULL REFERENCES public.clinic_settings(id) ON DELETE CASCADE,
  date            DATE        NOT NULL,
  closed          BOOLEAN     NOT NULL DEFAULT false,   -- 終日休診
  open_time       TIME        NULL,                     -- 臨時営業 開始（"HH:MM"）。NULL=通常営業時間
  close_time      TIME        NULL,                     -- 臨時営業 終了（"HH:MM"）。NULL=通常営業時間
  block_same_day  BOOLEAN     NOT NULL DEFAULT false,   -- 当日予約を不可にする（事前予約はOK）
  note            TEXT        NULL,                      -- 患者向けメモ（任意）
  created_by      UUID        REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  -- 同じ院・同じ日の二重登録を防ぐ（1日1レコード）
  CONSTRAINT clinic_special_days_unique UNIQUE (clinic_id, date),
  -- 臨時営業時間を入れる場合は終了は開始より後
  CONSTRAINT clinic_special_days_time_order CHECK (
    open_time IS NULL OR close_time IS NULL OR close_time > open_time
  )
);

-- 院ごと・日付での絞り込みを高速化
CREATE INDEX IF NOT EXISTS idx_clinic_special_days_clinic_date
  ON public.clinic_special_days (clinic_id, date);

ALTER TABLE public.clinic_special_days ENABLE ROW LEVEL SECURITY;

-- 読み取りは患者Web予約（匿名）でもスロット計算に使うため全許可（clinic_id 絞りはアプリ側で実施）。
-- clinic_holidays / clinic_blocked_slots と同じ運用方針。
DROP POLICY IF EXISTS "Allow read access on clinic_special_days" ON public.clinic_special_days;
CREATE POLICY "Allow read access on clinic_special_days"
  ON public.clinic_special_days
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated can insert clinic_special_days" ON public.clinic_special_days;
CREATE POLICY "Authenticated can insert clinic_special_days"
  ON public.clinic_special_days
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update clinic_special_days" ON public.clinic_special_days;
CREATE POLICY "Authenticated can update clinic_special_days"
  ON public.clinic_special_days
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can delete clinic_special_days" ON public.clinic_special_days;
CREATE POLICY "Authenticated can delete clinic_special_days"
  ON public.clinic_special_days
  FOR DELETE TO authenticated
  USING (true);

-- 患者Web予約のリアルタイム反映用に publication へ追加（既に入っていてもエラーにしない）
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.clinic_special_days;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
