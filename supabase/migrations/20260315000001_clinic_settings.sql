create table if not exists public.clinic_settings (
  id uuid default gen_random_uuid() primary key,
  clinic_name text not null default 'ボール接骨院',
  hero_title text not null default '痛みの根本から改善し、動きやすい体へ',
  primary_color text not null default 'blue',
  max_beds integer not null default 1,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Row Level Security
alter table public.clinic_settings enable row level security;

create policy "Settings are viewable by everyone"
  on public.clinic_settings for select
  using (true);

create policy "Settings can be updated by authenticated users"
  on public.clinic_settings for update
  using (auth.role() = 'authenticated');

create policy "Settings can be inserted by authenticated users"
  on public.clinic_settings for insert
  with check (auth.role() = 'authenticated');

-- Insert default row if not exists
insert into public.clinic_settings (id, clinic_name)
select '00000000-0000-0000-0000-000000000001', 'ボール接骨院'
where not exists (select 1 from public.clinic_settings limit 1);
