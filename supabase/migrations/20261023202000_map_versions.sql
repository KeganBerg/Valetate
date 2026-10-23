-- Two people editing the same map used to overwrite each other silently: each
-- autosave wrote the whole map. Every map now carries a version that goes up on
-- each save, and the app only saves over the version it last saw. If someone
-- else saved in between, the app gets nothing back and asks which to keep.

alter table public.lot_maps add column if not exists version integer not null default 1;

create or replace function public.bump_map_version()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;
revoke execute on function public.bump_map_version() from anon, authenticated, public;

drop trigger if exists lot_maps_bump_version on public.lot_maps;
create trigger lot_maps_bump_version
  before update on public.lot_maps
  for each row execute function public.bump_map_version();
