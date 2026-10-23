-- Guests request their own car from a link (QR on the ticket or a text), with no account.
-- Requests gain a "ready" step: the car is at the stand waiting for its owner.

alter table public.requests drop constraint if exists requests_status_check;
alter table public.requests add constraint requests_status_check check (status in ('open', 'claimed', 'ready', 'done', 'cancelled'));
alter table public.requests add column if not exists ready_at timestamptz;
-- who asked: the stand, the guest's link, or (later) a text message reply
alter table public.requests add column if not exists source text not null default 'staff' check (source in ('staff', 'guest', 'sms'));

-- one live request per car, now counting "ready" too
-- (the older open/claimed indexes stay; they are a subset of these)
create unique index if not exists requests_one_live_per_car on public.requests (car_id) where status in ('open', 'claimed', 'ready');
create index if not exists requests_company_live_idx on public.requests (company_id) where status in ('open', 'claimed', 'ready');

-- unguessable per-car link for the guest (existing rows each get their own)
alter table public.parked_cars add column if not exists guest_token text not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
create unique index if not exists parked_cars_guest_token_idx on public.parked_cars (guest_token);

create or replace function public.close_requests_for_car()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'retrieved' and old.status <> 'retrieved' then
    update public.requests set status = 'done', closed_at = now()
    where car_id = new.id and status in ('open', 'claimed', 'ready');
  end if;
  return new;
end;
$$;
revoke execute on function public.close_requests_for_car() from anon, authenticated, public;

-- What a guest may see about their own car: never the plate, owner or spot.
create or replace function public.guest_car(token text)
returns json
language sql stable security definer set search_path = ''
as $$
  select json_build_object(
    'company', co.name,
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

-- Ask for the car. Asking twice is harmless.
create or replace function public.guest_request(token text)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  c record;
begin
  select id, company_id, map_id into c from public.parked_cars
  where length(token) >= 16 and guest_token = token and status = 'parked';
  if c.id is null then
    return public.guest_car(token);
  end if;
  insert into public.requests (company_id, map_id, car_id, source, created_by_name)
  values (c.company_id, c.map_id, c.id, 'guest', 'Guest')
  on conflict do nothing;
  return public.guest_car(token);
end;
$$;

-- these two are the guest's whole API, so signed-out callers may use them
revoke execute on function public.guest_car(text) from public;
revoke execute on function public.guest_request(text) from public;
grant execute on function public.guest_car(text) to anon, authenticated;
grant execute on function public.guest_request(text) to anon, authenticated;
