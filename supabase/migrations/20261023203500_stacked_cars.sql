-- Stacked cars: which parked cars this one blocks in (tandem spaces, ramp stacks).
alter table public.parked_cars
  add column if not exists blocks uuid[] not null default '{}';

comment on column public.parked_cars.blocks is 'Ids of parked cars this car blocks; a request for one of them says to move this car first';
