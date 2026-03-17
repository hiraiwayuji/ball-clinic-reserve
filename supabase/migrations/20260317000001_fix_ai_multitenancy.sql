-- Add clinic_id to AI related tables for multi-tenancy
ALTER TABLE public.ai_memos ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinic_settings(id) DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE public.ai_memos SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
ALTER TABLE public.ai_memos ALTER COLUMN clinic_id SET NOT NULL;

ALTER TABLE public.ai_blog_proposals ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinic_settings(id) DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE public.ai_blog_proposals SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
ALTER TABLE public.ai_blog_proposals ALTER COLUMN clinic_id SET NOT NULL;

-- Update unique constraints for ai_blog_proposals (if applicable, though usually it's per week)
-- If we want one proposal per week per clinic:
-- ALTER TABLE public.ai_blog_proposals ADD CONSTRAINT ai_blog_proposals_clinic_week_unique UNIQUE (clinic_id, week_start);
