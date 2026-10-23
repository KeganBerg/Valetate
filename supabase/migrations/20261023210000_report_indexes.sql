-- the stand report reads a month of cars and requests at a time
create index if not exists parked_cars_company_parked_idx on public.parked_cars (company_id, parked_at);
create index if not exists parked_cars_company_retrieved_idx on public.parked_cars (company_id, retrieved_at) where retrieved_at is not null;
create index if not exists requests_company_created_idx on public.requests (company_id, created_at);
