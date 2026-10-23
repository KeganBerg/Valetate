-- Tighter rules for car records (audit finding 7). Until now any valet could
-- rewrite any car, including who parked it and when, and the history of cars
-- that left; owner names and phone numbers were also kept forever.
--
-- The rules apply to people using the app directly. Database functions that
-- run as their owner (guest requests, invite links, scheduled jobs) are not
-- affected, because inside them current_user is not 'authenticated'.

create or replace function public.guard_parked_car()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  is_boss boolean;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- a car is parked by whoever is signed in, and starts out parked
    new.parked_by := uid;
    new.status := 'parked';
    new.retrieved_at := null;
    new.retrieved_by := null;
    -- the phone's clock decides parked_at (a car parked with no signal is sent later),
    -- but never in the future and never more than a day back
    new.parked_at := least(greatest(coalesce(new.parked_at, now()), now() - interval '1 day'), now());
    return new;
  end if;

  is_boss := public.my_role(old.company_id) in ('admin', 'manager');

  -- who parked it, when, and the guest link never change
  new.id := old.id;
  new.company_id := old.company_id;
  new.parked_at := old.parked_at;
  new.parked_by := old.parked_by;
  new.guest_token := old.guest_token;

  if new.map_id <> old.map_id and not exists (
    select 1 from public.lot_maps m where m.id = new.map_id and m.company_id = old.company_id
  ) then
    raise exception 'That map belongs to another company';
  end if;

  if old.status = 'parked' and new.status = 'retrieved' then
    -- the server records when the car left and who brought it out
    new.retrieved_at := now();
    new.retrieved_by := uid;
  elsif old.status = 'retrieved' and new.status = 'parked' then
    -- undo a retrieve: right away for anyone, later only for a manager or admin
    if not is_boss and old.retrieved_at < now() - interval '15 minutes' then
      raise exception 'This car left more than 15 minutes ago. Park it again as a new car.';
    end if;
    new.retrieved_at := null;
    new.retrieved_by := null;
  elsif old.status = 'retrieved' then
    -- the record of a car that left is history: only a manager or admin can correct it
    if not is_boss then
      raise exception 'Only a manager or admin can change a car that already left';
    end if;
    new.retrieved_at := old.retrieved_at;
    new.retrieved_by := old.retrieved_by;
  else
    -- still parked: the retrieve fields stay empty
    new.retrieved_at := null;
    new.retrieved_by := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_parked_car() from anon, authenticated, public;

create or replace trigger parked_cars_guard
  before insert or update on public.parked_cars
  for each row execute function public.guard_parked_car();

-- Valets see the cars on the lot and the ones that left in the last day (for
-- undo and late questions). Managers and admins see the full history.
alter policy "members read cars" on public.parked_cars
  using (
    public.is_member(company_id) and (
      status = 'parked'
      or retrieved_at > now() - interval '1 day'
      or public.my_role(company_id) in ('admin', 'manager')
    )
  );

-- Members can change their own display name, not the email teammates see.
create or replace function public.guard_member()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user = 'authenticated' and public.my_role(old.company_id) <> 'admin' then
    new.email := old.email;
    new.user_id := old.user_id;
    new.company_id := old.company_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_member() from anon, authenticated, public;

create or replace trigger members_guard
  before update on public.members
  for each row execute function public.guard_member();

-- Owner names and phone numbers are only needed while the car is here (and
-- shortly after, for a lost item or a damage question). Clear them 30 days
-- after the car leaves.
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.forget_old_owner_contacts()
returns integer
language sql security definer set search_path = ''
as $$
  with cleared as (
    update public.parked_cars
    set owner_name = '', owner_phone = ''
    where status = 'retrieved'
      and retrieved_at < now() - interval '30 days'
      and (owner_name <> '' or owner_phone <> '')
    returning 1
  )
  select count(*)::integer from cleared;
$$;
revoke execute on function public.forget_old_owner_contacts() from anon, authenticated, public;

select cron.schedule('forget-old-owner-contacts', '17 4 * * *', 'select public.forget_old_owner_contacts()');
