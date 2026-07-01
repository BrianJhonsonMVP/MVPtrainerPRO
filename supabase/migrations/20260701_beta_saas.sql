-- MVP Trainer Pro beta SaaS schema/RLS reference.
-- Run in Supabase SQL editor if any table, column, index, or policy is missing.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  subscription_type text not null default 'trial' check (subscription_type in ('trial', 'free', 'pro')),
  is_active boolean not null default true,
  account_status text not null default 'active',
  billing_interval text,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  branding jsonb,
  public_profile jsonb,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  sex text,
  birth_date date,
  weight_kg numeric,
  height_cm numeric,
  activity_level text,
  goal text,
  payment_amount numeric not null default 0,
  payment_day integer,
  billing_frequency text not null default 'monthly',
  notes text,
  avatar_url text,
  status text not null default 'active',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  version integer not null default 1,
  source text not null default 'manual',
  content jsonb not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.diets (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  version integer not null default 1,
  source text not null default 'manual',
  content jsonb not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trainer_usage (
  trainer_id uuid primary key references auth.users(id) on delete cascade,
  clients_created_total integer not null default 0,
  ai_routines_generated_total integer not null default 0,
  ai_diets_generated_total integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  amount numeric not null default 0,
  status text not null default 'pending',
  payment_method text,
  paid_at timestamptz,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_trainer_active_idx on public.clients(trainer_id, deleted_at);
create index if not exists routines_trainer_client_idx on public.routines(trainer_id, client_id);
create index if not exists diets_trainer_client_idx on public.diets(trainer_id, client_id);
create index if not exists payments_trainer_client_idx on public.payments(trainer_id, client_id);

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.routines enable row level security;
alter table public.diets enable row level security;
alter table public.trainer_usage enable row level security;
alter table public.payments enable row level security;

drop policy if exists "profiles own read" on public.profiles;
create policy "profiles own read" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles own insert" on public.profiles;
create policy "profiles own insert" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "clients own all" on public.clients;
create policy "clients own all" on public.clients for all using (auth.uid() = trainer_id) with check (auth.uid() = trainer_id);

drop policy if exists "routines own all" on public.routines;
create policy "routines own all" on public.routines for all using (auth.uid() = trainer_id) with check (auth.uid() = trainer_id);

drop policy if exists "diets own all" on public.diets;
create policy "diets own all" on public.diets for all using (auth.uid() = trainer_id) with check (auth.uid() = trainer_id);

drop policy if exists "trainer_usage own all" on public.trainer_usage;
create policy "trainer_usage own all" on public.trainer_usage for all using (auth.uid() = trainer_id) with check (auth.uid() = trainer_id);

drop policy if exists "payments own all" on public.payments;
create policy "payments own all" on public.payments for all using (auth.uid() = trainer_id) with check (auth.uid() = trainer_id);
