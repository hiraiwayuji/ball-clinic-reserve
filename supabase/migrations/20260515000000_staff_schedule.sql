-- スタッフ勤務時間 + 臨時不在（ミーティング等）を管理するためのスキーマ整備
-- reservation_staff は本番に手動作成済みの可能性があるため IF NOT EXISTS + ALTER ADD COLUMN IF NOT EXISTS で冪等化
-- clinics への FOREIGN KEY は本番側で既に張られている前提（ここでは付け直さない）

-- 1. reservation_staff: 不足カラムの後付け（テーブル本体は本番に既にある想定）
CREATE TABLE IF NOT EXISTS public.reservation_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  birth_date DATE,
  available_for_online_booking BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reservation_staff
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS available_for_online_booking BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_reservation_staff_clinic
  ON public.reservation_staff(clinic_id) WHERE is_active = true;

-- 2. staff_working_hours: 曜日別の基本勤務時間
CREATE TABLE IF NOT EXISTS public.staff_working_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL,
  staff_id UUID NOT NULL REFERENCES public.reservation_staff(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_start TIME,
  break_end TIME,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT staff_working_hours_unique UNIQUE (staff_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_staff_working_hours_clinic
  ON public.staff_working_hours(clinic_id);

-- 3. staff_working_overrides: 臨時不在・ミーティング・振替などスポット予定
--    start_time / end_time が NULL なら終日扱い、blocks_booking=true なら患者LPの予約スロットから消す
CREATE TABLE IF NOT EXISTS public.staff_working_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL,
  staff_id UUID NOT NULL REFERENCES public.reservation_staff(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  kind TEXT NOT NULL CHECK (kind IN ('meeting','leave','training','other')),
  note TEXT,
  blocks_booking BOOLEAN NOT NULL DEFAULT true,
  created_by_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT staff_working_overrides_time_check
    CHECK ((start_time IS NULL AND end_time IS NULL) OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time))
);

CREATE INDEX IF NOT EXISTS idx_swo_clinic_date
  ON public.staff_working_overrides(clinic_id, date);
CREATE INDEX IF NOT EXISTS idx_swo_staff_date
  ON public.staff_working_overrides(staff_id, date);

-- 4. RLS
ALTER TABLE public.staff_working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_working_overrides ENABLE ROW LEVEL SECURITY;

-- 患者LP（anon）はスロット計算のため SELECT のみ許可
DROP POLICY IF EXISTS staff_working_hours_anon_select ON public.staff_working_hours;
CREATE POLICY staff_working_hours_anon_select ON public.staff_working_hours
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS staff_working_overrides_anon_select ON public.staff_working_overrides;
CREATE POLICY staff_working_overrides_anon_select ON public.staff_working_overrides
  FOR SELECT TO anon, authenticated USING (true);

-- 管理画面（authenticated）からの書き込みは clinic_users 経由で server action が service_role で実行する前提
-- 念のため authenticated でも自院 clinic_id に対する INSERT/UPDATE/DELETE を許可
DROP POLICY IF EXISTS staff_working_hours_auth_write ON public.staff_working_hours;
CREATE POLICY staff_working_hours_auth_write ON public.staff_working_hours
  FOR ALL TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS staff_working_overrides_auth_write ON public.staff_working_overrides;
CREATE POLICY staff_working_overrides_auth_write ON public.staff_working_overrides
  FOR ALL TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()));

-- 5. clinic_settings に prefecture カラムを追加（Phase 5 で使用、院ごとの基本属性）
ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS prefecture TEXT;

-- 既存院は徳島を default として埋める（からだ鍼灸整骨院/ボール接骨院 ともに徳島）
UPDATE public.clinic_settings
   SET prefecture = '徳島'
 WHERE prefecture IS NULL;
