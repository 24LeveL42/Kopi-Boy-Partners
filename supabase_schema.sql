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

-- KOPI BOY LIVE V8 — CUSTOMER / COOK / RIDER ORDER FLOW
create extension if not exists pgcrypto;

create table if not exists public.merchants (
  id text primary key,
  name text not null,
  type text,
  rating numeric default 0,
  reviews integer default 0,
  avatar text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.riders (
  id text primary key,
  name text not null,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  merchant_id text not null references public.merchants(id),
  customer_name text,
  rider_id text references public.riders(id),
  rider_name text,
  status text not null default 'placed' check (status in (
    'placed','accepted','declined','looking_for_rider','rider_accepted',
    'cooking','ready','out_for_delivery','delivered','cancelled'
  )),
  subtotal numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  accepted_at timestamptz,
  declined_at timestamptz,
  rider_requested_at timestamptz,
  rider_accepted_at timestamptz,
  cooking_at timestamptz,
  ready_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz
);

insert into public.merchants(id,name,type,rating,reviews,avatar) values
('mak-cik-siti','Mak Cik Siti','Nasi Lemak · Malay Food',4.9,128,'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=180&q=85'),
('ah-ma-kitchen','Ah Ma Kitchen','Chinese · Home Cooked',4.8,96,'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=180&q=85'),
('dapur-kak-leha','Dapur Kak Leha','Malay · Mixing Food',4.9,74,'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=180&q=85'),
('uncle-mans-kitchen','Uncle Man''s Kitchen','Asian Favorites',4.7,58,'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=180&q=85')
on conflict (id) do nothing;

insert into public.riders(id,name,phone,active) values
('rider-brother','Brother Rider',null,true)
on conflict (id) do nothing;

alter table public.merchants enable row level security;
alter table public.riders enable row level security;
alter table public.orders enable row level security;

drop policy if exists "public can read merchants" on public.merchants;
drop policy if exists "public can read riders" on public.riders;
drop policy if exists "public can create orders" on public.orders;
drop policy if exists "public can read orders" on public.orders;
drop policy if exists "public can update orders" on public.orders;

create policy "public can read merchants" on public.merchants for select to anon, authenticated using (active = true);
create policy "public can read riders" on public.riders for select to anon, authenticated using (active = true);
create policy "public can create orders" on public.orders for insert to anon, authenticated with check (true);
create policy "public can read orders" on public.orders for select to anon, authenticated using (true);
create policy "public can update orders" on public.orders for update to anon, authenticated using (true) with check (true);

grant select on public.merchants to anon, authenticated;
grant select on public.riders to anon, authenticated;
grant select, insert, update on public.orders to anon, authenticated;

alter publication supabase_realtime add table public.orders;

create or replace function public.set_order_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders
for each row execute function public.set_order_updated_at();
