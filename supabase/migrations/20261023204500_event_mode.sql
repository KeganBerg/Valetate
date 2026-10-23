-- Event surge mode: a show or game with a let-out time everyone counts down to,
-- and requests made ahead for that moment.
create table if not exists public.lot_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null default '',
  let_out_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists lot_events_company_live_idx on public.lot_events (company_id) where ended_at is null;

alter table public.lot_events enable row level security;

create policy "members read events" on public.lot_events
  for select to authenticated using (public.is_member(company_id));
create policy "members start events" on public.lot_events
  for insert to authenticated with check (public.is_member(company_id));
create policy "members update events" on public.lot_events
  for update to authenticated using (public.is_member(company_id)) with check (public.is_member(company_id));

alter publication supabase_realtime add table public.lot_events;

-- a pre-request: bring the car up at this time (the let-out), not now
alter table public.requests add column if not exists due_at timestamptz;

-- how many cars left since a moment (the let-out), for the pace on the event card
create or replace function public.cars_out_since(company uuid, since timestamptz)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer from public.parked_cars
  where company_id = company and status = 'retrieved' and retrieved_at >= since;
$$;
