-- Create demo_inquiries table for lead generation
CREATE TABLE IF NOT EXISTS public.demo_inquiries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_name TEXT NOT NULL,
    representative_name TEXT NOT NULL,
    contact_info TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.demo_inquiries ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (for the inquiry form)
CREATE POLICY "Allow anonymous inserts" ON public.demo_inquiries
    FOR INSERT WITH CHECK (true);

-- Allow admins to read inclusions
CREATE POLICY "Allow service_role full access" ON public.demo_inquiries
    FOR ALL USING (true);
