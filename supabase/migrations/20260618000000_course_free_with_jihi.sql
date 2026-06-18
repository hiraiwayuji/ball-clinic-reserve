-- 「実費施術とセットのときは無料」コースフラグ（ボールの水素のような付帯サービス向け）。
-- true のコースは、同じ患者が同日に実費施術（部分施術・トレーニング・小中高実費 等）を受けていて
-- 保険施術が無いとき、一括売上入力で自動的に「¥0（無料）」を提案する。
-- 保険施術の人は通常料金（水素なら¥500）。受付で「未来院」にせず、無料の記録だけ残せるようにするのが狙い。
alter table public.reservation_courses
  add column if not exists free_with_jihi boolean not null default false;

comment on column public.reservation_courses.free_with_jihi is
  '実費施術とセットなら無料にする付帯メニュー（保険施術のときは通常料金）。一括売上で¥0を自動提案。';
