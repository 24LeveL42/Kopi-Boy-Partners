alter table public.merchants
  add column if not exists service_area text,
  add column if not exists service_postal_codes text,
  add column if not exists sfa_licensed boolean default false,
  add column if not exists sfa_licence_type text,
  add column if not exists sfa_licence_number text,
  add column if not exists sfa_licence_expiry date;

alter table public.cook_applications
  add column if not exists service_area text,
  add column if not exists service_postal_codes text,
  add column if not exists sfa_licensed boolean default false,
  add column if not exists sfa_licence_type text,
  add column if not exists sfa_licence_number text,
  add column if not exists sfa_licence_expiry date,
  add column if not exists sfa_document_name text,
  add column if not exists compliance_ack boolean not null default false,
  add column if not exists compliance_ack_version text,
  add column if not exists compliance_ack_at timestamptz;

alter table public.rider_applications
  add column if not exists compliance_ack boolean not null default false,
  add column if not exists compliance_ack_version text,
  add column if not exists compliance_ack_at timestamptz,
  add column if not exists eligibility_ack boolean not null default false,
  add column if not exists eligibility_ack_at timestamptz;

alter table public.riders
  add column if not exists compliance_ack boolean not null default false,
  add column if not exists compliance_ack_version text,
  add column if not exists compliance_ack_at timestamptz,
  add column if not exists eligibility_ack boolean not null default false,
  add column if not exists eligibility_ack_at timestamptz;

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  label text not null default 'Home',
  block text not null,
  street text not null,
  unit_no text,
  building text,
  postal_code text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists delivery_address text,
  add column if not exists delivery_postal_code text,
  add column if not exists delivery_notes text;

alter table public.customer_addresses enable row level security;
drop policy if exists "public can manage customer addresses" on public.customer_addresses;
create policy "public can manage customer addresses" on public.customer_addresses for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.customer_addresses to anon, authenticated;

-- KOPI BOY V9 — CLEAN ONBOARDING / APPROVAL / MENUS
-- Run this AFTER the existing V8 schema in the current kopi-boy Supabase project.

alter table public.merchants
  add column if not exists status text not null default 'approved',
  add column if not exists phone text,
  add column if not exists bio text,
  add column if not exists operating_start text,
  add column if not exists operating_end text,
  add column if not exists daily_capacity integer,
  add column if not exists order_open text,
  add column if not exists order_close text,
  add column if not exists menu_live boolean not null default true,
  add column if not exists menu_note text;

alter table public.riders
  add column if not exists status text not null default 'approved',
  add column if not exists vehicle_type text,
  add column if not exists operating_area text;

create table if not exists public.cook_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  display_name text not null,
  phone text not null,
  food_type text,
  bio text,
  operating_start text,
  operating_end text,
  daily_capacity integer,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  merchant_id text,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.rider_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  vehicle_type text,
  operating_area text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  rider_id text,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references public.merchants(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) not null default 0,
  pax_available integer not null default 0,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.cook_applications enable row level security;
alter table public.rider_applications enable row level security;
alter table public.menu_items enable row level security;

drop policy if exists "public can submit cook applications" on public.cook_applications;
drop policy if exists "public can manage cook applications" on public.cook_applications;
drop policy if exists "public can submit rider applications" on public.rider_applications;
drop policy if exists "public can manage rider applications" on public.rider_applications;
drop policy if exists "public can read menu items" on public.menu_items;
drop policy if exists "public can manage menu items" on public.menu_items;
drop policy if exists "public can read approved merchants" on public.merchants;
drop policy if exists "public can read approved riders" on public.riders;

create policy "public can submit cook applications" on public.cook_applications
  for insert to anon, authenticated with check (status='pending');

create policy "public can manage cook applications" on public.cook_applications
  for select, update to anon, authenticated using (true) with check (true);

create policy "public can submit rider applications" on public.rider_applications
  for insert to anon, authenticated with check (status='pending');

create policy "public can manage rider applications" on public.rider_applications
  for select, update to anon, authenticated using (true) with check (true);

create policy "public can read menu items" on public.menu_items
  for select to anon, authenticated using (active=true);

create policy "public can manage menu items" on public.menu_items
  for insert, update, delete to anon, authenticated using (true) with check (true);

create policy "public can read approved merchants" on public.merchants
  for select to anon, authenticated using (active=true and status='approved');

create policy "public can read approved riders" on public.riders
  for select to anon, authenticated using (active=true and status='approved');

grant select, insert, update on public.cook_applications to anon, authenticated;
grant select, insert, update on public.rider_applications to anon, authenticated;
grant select, insert, update, delete on public.menu_items to anon, authenticated;
grant select on public.merchants to anon, authenticated;
grant select on public.riders to anon, authenticated;

insert into storage.buckets (id,name,public)
values ('kopi-boy-menu','kopi-boy-menu',true)
on conflict (id) do nothing;

drop policy if exists "public can upload Kopi Boy menu photos" on storage.objects;
drop policy if exists "public can read Kopi Boy menu photos" on storage.objects;
create policy "public can upload Kopi Boy menu photos" on storage.objects
  for insert to anon, authenticated with check (bucket_id='kopi-boy-menu');

create policy "public can read Kopi Boy menu photos" on storage.objects
  for select to anon, authenticated using (bucket_id='kopi-boy-menu');

alter publication supabase_realtime add table public.merchants;
alter publication supabase_realtime add table public.riders;
alter publication supabase_realtime add table public.cook_applications;
alter publication supabase_realtime add table public.rider_applications;
alter publication supabase_realtime add table public.menu_items;
