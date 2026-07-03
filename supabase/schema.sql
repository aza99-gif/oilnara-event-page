create table if not exists public.oilnara_event_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.set_oilnara_event_store_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists oilnara_event_store_updated_at on public.oilnara_event_store;

create trigger oilnara_event_store_updated_at
before update on public.oilnara_event_store
for each row
execute function public.set_oilnara_event_store_updated_at();

alter table public.oilnara_event_store enable row level security;
