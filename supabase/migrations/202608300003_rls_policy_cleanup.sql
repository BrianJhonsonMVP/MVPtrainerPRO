-- Consolidate legacy duplicate policies and evaluate auth.uid() once per query.

drop policy if exists "Checkins: INSERT own" on public.client_checkins;
drop policy if exists "Checkins: SELECT own" on public.client_checkins;
drop policy if exists "Checkins: UPDATE own" on public.client_checkins;
drop policy if exists "Checkins: ALL own" on public.client_checkins;
create policy "Checkins: ALL own" on public.client_checkins
  for all to authenticated
  using ((select auth.uid()) = trainer_id)
  with check ((select auth.uid()) = trainer_id);

drop policy if exists "Diets: INSERT own" on public.diets;
drop policy if exists "Diets: SELECT own" on public.diets;
drop policy if exists "Diets: UPDATE own" on public.diets;
drop policy if exists "Diets: ALL own" on public.diets;
create policy "Diets: ALL own" on public.diets
  for all to authenticated
  using ((select auth.uid()) = trainer_id)
  with check ((select auth.uid()) = trainer_id);

drop policy if exists "Routines: INSERT own" on public.routines;
drop policy if exists "Routines: SELECT own" on public.routines;
drop policy if exists "Routines: UPDATE own" on public.routines;
drop policy if exists "Routines: ALL own" on public.routines;
create policy "Routines: ALL own" on public.routines
  for all to authenticated
  using ((select auth.uid()) = trainer_id)
  with check ((select auth.uid()) = trainer_id);

drop policy if exists "Trainers can view their own clients" on public.clients;
drop policy if exists "Trainers can insert their own clients" on public.clients;
drop policy if exists "Trainers can update their own clients" on public.clients;
drop policy if exists "Trainers can delete their own clients" on public.clients;
drop policy if exists "Trainers can delete own clients" on public.clients;
drop policy if exists "Clients: SELECT own" on public.clients;
drop policy if exists "Clients: INSERT own" on public.clients;
drop policy if exists "Clients: UPDATE own" on public.clients;
create policy "Clients: SELECT own" on public.clients for select to authenticated
  using ((select auth.uid()) = trainer_id and deleted_at is null);
create policy "Clients: INSERT own" on public.clients for insert to authenticated
  with check ((select auth.uid()) = trainer_id);
create policy "Clients: UPDATE own" on public.clients for update to authenticated
  using ((select auth.uid()) = trainer_id) with check ((select auth.uid()) = trainer_id);
create policy "Clients: DELETE own" on public.clients for delete to authenticated
  using ((select auth.uid()) = trainer_id);

drop policy if exists "Profiles: SELECT own" on public.profiles;
drop policy if exists "Profiles: UPDATE own" on public.profiles;
create policy "Profiles: SELECT own" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "Profiles: UPDATE own" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "AI Usage: SELECT own" on public.ai_usage;
create policy "AI Usage: SELECT own" on public.ai_usage for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Billing: ALL own" on public.billing_records;
create policy "Billing: ALL own" on public.billing_records for all to authenticated
  using ((select auth.uid()) = trainer_id) with check ((select auth.uid()) = trainer_id);

drop policy if exists "Sessions: ALL own" on public.sessions;
create policy "Sessions: ALL own" on public.sessions for all to authenticated
  using ((select auth.uid()) = trainer_id) with check ((select auth.uid()) = trainer_id);

drop policy if exists "Trainers can view their own usage" on public.trainer_usage;
drop policy if exists "Trainers can insert their own usage" on public.trainer_usage;
drop policy if exists "Trainers can update their own usage" on public.trainer_usage;
create policy "Usage: SELECT own" on public.trainer_usage for select to authenticated
  using ((select auth.uid()) = trainer_id);
create policy "Usage: INSERT own" on public.trainer_usage for insert to authenticated
  with check ((select auth.uid()) = trainer_id);
create policy "Usage: UPDATE own" on public.trainer_usage for update to authenticated
  using ((select auth.uid()) = trainer_id) with check ((select auth.uid()) = trainer_id);
