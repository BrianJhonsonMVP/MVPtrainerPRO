insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trainer-assets', 'trainer-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Trainer assets are publicly readable" on storage.objects;
create policy "Trainer assets are publicly readable"
on storage.objects for select
using (bucket_id = 'trainer-assets');

drop policy if exists "Trainers can upload their own assets" on storage.objects;
create policy "Trainers can upload their own assets"
on storage.objects for insert to authenticated
with check (bucket_id = 'trainer-assets' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "Trainers can update their own assets" on storage.objects;
create policy "Trainers can update their own assets"
on storage.objects for update to authenticated
using (bucket_id = 'trainer-assets' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (bucket_id = 'trainer-assets' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "Trainers can delete their own assets" on storage.objects;
create policy "Trainers can delete their own assets"
on storage.objects for delete to authenticated
using (bucket_id = 'trainer-assets' and (storage.foldername(name))[1] = (select auth.uid()::text));
