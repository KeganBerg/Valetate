-- Request queue: the stand asks for a car, a valet claims it with one tap and brings it up.
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  map_id uuid not null references public.lot_maps (id) on delete cascade,
  car_id uuid not null references public.parked_cars (id) on delete cascade,
  kind text not null default 'retrieve' check (kind in ('retrieve')),
  note text not null default '',
  status text not null default 'open' check (status in ('open', 'claimed', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_by_name text not null default '',
  claimed_at timestamptz,
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_by_name text not null default '',
  closed_at timestamptz
);
create index requests_company_active_idx on public.requests (company_id) where status in ('open', 'claimed');
create index requests_car_idx on public.requests (car_id);
-- one live request per car
create unique index requests_one_per_car on public.requests (car_id) where status in ('open', 'claimed');

alter table public.requests enable row level security;

create policy "members read requests" on public.requests
  for select to authenticated using (public.is_member(company_id));
create policy "members create requests" on public.requests
  for insert to authenticated with check (
    public.is_member(company_id)
    and exists (
      select 1 from public.parked_cars c
      where c.id = car_id and c.company_id = requests.company_id and c.map_id = requests.map_id and c.status = 'parked'
    )
  );
create policy "members update requests" on public.requests
  for update to authenticated using (public.is_member(company_id)) with check (public.is_member(company_id));

-- when a car leaves the lot, whatever was asked of it is finished
create or replace function public.close_requests_for_car()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'retrieved' and old.status <> 'retrieved' then
    update public.requests set status = 'done', closed_at = now()
    where car_id = new.id and status in ('open', 'claimed');
  end if;
  return new;
end;
$$;
revoke execute on function public.close_requests_for_car() from anon, authenticated, public;
create trigger parked_cars_close_requests after update of status on public.parked_cars
for each row execute function public.close_requests_for_car();

alter table public.requests replica identity full;
alter publication supabase_realtime add table public.requests;
