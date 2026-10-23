-- Valetate: companies, team roles, lot maps and live parked cars.
-- Roles: admin (team + maps + cars), manager (maps + cars), valet (cars).

create type public.member_role as enum ('admin', 'manager', 'valet');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.members (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'valet',
  display_name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index members_user_idx on public.members (user_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null check (email = lower(trim(email)) and position('@' in email) > 1),
  role public.member_role not null default 'valet',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (company_id, email)
);

create table public.lot_maps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null default 'Untitled lot',
  width integer not null default 1400,
  height integer not null default 900,
  surface text not null default '#5d6168',
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index lot_maps_company_idx on public.lot_maps (company_id);

create table public.parked_cars (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  map_id uuid not null references public.lot_maps (id) on delete cascade,
  spot_key text not null,
  spot_label text not null default '',
  plate text not null check (length(trim(plate)) > 0),
  vehicle text not null default '',
  owner_name text not null default '',
  owner_phone text not null default '',
  ticket text not null default '',
  notes text not null default '',
  status text not null default 'parked' check (status in ('parked', 'retrieved')),
  parked_at timestamptz not null default now(),
  parked_by uuid references auth.users (id) on delete set null,
  retrieved_at timestamptz,
  retrieved_by uuid references auth.users (id) on delete set null
);
create index parked_cars_company_status_idx on public.parked_cars (company_id, status);
create index parked_cars_map_idx on public.parked_cars (map_id);
-- one car per spot at a time
create unique index parked_cars_one_per_spot on public.parked_cars (map_id, spot_key) where status = 'parked';

-- ---------- helpers (security definer so policies don't recurse) ----------

create or replace function public.my_role(company uuid)
returns public.member_role
language sql stable security definer set search_path = ''
as $$
  select m.role from public.members m where m.company_id = company and m.user_id = (select auth.uid())
$$;

create or replace function public.is_member(company uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.members m where m.company_id = company and m.user_id = (select auth.uid()))
$$;

-- ---------- RPCs ----------

-- Create a company and make the caller its first admin.
create or replace function public.create_company(company_name text, my_name text default '')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  cid uuid;
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not signed in'; end if;
  insert into public.companies (name) values (trim(company_name)) returning id into cid;
  insert into public.members (company_id, user_id, role, display_name, email)
  values (cid, uid, 'admin', coalesce(my_name, ''), coalesce((select auth.jwt() ->> 'email'), ''));
  return cid;
end;
$$;

-- Join every company that invited the caller's email address.
create or replace function public.accept_invites(my_name text default '')
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  em text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  n integer;
begin
  if uid is null or em = '' then return 0; end if;
  insert into public.members (company_id, user_id, role, display_name, email)
  select i.company_id, uid, i.role, coalesce(my_name, ''), em
  from public.invites i
  where i.email = em and i.accepted_at is null
  on conflict (company_id, user_id) do nothing;
  get diagnostics n = row_count;
  update public.invites set accepted_at = now() where email = em and accepted_at is null;
  return n;
end;
$$;

revoke execute on function public.create_company(text, text) from anon, public;
revoke execute on function public.accept_invites(text) from anon, public;
grant execute on function public.create_company(text, text) to authenticated;
grant execute on function public.accept_invites(text) to authenticated;

-- Never leave a company without an admin.
create or replace function public.keep_one_admin()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (tg_op = 'DELETE' or new.role <> 'admin') and old.role = 'admin' and not exists (
    select 1 from public.members m
    where m.company_id = old.company_id and m.role = 'admin' and m.user_id <> old.user_id
  ) and exists (select 1 from public.companies c where c.id = old.company_id) then
    raise exception 'A company needs at least one admin';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger members_keep_one_admin before update or delete on public.members
for each row execute function public.keep_one_admin();

-- ---------- row level security ----------

alter table public.companies enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.lot_maps enable row level security;
alter table public.parked_cars enable row level security;

create policy "members read their company" on public.companies
  for select to authenticated using (public.is_member(id));
create policy "admins rename company" on public.companies
  for update to authenticated using (public.my_role(id) = 'admin') with check (public.my_role(id) = 'admin');

create policy "members see teammates" on public.members
  for select to authenticated using (public.is_member(company_id));
create policy "admins change roles" on public.members
  for update to authenticated using (public.my_role(company_id) = 'admin') with check (public.my_role(company_id) = 'admin');
create policy "admins remove members, anyone can leave" on public.members
  for delete to authenticated using (public.my_role(company_id) = 'admin' or user_id = (select auth.uid()));
create policy "members edit own name" on public.members
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and role = public.my_role(company_id));

create policy "admins manage invites" on public.invites
  for all to authenticated using (public.my_role(company_id) = 'admin') with check (public.my_role(company_id) = 'admin');

create policy "members read maps" on public.lot_maps
  for select to authenticated using (public.is_member(company_id));
create policy "managers write maps" on public.lot_maps
  for insert to authenticated with check (public.my_role(company_id) in ('admin', 'manager'));
create policy "managers update maps" on public.lot_maps
  for update to authenticated using (public.my_role(company_id) in ('admin', 'manager')) with check (public.my_role(company_id) in ('admin', 'manager'));
create policy "managers delete maps" on public.lot_maps
  for delete to authenticated using (public.my_role(company_id) in ('admin', 'manager'));

create policy "members read cars" on public.parked_cars
  for select to authenticated using (public.is_member(company_id));
create policy "members park cars" on public.parked_cars
  for insert to authenticated with check (
    public.is_member(company_id)
    and exists (select 1 from public.lot_maps m where m.id = map_id and m.company_id = parked_cars.company_id)
  );
create policy "members update cars" on public.parked_cars
  for update to authenticated using (public.is_member(company_id)) with check (public.is_member(company_id));
create policy "admins delete cars" on public.parked_cars
  for delete to authenticated using (public.my_role(company_id) = 'admin');

-- ---------- realtime ----------
alter publication supabase_realtime add table public.parked_cars, public.lot_maps, public.members;

-- helpers are only for policies; nobody signed out should call anything
revoke execute on function public.is_member(uuid) from anon, public;
revoke execute on function public.my_role(uuid) from anon, public;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.my_role(uuid) to authenticated;
revoke execute on function public.keep_one_admin() from anon, authenticated, public;
revoke execute on function public.create_company(text, text) from anon;
revoke execute on function public.accept_invites(text) from anon;

-- so filtered realtime subscriptions also see deletes
alter table public.parked_cars replica identity full;
alter table public.lot_maps replica identity full;
