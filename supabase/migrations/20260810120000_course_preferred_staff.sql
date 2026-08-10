-- メニューの「優先担当」。
-- required_staff_id（その人しかできないメニュー）とは別物で、患者には見せない。
-- 患者が担当を選べない院（からだ鍼灸整骨院）で、院側が担当を自動割り当てするときの
-- 優先順位に使う。優先の先生がその日休み・その時間が埋まっている場合は他の先生に回る。
alter table public.reservation_courses
  add column if not exists preferred_staff_id uuid references public.reservation_staff(id) on delete set null;

comment on column public.reservation_courses.preferred_staff_id is
  '優先担当（患者非公開）。自動割り当てでこの先生を最優先にする。空いていなければ他の先生に回る。';
