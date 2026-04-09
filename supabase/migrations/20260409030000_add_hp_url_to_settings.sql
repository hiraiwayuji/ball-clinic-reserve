-- Add hp_url to clinic_settings
ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS hp_url TEXT;

-- Update comment for self-documenting
COMMENT ON COLUMN clinic_settings.hp_url IS 'Clinic homepage/website URL for SEO/MEO analysis';
