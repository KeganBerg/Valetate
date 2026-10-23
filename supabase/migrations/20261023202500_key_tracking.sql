-- Key tracking: where a car's keys hang, and who has them out right now.
alter table public.parked_cars
  add column if not exists key_slot text not null default '',
  add column if not exists keys_with uuid references auth.users (id) on delete set null,
  add column if not exists keys_with_name text not null default '',
  add column if not exists keys_out_at timestamptz;

comment on column public.parked_cars.key_slot is 'Hook or box the keys hang on; empty means the hook matches the tag number';
comment on column public.parked_cars.keys_with is 'Who has the keys off the board; null means they are on the board';
