ALTER TABLE customers ADD COLUMN IF NOT EXISTS booking_suspended boolean DEFAULT false;
