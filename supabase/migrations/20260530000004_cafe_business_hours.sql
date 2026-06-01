-- カフェ部門の営業時間（サロンとは別営業時間）。全院共通・後方互換の列追加のみ。
-- NULL の院はカフェ予約フローを使わない（従来通り）。
-- 構造（JSONB）:
--   {
--     "lunch":  { "start": "11:00", "end": "15:00", "days": [1,2,3,4,5,6] },
--     "dinner": { "start": "18:00", "end": "22:00", "days": [5,6] }
--   }
--   days = JS getDay()（0=日,1=月,...,6=土）。配列が無い帯はその院では提供しない。

ALTER TABLE clinic_settings
  ADD COLUMN IF NOT EXISTS cafe_business_hours JSONB;

-- AILUS（KUKUNA CAFE）の初期値: ランチ 月〜土 11:00-15:00 / ディナー 金・土 18:00-22:00
-- ※ 日曜のカフェ営業はサロン定休に合わせ一旦除外（ぼーるくん確認後に調整可）。
UPDATE clinic_settings
SET cafe_business_hours = '{
  "lunch":  { "start": "11:00", "end": "15:00", "days": [1,2,3,4,5,6] },
  "dinner": { "start": "18:00", "end": "22:00", "days": [5,6] }
}'::jsonb
WHERE id = '93765017-5553-4d91-9180-9a21095a392a';
