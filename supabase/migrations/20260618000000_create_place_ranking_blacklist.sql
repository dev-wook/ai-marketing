create table if not exists public.place_ranking_blacklist (
  id bigserial primary key,
  keyword text not null,
  place_key text not null,
  place_id text,
  place_name text not null,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (keyword, place_key)
);

create index if not exists place_ranking_blacklist_keyword_idx
  on public.place_ranking_blacklist (keyword, created_at desc);

create or replace function public.set_place_ranking_blacklist_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_place_ranking_blacklist_updated_at
  on public.place_ranking_blacklist;

create trigger set_place_ranking_blacklist_updated_at
before update on public.place_ranking_blacklist
for each row
execute function public.set_place_ranking_blacklist_updated_at();
