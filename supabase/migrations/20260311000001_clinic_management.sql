-- Clinic Targets Table
CREATE TABLE IF NOT EXISTS clinic_targets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  month DATE NOT NULL UNIQUE, -- The first day of the month
  target_patients INTEGER DEFAULT 0,
  target_income INTEGER DEFAULT 0,
  target_sns_tasks INTEGER DEFAULT 0,
  target_new_patients INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Monthly Evaluations Table
CREATE TABLE IF NOT EXISTS monthly_evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  month DATE NOT NULL UNIQUE, -- The first day of the month
  actual_patients INTEGER DEFAULT 0,
  actual_income INTEGER DEFAULT 0,
  actual_sns_tasks INTEGER DEFAULT 0,
  actual_new_patients INTEGER DEFAULT 0,
  google_review_count INTEGER DEFAULT 0,
  google_rating DECIMAL(3,2) DEFAULT 0,
  self_evaluation TEXT,
  ai_suggestions TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily Tasks Table
CREATE TABLE IF NOT EXISTS daily_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, completed
  time_spent_minutes INTEGER,
  estimated_minutes INTEGER,
  task_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE clinic_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;

-- Simple policies (Admins only)
CREATE POLICY "Admins can do everything on clinic_targets" ON clinic_targets
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Admins can do everything on monthly_evaluations" ON monthly_evaluations
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Admins can do everything on daily_tasks" ON daily_tasks
  FOR ALL TO authenticated USING (true);
