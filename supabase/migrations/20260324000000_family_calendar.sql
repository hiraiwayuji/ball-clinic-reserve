
-- Create family_events table
CREATE TABLE IF NOT EXISTS public.family_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.clinics(id),
    event_date DATE NOT NULL,
    title TEXT NOT NULL,
    event_time TEXT, -- HH:mm
    description TEXT,
    is_match BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.family_events ENABLE ROW LEVEL SECURITY;

-- Allow public access for this phase (consistent with clinic's public-facing calendar needs)
CREATE POLICY "Anyone can manage family_events" ON public.family_events
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Insert initial RED OLD match data
INSERT INTO public.family_events (event_date, title, event_time, description, is_match)
VALUES 
    ('2026-04-05', 'RED OLD vs 徳島SFC50', '15:10', '※3/20から変更', true),
    ('2026-05-10', 'RED OLD vs Z団', '15:20', '会場: TSV人工', true),
    ('2026-05-17', 'RED OLD vs 鳴門クラブ', '11:10', '会場: 山川総合', true),
    ('2026-05-24', 'RED OLD vs 応神・鴨島FC', '13:30', '会場: 南岸第3', true),
    ('2026-06-07', 'RED OLD vs T-C-O-SC', '17:10', '会場: 上桜', true),
    ('2026-06-28', 'RED OLD vs 吉野倶楽部', '15:50', '会場: 山川総合', true),
    ('2026-09-27', 'RED OLD vs REBORN', '11:10', '会場: 山川総合', true),
    ('2026-11-01', 'RED OLD vs 阿南シニアフットボールクラブ', '14:40', '会場: あわぎん (※11/8から変更)', true),
    ('2026-11-29', 'RED OLD vs SCRATCH+(スクラッチプラス)', '14:40', '会場: 山川総合', true),
    ('2026-12-20', 'RED OLD vs RE BORN', '14:40', '会場: 山川総合', true),
    ('2027-01-10', 'RED OLD vs 徳島市シニアサッカークラブ', '11:30', '会場: TSV人工', true),
    ('2027-01-17', 'RED OLD vs 鳴門 Rizort', '12:20', '会場: 山川総合', true);
