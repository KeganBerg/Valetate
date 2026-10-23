-- Damage walkaround photos: proof of a car's condition at check-in.
-- Photos live in a private bucket under <company_id>/<car_id>/<photo id>.jpg.
-- Nobody but an admin can delete one, so the record can't be quietly changed later.

create table public.car_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  car_id uuid not null references public.parked_cars (id) on delete cascade,
  side text not null check (side in ('front', 'driver', 'back', 'passenger', 'closeup')),
  path text not null unique,
  damage boolean not null default false,
  note text not null default '',
  taken_at timestamptz not null default now(),
  taken_by uuid references auth.users (id) on delete set null,
  taken_by_name text not null default ''
);
create index car_photos_car_idx on public.car_photos (car_id);

alter table public.car_photos enable row level security;
create policy "members see photos" on public.car_photos
  for select to authenticated using (public.is_member(company_id));
create policy "members add photos" on public.car_photos
  for insert to authenticated with check (
    public.is_member(company_id)
    and exists (select 1 from public.parked_cars c where c.id = car_id and c.company_id = car_photos.company_id)
    and split_part(path, '/', 1) = company_id::text
  );
-- marking damage or adding a note; the picture itself never changes
create policy "members mark damage" on public.car_photos
  for update to authenticated using (public.is_member(company_id)) with check (public.is_member(company_id));
create policy "admins delete photos" on public.car_photos
  for delete to authenticated using (public.my_role(company_id) = 'admin');

alter table public.car_photos replica identity full;
alter publication supabase_realtime add table public.car_photos;

-- storage: one private bucket, images only, 5 MB each
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('car-photos', 'car-photos', false, 5242880, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

-- the first folder of an object's path is the company it belongs to
create or replace function public.is_member_of_folder(object_name text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  return public.is_member(split_part(object_name, '/', 1)::uuid);
exception when others then
  return false;
end;
$$;
revoke execute on function public.is_member_of_folder(text) from anon, public;
grant execute on function public.is_member_of_folder(text) to authenticated;

create policy "members read car photos" on storage.objects
  for select to authenticated using (bucket_id = 'car-photos' and public.is_member_of_folder(name));
create policy "members upload car photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'car-photos' and public.is_member_of_folder(name));
create policy "admins delete car photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'car-photos'
    and public.my_role((select c.company_id from public.car_photos c where c.path = name limit 1)) = 'admin'
  );
