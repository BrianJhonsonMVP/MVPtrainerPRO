-- MVP Trainer Pro testing helpers.
-- Do not run this in production.

-- Reset only historical Free limits by trainer email.
with target_trainer as (
  select id
  from public.profiles
  where lower(email) = lower('brian_wcmu23@outlook.com')
)
update public.trainer_usage
set
  clients_created_total = 0,
  ai_routines_generated_total = 0,
  ai_diets_generated_total = 0,
  updated_at = now()
where trainer_id in (select id from target_trainer)
returning *;

-- Full beta-test reset by trainer email.
-- Use this when a test account must look empty again:
-- - soft-deletes active clients, matching the app's production behavior
-- - deletes generated routines and diets for that trainer
-- - deletes payments only if a payments table exists in the real database
-- - resets historical Free counters to zero
-- Change target_email before running for a different trainer.
create temp table if not exists pg_temp.mvp_reset_result (
  email text,
  trainers_found integer,
  clients_archived integer,
  routines_deleted integer,
  diets_deleted integer,
  payments_deleted integer,
  active_clients_after integer,
  routines_after integer,
  diets_after integer,
  clients_created_total integer,
  ai_routines_generated_total integer,
  ai_diets_generated_total integer,
  note text
) on commit preserve rows;

truncate table pg_temp.mvp_reset_result;

do $$
declare
  target_email text := 'brian_wcmu23@outlook.com';
  target_ids uuid[];
  trainers_found integer := 0;
  clients_archived integer := 0;
  routines_deleted integer := 0;
  diets_deleted integer := 0;
  payments_deleted integer := 0;
  active_clients_after integer := 0;
  routines_after integer := 0;
  diets_after integer := 0;
  usage_clients integer := 0;
  usage_routines integer := 0;
  usage_diets integer := 0;
begin
  select array_agg(distinct id)
  into target_ids
  from (
    select p.id
    from public.profiles p
    where lower(p.email) = lower(target_email)

    union

    select u.id
    from auth.users u
    where lower(u.email) = lower(target_email)
  ) trainer;

  trainers_found := coalesce(array_length(target_ids, 1), 0);
  if trainers_found = 0 then
    raise exception 'No trainer found for email %', target_email;
  end if;

  create temp table if not exists pg_temp.mvp_reset_target_clients (
    id uuid primary key
  ) on commit drop;

  truncate table pg_temp.mvp_reset_target_clients;

  insert into pg_temp.mvp_reset_target_clients (id)
  select c.id
  from public.clients c
  where c.trainer_id = any(target_ids);

  if to_regclass('public.payments') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'payments' and column_name = 'trainer_id'
    ) then
      execute 'delete from public.payments where trainer_id = any($1)' using target_ids;
      get diagnostics payments_deleted = row_count;
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'payments' and column_name = 'client_id'
    ) then
      execute 'delete from public.payments where client_id in (select id from pg_temp.mvp_reset_target_clients)';
      get diagnostics payments_deleted = row_count;
    end if;
  end if;

  if to_regclass('public.routines') is not null then
    delete from public.routines
    where trainer_id = any(target_ids)
       or client_id in (select id from pg_temp.mvp_reset_target_clients);
    get diagnostics routines_deleted = row_count;
  end if;

  if to_regclass('public.diets') is not null then
    delete from public.diets
    where trainer_id = any(target_ids)
       or client_id in (select id from pg_temp.mvp_reset_target_clients);
    get diagnostics diets_deleted = row_count;
  end if;

  update public.clients
  set
    deleted_at = coalesce(deleted_at, now()),
    updated_at = now()
  where trainer_id = any(target_ids)
    and deleted_at is null;
  get diagnostics clients_archived = row_count;

  insert into public.trainer_usage (
    trainer_id,
    clients_created_total,
    ai_routines_generated_total,
    ai_diets_generated_total,
    created_at,
    updated_at
  )
  select id, 0, 0, 0, now(), now()
  from unnest(target_ids) as t(id)
  on conflict (trainer_id) do nothing;

  update public.trainer_usage
  set
    clients_created_total = 0,
    ai_routines_generated_total = 0,
    ai_diets_generated_total = 0,
    updated_at = now()
  where trainer_id = any(target_ids);

  select count(*) into active_clients_after
  from public.clients
  where trainer_id = any(target_ids)
    and deleted_at is null;

  select count(*) into routines_after
  from public.routines
  where trainer_id = any(target_ids)
     or client_id in (select id from pg_temp.mvp_reset_target_clients);

  select count(*) into diets_after
  from public.diets
  where trainer_id = any(target_ids)
     or client_id in (select id from pg_temp.mvp_reset_target_clients);

  select
    coalesce(max(clients_created_total), 0),
    coalesce(max(ai_routines_generated_total), 0),
    coalesce(max(ai_diets_generated_total), 0)
  into usage_clients, usage_routines, usage_diets
  from public.trainer_usage
  where trainer_id = any(target_ids);

  insert into pg_temp.mvp_reset_result values (
    target_email,
    trainers_found,
    clients_archived,
    routines_deleted,
    diets_deleted,
    payments_deleted,
    active_clients_after,
    routines_after,
    diets_after,
    usage_clients,
    usage_routines,
    usage_diets,
    'Reset completed. Clients are soft-deleted, routines/diets are deleted, historical counters are zero.'
  );
end $$;

select * from pg_temp.mvp_reset_result;
