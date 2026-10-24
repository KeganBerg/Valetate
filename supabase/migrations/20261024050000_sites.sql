-- Sites: one property or grounds (a venue, an event, a campus, a garage).
-- Every map is now an "area" inside a site: an overview of the grounds, an
-- outdoor area, a parking lot, a garage level or a building floor.
--
-- Existing maps are moved into sites, nothing is deleted: maps named
-- "Broward Center – Front ramp" go into a "Broward Center" site as the
-- "Front ramp" area; every other map gets a site of its own name.

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null default 'New site',
  address text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index if not exists sites_company_idx on public.sites (company_id);

alter table public.sites enable row level security;
create policy "members read sites" on public.sites
  for select to authenticated using (public.is_member(company_id));
create policy "managers add sites" on public.sites
  for insert to authenticated with check (public.my_role(company_id) in ('admin', 'manager'));
create policy "managers update sites" on public.sites
  for update to authenticated using (public.my_role(company_id) in ('admin', 'manager')) with check (public.my_role(company_id) in ('admin', 'manager'));
create policy "managers delete sites" on public.sites
  for delete to authenticated using (public.my_role(company_id) in ('admin', 'manager'));

alter table public.sites replica identity full;
alter publication supabase_realtime add table public.sites;

alter table public.lot_maps
  add column if not exists site_id uuid references public.sites (id) on delete cascade,
  add column if not exists area_kind text not null default 'lot',
  add column if not exists position integer not null default 0;
create index if not exists lot_maps_site_idx on public.lot_maps (site_id);

-- move existing maps into sites
do $$
declare
  m record;
  site_name text;
  area_name text;
  sid uuid;
begin
  for m in select id, company_id, name, updated_at from public.lot_maps where site_id is null order by updated_at loop
    sid := null;
    if position(' – ' in m.name) > 0 then
      site_name := trim(split_part(m.name, ' – ', 1));
      area_name := trim(substr(m.name, position(' – ' in m.name) + 3));
    else
      site_name := coalesce(nullif(trim(m.name), ''), 'My site');
      area_name := m.name;
    end if;
    select id into sid from public.sites where company_id = m.company_id and name = site_name limit 1;
    if sid is null then
      insert into public.sites (company_id, name, updated_at) values (m.company_id, site_name, m.updated_at) returning id into sid;
    end if;
    update public.lot_maps
      set site_id = sid,
          name = area_name,
          area_kind = case when m.name ilike '%garage%' or m.name ilike '%level%' then 'garage' else 'lot' end,
          position = (select count(*) from public.lot_maps x where x.site_id = sid)
      where id = m.id;
  end loop;
end $$;

-- An area always belongs to a site of the same company. Apps from before
-- sites save maps without one: those get a site of their own name.
create or replace function public.lot_map_site()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.site_id is null then
    if tg_op = 'UPDATE' and old.site_id is not null then
      new.site_id := old.site_id;
    else
      insert into public.sites (company_id, name) values (new.company_id, coalesce(nullif(trim(new.name), ''), 'My site'))
        returning id into new.site_id;
    end if;
  elsif not exists (select 1 from public.sites s where s.id = new.site_id and s.company_id = new.company_id) then
    raise exception 'That site belongs to another company';
  end if;
  return new;
end;
$$;
revoke execute on function public.lot_map_site() from anon, authenticated, public;

create or replace trigger lot_maps_site
  before insert or update on public.lot_maps
  for each row execute function public.lot_map_site();
