-- Fast check-in: a car can be parked with just a key tag; plate, color and make come later.
alter table public.parked_cars drop constraint if exists parked_cars_plate_check;
alter table public.parked_cars add column if not exists color text not null default '';
alter table public.parked_cars add column if not exists make text not null default '';
-- a car needs at least a tag or a plate so it can be found again
alter table public.parked_cars add constraint parked_cars_identified check (length(trim(plate)) > 0 or length(trim(ticket)) > 0);
create index if not exists parked_cars_ticket_idx on public.parked_cars (company_id, ticket) where status = 'parked';
