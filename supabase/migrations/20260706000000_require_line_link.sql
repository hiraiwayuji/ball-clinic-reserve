-- Web予約のLINE連携必須（院ごとの運用モード設定）
-- ON の院では、LINE未連携の患者は「友だち追加＋電話番号下4桁の送信」で連携が
-- 確認できるまで仮予約（キャンセル待ち含む）が完了しない。
-- 仮予約がNGだった時に院から連絡できない事故を防ぐ。既定 false（従来挙動）。
ALTER TABLE public.clinic_settings
ADD COLUMN IF NOT EXISTS require_line_link BOOLEAN NOT NULL DEFAULT false;
