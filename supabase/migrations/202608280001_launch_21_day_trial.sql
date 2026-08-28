-- Every new trainer receives one server-controlled 21-day trial.
-- Existing PRO subscriptions remain untouched.

create unique index if not exists subscriptions_one_internal_trial_per_user
  on public.subscriptions (user_id)
  where provider = 'internal' and plan_type = 'trial';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');

  insert into public.public_profiles (
    id,
    slug,
    professional_title,
    description,
    avatar_url,
    whatsapp_number
  ) values (
    new.id,
    lower(split_part(new.email, '@', 1) || '-' || substr(md5(new.id::text), 1, 5)),
    'Entrenador Personal',
    'Bienvenido a mi perfil profesional.',
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    ''
  );

  insert into public.subscriptions (
    user_id,
    provider,
    plan_type,
    billing_interval,
    status,
    current_period_start,
    current_period_end,
    trial_ends_at,
    metadata
  ) values (
    new.id,
    'internal',
    'trial',
    'monthly',
    'trialing',
    now(),
    now() + interval '21 days',
    now() + interval '21 days',
    jsonb_build_object('source', 'signup_trial', 'duration_days', 21)
  );

  return new;
end;
$function$;

-- Give pre-launch Free accounts their one trial without altering existing PRO users.
insert into public.subscriptions (
  user_id,
  provider,
  plan_type,
  billing_interval,
  status,
  current_period_start,
  current_period_end,
  trial_ends_at,
  metadata
)
select
  profile.id,
  'internal',
  'trial',
  'monthly',
  'trialing',
  now(),
  now() + interval '21 days',
  now() + interval '21 days',
  jsonb_build_object('source', 'launch_backfill', 'duration_days', 21)
from public.profiles as profile
where profile.plan_type = 'free'
  and not exists (
    select 1
    from public.subscriptions as subscription
    where subscription.user_id = profile.id
  )
on conflict do nothing;
