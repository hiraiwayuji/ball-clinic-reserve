-- 患者向けメニュー画面の「見出し分け」と「おすすめ」（2026-09-14）
--
-- 背景: からだ鍼灸整骨院の予約メニューが29件あり、1列に並んでいて選びにくい。
-- 「おすすめ／セットメニュー／鍼灸 など」に分けてほしいという要望。
--
-- menu_group は表示用の見出し。集計用の category（柔整/鍼灸/整体。ダッシュボードの
-- 達成率マトリクスで使う）とは別物なので、category を流用しない。
-- どちらも未設定の院は、これまでどおり見出しなしの一覧で表示される。
--
-- ※ この共有Supabaseは手動スキーマ管理。2026-09-14 に本番へ適用済み。

ALTER TABLE reservation_courses ADD COLUMN IF NOT EXISTS menu_group text;
ALTER TABLE reservation_courses ADD COLUMN IF NOT EXISTS is_recommended boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN reservation_courses.menu_group IS '患者向けメニュー画面での見出し（例: 鍼灸 / 整体・マッサージ / セットメニュー）。NULLなら見出しなし。集計用の category とは別物';
COMMENT ON COLUMN reservation_courses.is_recommended IS '患者向けメニュー画面の先頭「おすすめ」に表示する';
