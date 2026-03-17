-- Add birth_month and line_user_id to customers table

ALTER TABLE public.customers 
ADD COLUMN birth_month integer CHECK (birth_month >= 1 AND birth_month <= 12),
ADD COLUMN line_user_id text;

-- Add a comment to the table columns for clarity
COMMENT ON COLUMN public.customers.birth_month IS '1-12 representing the birth month to send birthday coupons';
COMMENT ON COLUMN public.customers.line_user_id IS 'LINE User ID for sending automated messages';
