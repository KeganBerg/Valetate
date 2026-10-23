-- Guest feedback: one question after the car is handed back ("How was your valet service?"),
-- one to five stars and an optional comment. Guests answer from their car link, with no account.
-- Managers and admins read it (stand report, low-rating alerts); valets don't see individual comments.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  -- one answer per car visit; the guest can change it while the link still works
  car_id uuid unique references public.parked_cars (id) on delete set null,
  ticket text not null default '',
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (length(comment) <= 1000),
  -- who brought the car up, so ratings show per valet
  valet_id uuid references auth.users (id) on delete set null,
  valet_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists feedback_company_created_idx on public.feedback (company_id, created_at desc);

alter table public.feedback enable row level security;
create policy "managers read feedback" on public.feedback
  for select to authenticated using (public.my_role(company_id) in ('admin', 'manager'));
-- no insert or update policy: guests write only through guest_feedback below

alter publication supabase_realtime add table public.feedback;

-- The guest page also says whether they've answered.
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

-- Rate the visit once the car is handed back. Stars null keeps the rating (adding a comment later);
-- note null keeps the comment.
create or replace function public.guest_feedback(token text, stars int default null, note text default null)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  c record;
  v record;
begin
  select id, company_id, ticket, retrieved_by into c from public.parked_cars
  where length(token) >= 16 and guest_token = token
    and status = 'retrieved' and retrieved_at > now() - interval '3 hours';
  if c.id is null then
    return public.guest_car(token);
  end if;
  if stars is not null and (stars < 1 or stars > 5) then
    raise exception 'Rating must be 1 to 5 stars';
  end if;
  note := left(coalesce(trim(note), ''), 1000);

  if not exists (select 1 from public.feedback where car_id = c.id) then
    if stars is null then
      return public.guest_car(token);
    end if;
    -- the valet who brought it up, or whoever marked it retrieved
    select r.claimed_by as id, r.claimed_by_name as name into v
    from public.requests r
    where r.car_id = c.id and r.status <> 'cancelled' and r.claimed_by is not null
    order by r.created_at desc
    limit 1;
    if v.id is null and c.retrieved_by is not null then
      select m.user_id as id, m.display_name as name into v
      from public.members m
      where m.company_id = c.company_id and m.user_id = c.retrieved_by;
    end if;
    insert into public.feedback (company_id, car_id, ticket, rating, comment, valet_id, valet_name)
    values (c.company_id, c.id, coalesce(c.ticket, ''), stars, note, v.id, coalesce(v.name, ''))
    on conflict (car_id) do nothing;
  else
    update public.feedback
    set rating = coalesce(stars, rating),
        comment = case when note <> '' or stars is null then note else comment end,
        updated_at = now()
    where car_id = c.id;
  end if;
  return public.guest_car(token);
end;
$$;

revoke execute on function public.guest_feedback(text, int, text) from public;
grant execute on function public.guest_feedback(text, int, text) to anon, authenticated;
