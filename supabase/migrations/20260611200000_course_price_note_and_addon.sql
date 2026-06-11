-- メニューの価格を「幅表記」できる自由記入欄（保険施術など負担割合で金額が変わるメニュー向け）。
-- price_note があれば、患者向け表示は数値 price の代わりにこの文字列をそのまま出す。
alter table public.reservation_courses
  add column if not exists price_note text;

-- 予約時に「一緒に追加できるメニュー」として提案するか（ボールの水素のような同時追加を汎用化）。
-- true のコースは、別メニュー予約時に「＋追加しますか？」の候補として出る。
alter table public.reservation_courses
  add column if not exists is_bookable_addon boolean not null default false;
