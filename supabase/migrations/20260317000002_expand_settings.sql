-- Expand clinic_settings table with SNS and LINE integration fields
ALTER TABLE public.clinic_settings 
ADD COLUMN IF NOT EXISTS tiktok_url text,
ADD COLUMN IF NOT EXISTS instagram_url text,
ADD COLUMN IF NOT EXISTS youtube_url text,
ADD COLUMN IF NOT EXISTS x_url text,
ADD COLUMN IF NOT EXISTS line_official_account_url text,
ADD COLUMN IF NOT EXISTS line_channel_access_token text,
ADD COLUMN IF NOT EXISTS line_channel_secret text,
ADD COLUMN IF NOT EXISTS area_name text,
ADD COLUMN IF NOT EXISTS target_persona text,
ADD COLUMN IF NOT EXISTS video_tone text,
ADD COLUMN IF NOT EXISTS analysis_keywords text[];

-- Update existing default row if it exists
UPDATE public.clinic_settings 
SET area_name = '○○市 ○○駅',
    target_persona = 'women3040',
    video_tone = 'friendly',
    analysis_keywords = ARRAY['スマホ首', '反り腰', '産後骨盤矯正', '自律神経']
WHERE id = '00000000-0000-0000-0000-000000000001';
