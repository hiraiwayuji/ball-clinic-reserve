-- customers.line_display_name: LINE プロフィールの表示名キャッシュ
-- bot/profile から取得して保存。display_name(あだ名/予約表示名) とは別物。
alter table customers add column if not exists line_display_name text;
comment on column customers.line_display_name is 'LINE プロフィールの表示名（bot/profile から取得・キャッシュ）。display_name(あだ名)とは別物。';
