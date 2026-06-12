-- Retro-Gamers.it avatar Storage bucket
-- Run this file manually in the Supabase SQL Editor, or create the same bucket
-- from the Supabase Dashboard.
--
-- Dashboard values:
-- - Bucket name: avatars
-- - Public bucket: true
-- - Allowed MIME types: image/jpeg, image/png, image/webp
-- - File size limit: 2 MB
--
-- Uploads and removals are performed server-side with the service role.
-- The browser only reads public avatar URLs.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read reader avatars" on storage.objects;
create policy "Public can read reader avatars"
  on storage.objects
  for select
  to public
  using (bucket_id = 'avatars');

-- No public insert/update/delete policies are required. The Astro API uploads,
-- replaces and removes files with the Supabase service role after validating
-- the authenticated user.
