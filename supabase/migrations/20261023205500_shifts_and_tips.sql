-- Shifts (clock in/out, with a note for the next crew) and tips, pooled by time on shift.

-- where guests can tip digitally (Venmo, Cash App, PayPal link); shown on their page once the car is up
alter table public.companies add column if not exists tip_url text not null default '';
-- only plain https links reach a guest's phone
alter table public.companies add constraint companies_tip_url_https check (tip_url = '' or tip_url ~ '^https://[^\s]+$');

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  user_name text not null default '',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  handoff_note text not null default '' check (length(handoff_note) <= 2000)
);
create index if not exists shifts_company_started_idx on public.shifts (company_id, started_at desc);
-- one open shift per person
create unique index if not exists shifts_one_open on public.shifts (company_id, user_id) where ended_at is null;

alter table public.shifts enable row level security;
create policy "members read shifts" on public.shifts
  for select to authenticated using (public.is_member(company_id));
create policy "members clock themselves in" on public.shifts
  for insert to authenticated with check (public.is_member(company_id) and user_id = auth.uid());
-- your own shift, or a manager clocking out someone who forgot
create policy "members end own shift, managers any" on public.shifts
  for update to authenticated
  using (public.is_member(company_id) and (user_id = auth.uid() or public.my_role(company_id) in ('admin', 'manager')))
  with check (public.is_member(company_id));

create table if not exists public.tips (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 100000),
  method text not null default 'cash' check (method in ('cash', 'digital')),
  car_id uuid references public.parked_cars (id) on delete set null,
  logged_by uuid references auth.users (id) on delete set null,
  logged_by_name text not null default '',
  created_at timestamptz not null default now(),
  voided_at timestamptz
);
create index if not exists tips_company_created_idx on public.tips (company_id, created_at desc);

alter table public.tips enable row level security;
create policy "members read tips" on public.tips
  for select to authenticated using (public.is_member(company_id));
create policy "members log tips" on public.tips
  for insert to authenticated with check (public.is_member(company_id) and logged_by = auth.uid());
-- void your own mistake; managers can void any
create policy "members void own tips, managers any" on public.tips
  for update to authenticated
  using (public.is_member(company_id) and (logged_by = auth.uid() or public.my_role(company_id) in ('admin', 'manager')))
  with check (public.is_member(company_id));

alter publication supabase_realtime add table public.shifts, public.tips;

-- the guest page also gets the tip link
create or replace function public.guest_car(token text)
returns json
language sql stable security definer set search_path = ''
as $$
  select json_build_object(
    'company', co.name,
    'tip_url', co.tip_url,
    'ticket', c.ticket,
    'color', c.color,
    'make', c.make,
    'vehicle', c.vehicle,
    'parked', c.status = 'parked',
    'request', (
      select json_build_object('status', r.status, 'created_at', r.created_at, 'claimed_by_name', split_part(r.claimed_by_name, ' ', 1), 'ready_at', r.ready_at)
      from public.requests r
      where r.car_id = c.id and r.status <> 'cancelled'
      order by r.created_at desc
      limit 1
    )
  )
  from public.parked_cars c
  join public.companies co on co.id = c.company_id
  where length(token) >= 16 and c.guest_token = token
    and (c.status = 'parked' or c.retrieved_at > now() - interval '3 hours')
$$;
