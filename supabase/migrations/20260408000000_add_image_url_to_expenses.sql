-- clinic_expenses テーブルに画像URL保存用のカラムを追加
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'clinic_expenses' 
        AND column_name = 'image_url'
    ) THEN
        ALTER TABLE clinic_expenses ADD COLUMN image_url TEXT;
    END IF;
END $$;
