-- カレンダーイベントテーブル（家族共有カレンダー用）
CREATE TABLE public.calendar_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  calendar_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_all_day BOOLEAN DEFAULT FALSE,
  color TEXT DEFAULT '#3B82F6',
  member_name TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- インデックス
CREATE INDEX idx_calendar_events_calendar_id ON public.calendar_events(calendar_id);
CREATE INDEX idx_calendar_events_start_time ON public.calendar_events(start_time);

-- RLS
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- calendar_idを知っていれば誰でも読み書き可能（URLベースの共有）
CREATE POLICY "Anyone can select calendar_events" ON public.calendar_events FOR SELECT USING (true);
CREATE POLICY "Anyone can insert calendar_events" ON public.calendar_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update calendar_events" ON public.calendar_events FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete calendar_events" ON public.calendar_events FOR DELETE USING (true);
