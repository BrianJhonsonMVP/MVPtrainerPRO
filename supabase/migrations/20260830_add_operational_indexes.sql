-- Cover foreign keys and the trainer-scoped reads used by operational screens.
create index if not exists idx_billing_records_client_id on public.billing_records (client_id);
create index if not exists idx_diets_trainer_id on public.diets (trainer_id);
create index if not exists idx_routines_trainer_id on public.routines (trainer_id);
create index if not exists idx_sessions_client_id on public.sessions (client_id);
create index if not exists idx_public_profile_gallery_trainer_id on public.public_profile_gallery (trainer_id);
create index if not exists idx_public_profile_services_trainer_id on public.public_profile_services (trainer_id);
