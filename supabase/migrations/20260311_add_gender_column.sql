-- Migration to add 'gender' column to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS gender text;
