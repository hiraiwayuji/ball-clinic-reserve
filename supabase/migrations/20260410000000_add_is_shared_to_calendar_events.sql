-- Add is_shared column to calendar_events table
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT FALSE;
