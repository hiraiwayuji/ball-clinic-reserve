-- スタッフシフト管理
-- Excel 方眼紙運用（藤川先生のからだ鍼灸整骨院）を画面化するためのテーブル。
-- 既存 staff_working_hours（曜日テンプレート）/ staff_working_overrides（単発例外）
-- とは独立して「オーナーが確認する勤務表 = 確定予定」を表現する。
--
-- 設計判断（Codex レビュー反映）:
--  - テーブル名は staff_shifts（grid は UI 表現のためテーブル名に含めない）
--  - source: 'manual' | 'ai' | 'imported'（生成元）
--  - status: 'draft' | 'confirmed' | 'archived'（確定状態）
--  - generation_id: AI 生成ロット単位の識別子（Phase 4 用、nullable で先入れ）
--  - 30 分グリッドは UI 側でスナップ、DB は素の time range で保持
--  - 業務種類は当面 enum (CHECK)、将来テーブル化前提

-- 1. shift_locations: クリニックごとの場所マスタ
--    例: '鍼灸院' / 'はなまる'。藤川先生が追加・名前変更・無効化できる
CREATE TABLE IF NOT EXISTS public.shift_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_locations_clinic
  ON public.shift_locations(clinic_id) WHERE is_active = true;

-- 2. staff_shifts: シフト本体（時間範囲ベース）
CREATE TABLE IF NOT EXISTS public.staff_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL,
  staff_id UUID NOT NULL REFERENCES public.reservation_staff(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.shift_locations(id) ON DELETE RESTRICT,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  task_type TEXT,
  note TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'confirmed',
  generation_id UUID,
  created_by UUID,
  updated_by UUID,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_shifts_time_check CHECK (end_time > start_time),
  CONSTRAINT staff_shifts_task_type_check
    CHECK (task_type IS NULL OR task_type IN ('hanamaru', 'toko', 'break')),
  CONSTRAINT staff_shifts_source_check
    CHECK (source IN ('manual', 'ai', 'imported')),
  CONSTRAINT staff_shifts_status_check
    CHECK (status IN ('draft', 'confirmed', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_staff_shifts_clinic_date
  ON public.staff_shifts(clinic_id, date);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_staff_date
  ON public.staff_shifts(staff_id, date);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_location_date
  ON public.staff_shifts(location_id, date);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_generation
  ON public.staff_shifts(generation_id) WHERE generation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_shifts_status
  ON public.staff_shifts(clinic_id, status, date);

-- 3. reservation_staff に表示色を追加
--   シフト表セルに使う色名（blue/green/yellow/pink/orange/red など）または HEX。
ALTER TABLE public.reservation_staff
  ADD COLUMN IF NOT EXISTS display_color TEXT;

-- 4. RLS（既存 staff_working_hours / staff_working_overrides と同パターン）
ALTER TABLE public.shift_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;

-- 患者LP（anon）からの予約スロット計算で将来使う可能性があるため SELECT は許可
DROP POLICY IF EXISTS shift_locations_anon_select ON public.shift_locations;
CREATE POLICY shift_locations_anon_select ON public.shift_locations
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS staff_shifts_anon_select ON public.staff_shifts;
CREATE POLICY staff_shifts_anon_select ON public.staff_shifts
  FOR SELECT TO anon, authenticated USING (true);

-- 管理画面（authenticated）からは clinic_users 経由で自院のみ書き込み許可
DROP POLICY IF EXISTS shift_locations_auth_write ON public.shift_locations;
CREATE POLICY shift_locations_auth_write ON public.shift_locations
  FOR ALL TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS staff_shifts_auth_write ON public.staff_shifts;
CREATE POLICY staff_shifts_auth_write ON public.staff_shifts
  FOR ALL TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()));

-- 5. updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION public.set_staff_shifts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_staff_shifts_updated_at ON public.staff_shifts;
CREATE TRIGGER trg_staff_shifts_updated_at
  BEFORE UPDATE ON public.staff_shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_staff_shifts_updated_at();

-- 6. コメント
COMMENT ON TABLE public.shift_locations IS 'シフト表で使う場所マスタ（鍼灸院/はなまる等）';
COMMENT ON TABLE public.staff_shifts IS 'スタッフのシフト本体（時間範囲、30分グリッドは UI 側でスナップ）';
COMMENT ON COLUMN public.staff_shifts.source IS 'manual=オーナー手入力 / ai=AI生成 / imported=Excel取込';
COMMENT ON COLUMN public.staff_shifts.status IS 'draft=未確定（AI案や下書き）/ confirmed=確定 / archived=過去';
COMMENT ON COLUMN public.staff_shifts.task_type IS '追加業務種類: hanamaru/toko/break（NULL = 通常勤務のみ）';
COMMENT ON COLUMN public.staff_shifts.generation_id IS 'AI生成ロット単位の識別子（Phase 4 用）';
COMMENT ON COLUMN public.reservation_staff.display_color IS 'シフト表での表示色（blue/green/yellow/pink/orange/red 等のキー名）';
