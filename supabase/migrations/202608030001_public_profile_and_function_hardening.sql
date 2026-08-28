-- Keep private account data in profiles and expose only these sanitized fields.
alter table public.public_profiles
  add column if not exists brand_name text,
  add column if not exists logo_url text,
  add column if not exists primary_color text not null default '#8B5CF6',
  add column if not exists secondary_color text not null default '#050505',
  add column if not exists services text[] not null default '{}',
  add column if not exists targets text[] not null default '{}',
  add column if not exists background_color text not null default '#07080d';

drop policy if exists "PublicProfiles: INSERT own" on public.public_profiles;
create policy "PublicProfiles: INSERT own"
  on public.public_profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

alter function public.handle_new_user() set search_path = pg_catalog, public;
alter function public.update_updated_at_column() set search_path = pg_catalog;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.update_updated_at_column() from public, anon, authenticated;
