-- Add target_repeat_rate to clinic_targets
ALTER TABLE public.clinic_targets ADD COLUMN IF NOT EXISTS target_repeat_rate INTEGER DEFAULT 0;
