-- Incident reports: damage claims, accidents, guest complaints, lost and found.
-- One trail for insurance and HR. Anyone on the team can report; managers resolve.
-- Photos go in the private car-photos bucket under <company_id>/incidents/<incident id>/<photo id>.jpg.

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('damage', 'accident', 'complaint', 'lost_found', 'other')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  car_id uuid references public.parked_cars (id) on delete set null,
  -- what the car was at the time ("#14 · Black BMW · A3"), kept even after the car leaves
  car_label text not null default '' check (length(car_label) <= 200),
  details text not null check (length(details) between 1 and 4000),
  guest_name text not null default '' check (length(guest_name) <= 200),
  guest_phone text not null default '' check (length(guest_phone) <= 40),
  photos text[] not null default '{}' check (cardinality(photos) <= 12),
  reported_by uuid references auth.users (id) on delete set null,
  reported_by_name text not null default '',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_by_name text not null default '',
  resolution text not null default '' check (length(resolution) <= 4000),
  -- every photo path sits under this company's incident folder
  constraint incidents_photo_paths check (
    array_to_string(photos, '|') = '' or
    array_to_string(photos, '|') ~ ('^(' || company_id::text || '/incidents/' || id::text || '/[0-9a-f-]+\.jpg\|?)+$')
  )
);
create index if not exists incidents_company_created_idx on public.incidents (company_id, created_at desc);
create index if not exists incidents_company_open_idx on public.incidents (company_id) where status = 'open';

alter table public.incidents enable row level security;
create policy "members read incidents" on public.incidents
  for select to authenticated using (public.is_member(company_id));
create policy "members report incidents" on public.incidents
  for insert to authenticated with check (
    public.is_member(company_id) and reported_by = auth.uid() and status = 'open' and resolved_at is null
    and (car_id is null or exists (select 1 from public.parked_cars c where c.id = car_id and c.company_id = incidents.company_id))
  );
-- managers and admins resolve (or reopen) and write what was done
create policy "managers resolve incidents" on public.incidents
  for update to authenticated
  using (public.my_role(company_id) in ('admin', 'manager'))
  with check (public.my_role(company_id) in ('admin', 'manager'));

-- what was reported can't be rewritten after the fact, only resolved
create or replace function public.incidents_freeze()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.company_id <> old.company_id or new.kind <> old.kind or new.details <> old.details
     or (new.car_id is not null and new.car_id is distinct from old.car_id) or new.car_label <> old.car_label
     or (new.reported_by is not null and new.reported_by is distinct from old.reported_by) or new.created_at <> old.created_at
     or new.photos <> old.photos then
    raise exception 'An incident report can''t be changed after it''s filed';
  end if;
  return new;
end;
$$;
create or replace trigger incidents_freeze before update on public.incidents
  for each row execute function public.incidents_freeze();

alter publication supabase_realtime add table public.incidents;
