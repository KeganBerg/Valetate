-- Payments and validations: what the stand charges, codes merchants hand out, and who paid how.
-- Card payments are taken on the stand's own reader (or tap to pay) and recorded here; the app
-- doesn't touch card numbers.

-- the company's rates; admins set them (the "admins rename company" policy covers this column)
alter table public.companies add column if not exists rates jsonb not null default '{"mode": "off"}';
alter table public.companies add constraint companies_rates_shape check (
  jsonb_typeof(rates) = 'object' and coalesce(rates->>'mode', 'off') in ('off', 'flat', 'hourly')
);

-- validation codes: "SPA" parks free, "DINNER" takes $10 off, "MOVIE" gives 3 hours free
create table if not exists public.validations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9]{2,24}$'),
  label text not null default '' check (length(label) <= 80),
  kind text not null check (kind in ('free', 'off', 'hours')),
  value int not null default 0 check (value >= 0 and value <= 1000000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);
alter table public.validations enable row level security;
create policy "members read validations" on public.validations
  for select to authenticated using (public.is_member(company_id));
create policy "managers add validations" on public.validations
  for insert to authenticated with check (public.my_role(company_id) in ('admin', 'manager'));
create policy "managers change validations" on public.validations
  for update to authenticated
  using (public.my_role(company_id) in ('admin', 'manager'))
  with check (public.my_role(company_id) in ('admin', 'manager'));

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  car_id uuid references public.parked_cars (id) on delete set null,
  ticket text not null default '',
  amount_cents int not null check (amount_cents between 0 and 10000000),
  fee_cents int not null default 0 check (fee_cents between 0 and 10000000),
  method text not null check (method in ('card', 'cash', 'room', 'validated', 'comp', 'monthly')),
  -- validation code, or the room number for a room charge
  code text not null default '' check (length(code) <= 40),
  note text not null default '' check (length(note) <= 500),
  taken_by uuid references auth.users (id) on delete set null,
  taken_by_name text not null default '',
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  -- a comp says why
  constraint payments_comp_reason check (method <> 'comp' or length(trim(note)) > 0)
);
-- one live payment per car
create unique index if not exists payments_one_per_car on public.payments (car_id) where voided_at is null;
create index if not exists payments_company_created_idx on public.payments (company_id, created_at desc);

alter table public.payments enable row level security;
create policy "members read payments" on public.payments
  for select to authenticated using (public.is_member(company_id));
create policy "members take payments" on public.payments
  for insert to authenticated with check (
    public.is_member(company_id) and taken_by = auth.uid() and voided_at is null
    and (car_id is null or exists (select 1 from public.parked_cars c where c.id = car_id and c.company_id = payments.company_id))
  );
-- managers void a mistake; nothing else about a payment changes
create policy "managers void payments" on public.payments
  for update to authenticated
  using (public.my_role(company_id) in ('admin', 'manager'))
  with check (public.my_role(company_id) in ('admin', 'manager'));

create or replace function public.payments_freeze()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.company_id <> old.company_id or new.amount_cents <> old.amount_cents or new.fee_cents <> old.fee_cents
     or new.method <> old.method or new.code <> old.code or new.note <> old.note or new.ticket <> old.ticket
     or new.created_at <> old.created_at
     or (new.car_id is not null and new.car_id is distinct from old.car_id)
     or (new.taken_by is not null and new.taken_by is distinct from old.taken_by)
     or (old.voided_at is not null and new.voided_at is distinct from old.voided_at) then
    raise exception 'A payment can only be voided, not changed';
  end if;
  return new;
end;
$$;
create or replace trigger payments_freeze before update on public.payments
  for each row execute function public.payments_freeze();

alter publication supabase_realtime add table public.payments, public.validations;

-- The guest page shows what's owed so far (worked out on the phone from the rates) and whether it's paid.
create or replace function public.guest_car(token text)
returns json
language sql stable security definer set search_path = ''
as $$
  select json_build_object(
    'company', co.name,
    'tip_url', co.tip_url,
    'rates', co.rates,
    'ticket', c.ticket,
    'color', c.color,
    'make', c.make,
    'vehicle', c.vehicle,
    'parked', c.status = 'parked',
    'parked_at', c.parked_at,
    'paid', exists (select 1 from public.payments p where p.car_id = c.id and p.voided_at is null),
    'request', (
      select json_build_object('status', r.status, 'created_at', r.created_at, 'claimed_by_name', split_part(r.claimed_by_name, ' ', 1), 'ready_at', r.ready_at)
      from public.requests r
      where r.car_id = c.id and r.status <> 'cancelled'
      order by r.created_at desc
      limit 1
    ),
    'feedback', (
      select json_build_object('rating', f.rating, 'comment', f.comment)
      from public.feedback f
      where f.car_id = c.id
    )
  )
  from public.parked_cars c
  join public.companies co on co.id = c.company_id
  where length(token) >= 16 and c.guest_token = token
    and (c.status = 'parked' or c.retrieved_at > now() - interval '3 hours')
$$;
