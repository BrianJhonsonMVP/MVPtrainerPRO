create table if not exists public.public_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  slug text unique,
  professional_title text,
  description text,
  avatar_url text,
  whatsapp_number text,
  cta_text text not null default 'WhatsApp',
  is_published boolean not null default false,
  brand_name text,
  logo_url text,
  primary_color text not null default '#8B5CF6',
  secondary_color text not null default '#050505',
  services text[] not null default '{}',
  targets text[] not null default '{}',
  background_color text not null default '#07080d',
  modality text not null default 'ambas' check (modality in ('presencial', 'online', 'ambas')),
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.public_profiles
  add column if not exists modality text not null default 'ambas',
  add column if not exists location text;

-- Draft profiles may be incomplete until the trainer is ready to publish.
alter table public.public_profiles
  alter column professional_title drop not null,
  alter column description drop not null,
  alter column avatar_url drop not null,
  alter column whatsapp_number drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.public_profiles'::regclass
      and conname = 'public_profiles_modality_check'
  ) then
    alter table public.public_profiles
      add constraint public_profiles_modality_check
      check (modality in ('presencial', 'online', 'ambas'));
  end if;
end $$;

alter table public.public_profiles enable row level security;

revoke all on table public.public_profiles from anon, authenticated;
grant select on table public.public_profiles to anon;
grant select, insert, update, delete on table public.public_profiles to authenticated;

drop policy if exists "PublicProfiles: SELECT published" on public.public_profiles;
drop policy if exists "PublicProfiles: INSERT own" on public.public_profiles;
drop policy if exists "PublicProfiles: UPDATE own" on public.public_profiles;
drop policy if exists "PublicProfiles: DELETE own" on public.public_profiles;
drop policy if exists "PublicProfiles: public read published" on public.public_profiles;
create policy "PublicProfiles: public read published"
  on public.public_profiles for select
  to anon, authenticated
  using (is_published = true or (select auth.uid()) = id);

drop policy if exists "PublicProfiles: insert own" on public.public_profiles;
create policy "PublicProfiles: insert own"
  on public.public_profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "PublicProfiles: update own" on public.public_profiles;
create policy "PublicProfiles: update own"
  on public.public_profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "PublicProfiles: delete own" on public.public_profiles;
create policy "PublicProfiles: delete own"
  on public.public_profiles for delete
  to authenticated
  using ((select auth.uid()) = id);

create index if not exists public_profiles_published_slug_idx
  on public.public_profiles (slug)
  where is_published = true;
