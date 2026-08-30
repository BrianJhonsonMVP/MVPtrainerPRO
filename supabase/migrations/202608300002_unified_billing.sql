-- Provider-neutral subscription state for web, App Store and Google Play.
-- The client can read its entitlement, but only trusted server code may mutate it.

create extension if not exists pgcrypto;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'internal',
  plan_type text not null,
  billing_interval text not null,
  status text not null,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  trial_ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions add column if not exists external_customer_id text;
alter table public.subscriptions add column if not exists external_subscription_id text;
alter table public.subscriptions add column if not exists external_product_id text;
alter table public.subscriptions add column if not exists external_price_id text;

-- Preserve legacy Stripe references when upgrading an existing database. Each
-- column check keeps this migration reproducible on a clean installation too.
do $migration$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'stripe_customer_id'
  ) then
    execute 'update public.subscriptions set external_customer_id = coalesce(external_customer_id, stripe_customer_id) where provider = ''stripe''';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'stripe_subscription_id'
  ) then
    execute 'update public.subscriptions set external_subscription_id = coalesce(external_subscription_id, stripe_subscription_id) where provider = ''stripe''';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'stripe_product_id'
  ) then
    execute 'update public.subscriptions set external_product_id = coalesce(external_product_id, stripe_product_id) where provider = ''stripe''';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'stripe_price_id'
  ) then
    execute 'update public.subscriptions set external_price_id = coalesce(external_price_id, stripe_price_id) where provider = ''stripe''';
  end if;
end
$migration$;

alter table public.subscriptions drop constraint if exists subscriptions_provider_check;
alter table public.subscriptions
  add constraint subscriptions_provider_check
  check (provider in ('internal', 'mercadopago', 'apple', 'google', 'stripe', 'manual')) not valid;
alter table public.subscriptions validate constraint subscriptions_provider_check;

alter table public.subscriptions drop constraint if exists subscriptions_plan_type_check;
alter table public.subscriptions
  add constraint subscriptions_plan_type_check
  check (plan_type in ('trial', 'free', 'pro')) not valid;
alter table public.subscriptions validate constraint subscriptions_plan_type_check;

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired', 'free', 'inactive')) not valid;
alter table public.subscriptions validate constraint subscriptions_status_check;

create unique index if not exists subscriptions_provider_external_unique
  on public.subscriptions (provider, external_subscription_id)
  where external_subscription_id is not null;
create index if not exists subscriptions_user_updated_idx
  on public.subscriptions (user_id, updated_at desc);
create index if not exists subscriptions_active_period_idx
  on public.subscriptions (user_id, current_period_end desc)
  where status in ('trialing', 'active');

create table if not exists public.billing_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  user_id uuid references public.profiles(id) on delete set null,
  external_subscription_id text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists billing_provider_events_user_idx
  on public.billing_provider_events (user_id, created_at desc);
create index if not exists billing_provider_events_unprocessed_idx
  on public.billing_provider_events (created_at)
  where processed_at is null;

alter table public.subscriptions enable row level security;
alter table public.billing_provider_events enable row level security;

drop policy if exists "Subscriptions: SELECT own" on public.subscriptions;
drop policy if exists "subscriptions own read" on public.subscriptions;
create policy "Subscriptions: SELECT own"
  on public.subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- No client policy is intentionally created for billing_provider_events.
-- Edge Functions use the service role and the browser cannot read raw provider payloads.
revoke all on public.billing_provider_events from anon, authenticated;
grant select on public.subscriptions to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();
