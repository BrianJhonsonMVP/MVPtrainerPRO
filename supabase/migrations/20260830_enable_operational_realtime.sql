-- Operational screens rely on these changes to stay synchronized across tabs
-- and devices. The migration is idempotent so it is safe in existing projects.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['clients', 'routines', 'diets', 'billing_records']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end
$$;
