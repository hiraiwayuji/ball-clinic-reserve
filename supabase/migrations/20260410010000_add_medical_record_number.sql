-- Add medical_record_number to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS medical_record_number text;

-- Add index for search optimization
CREATE INDEX IF NOT EXISTS idx_customers_medical_record_number 
ON public.customers (clinic_id, medical_record_number);

-- Add comment
COMMENT ON COLUMN public.customers.medical_record_number IS '院内でのカルテ番号（整理用）';
