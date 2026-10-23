-- Invite links: an admin shares a one-time link (or its code) and whoever opens it joins.
-- Joining no longer trusts the email on a sign-up, so "Confirm email" can be off
-- without letting someone claim an invite by signing up with an invited address.

alter table public.invites alter column email drop not null;
alter table public.invites drop constraint if exists invites_email_check;
alter table public.invites add constraint invites_email_check
  check (email is null or (email = lower(trim(email)) and position('@' in email) > 1));
-- who the link is for, so the admin can tell pending links apart ("Jane, night valet")
alter table public.invites add column if not exists label text not null default '';
-- 12 hex characters (48 bits): unguessable, short enough to read out
alter table public.invites add column if not exists code text not null
  default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
create unique index if not exists invites_code_idx on public.invites (code);
alter table public.invites add column if not exists expires_at timestamptz not null default now() + interval '14 days';
alter table public.invites add column if not exists accepted_by uuid references auth.users (id) on delete set null;

-- Join the company behind an invite code. Each code works once.
create or replace function public.join_with_code(invite_code text, my_name text default '')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  c text := upper(regexp_replace(coalesce(invite_code, ''), '[^0-9A-Za-z]', '', 'g'));
  inv public.invites;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into inv from public.invites i
  where i.code = c and i.accepted_at is null and i.expires_at > now()
  for update;
  if not found then
    raise exception 'This invite link is not valid. It may have been used already or expired.';
  end if;
  -- already on the team: keep the role they have
  insert into public.members (company_id, user_id, role, display_name, email)
  values (inv.company_id, uid, inv.role, coalesce(my_name, ''), lower(coalesce((select auth.jwt() ->> 'email'), '')))
  on conflict (company_id, user_id) do nothing;
  update public.invites set accepted_at = now(), accepted_by = uid where id = inv.id;
  return inv.company_id;
end;
$$;
revoke execute on function public.join_with_code(text, text) from anon, public;
grant execute on function public.join_with_code(text, text) to authenticated;

-- The old email auto-join trusted an unverified address. Kept as a no-op so
-- browsers still running the previous version don't error.
create or replace function public.accept_invites(my_name text default '')
returns integer
language sql stable security definer set search_path = ''
as $$ select 0 $$;
