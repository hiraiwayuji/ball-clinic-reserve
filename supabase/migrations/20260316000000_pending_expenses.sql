-- Pending Expenses for triage flow
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pending_expense_status') THEN
        CREATE TYPE pending_expense_status AS ENUM ('unprocessed', 'confirmed', 'on_hold');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS pending_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url TEXT,
    status pending_expense_status NOT NULL DEFAULT 'unprocessed',
    expense_date DATE,
    category TEXT,
    description TEXT,
    amount INTEGER,
    memo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE pending_expenses ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can do everything on pending_expenses" ON pending_expenses
  FOR ALL TO authenticated USING (true);
