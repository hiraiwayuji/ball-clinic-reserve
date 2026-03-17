-- Add clinic_id to existing tables for multi-tenancy
-- Default clinic ID for "Ball Clinic"
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'uuid') THEN
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    END IF;
END $$;

-- 1. Ensure clinic_settings has the target ID
INSERT INTO public.clinic_settings (id, clinic_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'ボール接骨院')
ON CONFLICT (id) DO NOTHING;

-- 2. Add clinic_id to appointments
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinic_settings(id) DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE public.appointments SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
ALTER TABLE public.appointments ALTER COLUMN clinic_id SET NOT NULL;

-- 3. Add clinic_id to customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinic_settings(id) DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE public.customers SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
ALTER TABLE public.customers ALTER COLUMN clinic_id SET NOT NULL;

-- 4. Add clinic_id to calendar_events
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinic_settings(id) DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE public.calendar_events SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
ALTER TABLE public.calendar_events ALTER COLUMN clinic_id SET NOT NULL;

-- 5. Add clinic_id to revenue related tables
ALTER TABLE public.cash_sales ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinic_settings(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.insurance_payments ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinic_settings(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.clinic_targets ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinic_settings(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.monthly_evaluations ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinic_settings(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.daily_tasks ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinic_settings(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.clinic_expenses ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinic_settings(id) DEFAULT '00000000-0000-0000-0000-000000000001';

-- Update existing records for revenue tables
UPDATE public.cash_sales SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
UPDATE public.insurance_payments SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
UPDATE public.clinic_targets SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
UPDATE public.monthly_evaluations SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
UPDATE public.daily_tasks SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
UPDATE public.clinic_expenses SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;

-- 6. Add clinic_id unique constraints where applicable (e.g. month in targets)
-- month is already unique in clinic_targets and monthly_evaluations, but for multi-tenancy it should be (clinic_id, month) unique
ALTER TABLE public.clinic_targets DROP CONSTRAINT IF EXISTS clinic_targets_month_key;
ALTER TABLE public.clinic_targets ADD CONSTRAINT clinic_targets_clinic_month_unique UNIQUE (clinic_id, month);

ALTER TABLE public.monthly_evaluations DROP CONSTRAINT IF EXISTS monthly_evaluations_month_key;
ALTER TABLE public.monthly_evaluations ADD CONSTRAINT monthly_evaluations_clinic_month_unique UNIQUE (clinic_id, month);
