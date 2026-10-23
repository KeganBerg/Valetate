-- Repeat guests and monthlies: a profile per plate, learned from every check-in,
-- plus what the stand has seen of that plate before (visits, damage, incidents).

-- plates compare with OCR lookalikes folded together, the same as plateKey() in src/plates.ts
create or replace function public.plate_key(p text)
returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select translate(regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g'), 'OQDILZSBG', '000112586');
$$;

create table if not exists public.vehicles (
  company_id uuid not null references public.companies (id) on delete cascade,
  plate_key text not null check (length(plate_key) between 2 and 12),
  plate text not null default '' check (length(plate) <= 20),
  owner_name text not null default '' check (length(owner_name) <= 200),
  owner_phone text not null default '' check (length(owner_phone) <= 40),
  color text not null default '' check (length(color) <= 40),
  make text not null default '' check (length(make) <= 80),
  vehicle text not null default '' check (length(vehicle) <= 200),
  -- '' a regular guest; monthly parker, hotel guest, or VIP
  guest_type text not null default '' check (guest_type in ('', 'monthly', 'hotel', 'vip')),
  -- room number for a hotel guest, unit for a resident
  unit text not null default '' check (length(unit) <= 40),
  -- monthly paid through
  paid_until date,
  -- how they like it: "seat stays back", "no valet key on the ring"
  prefs text not null default '' check (length(prefs) <= 1000),
  updated_at timestamptz not null default now(),
  primary key (company_id, plate_key)
);

alter table public.vehicles enable row level security;
create policy "members read vehicles" on public.vehicles
  for select to authenticated using (public.is_member(company_id));
create policy "members add vehicles" on public.vehicles
  for insert to authenticated with check (public.is_member(company_id));
create policy "members edit vehicles" on public.vehicles
  for update to authenticated using (public.is_member(company_id)) with check (public.is_member(company_id));
create policy "admins delete vehicles" on public.vehicles
  for delete to authenticated using (public.my_role(company_id) = 'admin');

create index if not exists parked_cars_plate_key_idx on public.parked_cars (company_id, public.plate_key(plate));

-- every check-in teaches the profile the latest details; a blank field never wipes a known one
create or replace function public.learn_vehicle()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare k text := public.plate_key(new.plate);
begin
  if length(k) between 2 and 12 then
    insert into public.vehicles as v (company_id, plate_key, plate, owner_name, owner_phone, color, make, vehicle)
    values (new.company_id, k, left(upper(new.plate), 20), left(new.owner_name, 200), left(new.owner_phone, 40),
            left(new.color, 40), left(new.make, 80), left(new.vehicle, 200))
    on conflict (company_id, plate_key) do update set
      plate = excluded.plate,
      owner_name = coalesce(nullif(excluded.owner_name, ''), v.owner_name),
      owner_phone = coalesce(nullif(excluded.owner_phone, ''), v.owner_phone),
      color = coalesce(nullif(excluded.color, ''), v.color),
      make = coalesce(nullif(excluded.make, ''), v.make),
      vehicle = coalesce(nullif(excluded.vehicle, ''), v.vehicle),
      updated_at = now();
  end if;
  return new;
exception when others then
  -- a profile problem must never stop a car being parked
  return new;
end;
$$;
create or replace trigger parked_cars_learn_vehicle
  after insert or update of plate, owner_name, owner_phone, color, make, vehicle on public.parked_cars
  for each row execute function public.learn_vehicle();

-- what the stand knows about a plate: the profile and its history at this company.
-- Security definer so valets (who only see today's cars) still get the counts, never the rows.
create or replace function public.vehicle_lookup(company uuid, plate text)
returns json
language plpgsql stable security definer
set search_path = ''
as $$
declare
  k text := public.plate_key(plate);
  result json;
begin
  if not public.is_member(company) or length(k) < 4 then
    return null;
  end if;
  with cars as (
    select c.id, c.parked_at, c.status from public.parked_cars c
    where c.company_id = company and public.plate_key(c.plate) = k
  )
  select json_build_object(
    'profile', (select row_to_json(v) from public.vehicles v where v.company_id = company and v.plate_key = k),
    'past_visits', (select count(*) from cars where status = 'retrieved'),
    'last_visit', (select max(parked_at) from cars where status = 'retrieved'),
    'damage_visits', (select count(distinct p.car_id) from public.car_photos p join cars on cars.id = p.car_id where p.damage),
    'incidents', (select count(*) from public.incidents i join cars on cars.id = i.car_id),
    'last_incident', (
      select i.kind || ': ' || left(i.details, 140) from public.incidents i join cars on cars.id = i.car_id
      order by i.created_at desc limit 1
    )
  ) into result;
  return result;
end;
$$;
revoke execute on function public.vehicle_lookup(uuid, text) from anon, public;
grant execute on function public.vehicle_lookup(uuid, text) to authenticated;

-- profiles for plates already on file
insert into public.vehicles (company_id, plate_key, plate, owner_name, owner_phone, color, make, vehicle, updated_at)
select distinct on (c.company_id, public.plate_key(c.plate))
  c.company_id, public.plate_key(c.plate), left(upper(c.plate), 20), left(c.owner_name, 200), left(c.owner_phone, 40),
  left(c.color, 40), left(c.make, 80), left(c.vehicle, 200), c.parked_at
from public.parked_cars c
where length(public.plate_key(c.plate)) between 2 and 12
order by c.company_id, public.plate_key(c.plate), c.parked_at desc
on conflict do nothing;
