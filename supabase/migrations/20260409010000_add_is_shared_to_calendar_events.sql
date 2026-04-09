-- Add is_shared column to calendar_events for private/shared event control
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN public.calendar_events.is_shared IS '家族に共有するかどうか（FALSEの場合は自分のカレンダーにのみ表示）';
