-- Daily Cash Sales (at reception)
CREATE TABLE IF NOT EXISTS cash_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    customer_name TEXT NOT NULL,
    treatment_fee INTEGER NOT NULL,
    memo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Monthly Insurance Payments (from notification letters)
CREATE TABLE IF NOT EXISTS insurance_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_month DATE NOT NULL, -- The first day of the month for which the payment is for
    insurance_name TEXT NOT NULL,  -- e.g., "Kyokai Kenpo", "National Health Insurance"
    amount INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE cash_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_payments ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can do everything on cash_sales" ON cash_sales
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Admins can do everything on insurance_payments" ON insurance_payments
  FOR ALL TO authenticated USING (true);
