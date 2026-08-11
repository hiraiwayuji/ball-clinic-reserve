-- 通帳読み取り（/admin/passbook）の取込済み記録
-- 同じ通帳ページを何度読み込んでも二重登録しないための台帳。
-- 取り込んだ行・対象外にした行だけがここに入る（読み取っただけの行は入らない）。
create table if not exists public.passbook_entries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinic_settings(id) on delete cascade,
  entry_date date not null,
  description text not null default '',
  deposit integer not null default 0,
  withdrawal integer not null default 0,
  balance integer,
  -- insurance: 保険入金 / expense: 経費 / income: その他収入 / ignore: 対象外
  kind text not null,
  linked_expense_id uuid,
  linked_insurance_id uuid,
  image_url text,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  constraint passbook_entries_kind_check
    check (kind in ('insurance', 'expense', 'income', 'ignore'))
);

create unique index if not exists passbook_entries_clinic_dedupe_idx
  on public.passbook_entries (clinic_id, dedupe_key);

create index if not exists passbook_entries_clinic_date_idx
  on public.passbook_entries (clinic_id, entry_date desc);

alter table public.passbook_entries enable row level security;

drop policy if exists "passbook_entries_authenticated" on public.passbook_entries;
create policy "passbook_entries_authenticated" on public.passbook_entries
  for all to authenticated using (true) with check (true);
