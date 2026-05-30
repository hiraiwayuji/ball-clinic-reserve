-- カフェ等の席種ごとの在庫数＋個室の予約条件。全院共通・後方互換の列追加のみ。
-- 既存メニューは inventory_count=NULL（制限なし）で従来通り動く。

ALTER TABLE reservation_courses
  ADD COLUMN IF NOT EXISTS inventory_count INT;            -- 席種の在庫(同時に取れる卓/席数)。NULL=制限なし
ALTER TABLE reservation_courses
  ADD COLUMN IF NOT EXISTS min_party_size INT;             -- 最低人数(個室=5)。NULL=制限なし
ALTER TABLE reservation_courses
  ADD COLUMN IF NOT EXISTS allow_children_exception BOOLEAN NOT NULL DEFAULT false; -- 子連れなら最低人数免除(個室=true)
