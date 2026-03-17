-- 顧客テーブル
create table public.customers (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  phone text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 予約テーブル
create table public.appointments (
  id uuid default gen_random_uuid() primary key,
  customer_id uuid references public.customers(id) not null,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone not null,
  status text not null default 'pending', -- pending, confirmed, cancelled
  memo text,
  is_first_visit boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS (Row Level Security) の設定
alter table public.customers enable row level security;
alter table public.appointments enable row level security;

-- 誰でも予約は作成できる（INSERT）
create policy "Anyone can insert customers" on public.customers for insert with check (true);
create policy "Anyone can insert appointments" on public.appointments for insert with check (true);

-- 管理者のみが閲覧・更新・削除できるポリシー（簡易的に認証済みユーザー全許可とする構成）
create policy "Authenticated users can select customers" on public.customers for select using (auth.role() = 'authenticated');
create policy "Authenticated users can update customers" on public.customers for update using (auth.role() = 'authenticated');
create policy "Authenticated users can select appointments" on public.appointments for select using (auth.role() = 'authenticated');
create policy "Authenticated users can update appointments" on public.appointments for update using (auth.role() = 'authenticated');
