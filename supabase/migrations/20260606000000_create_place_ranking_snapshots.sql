create table if not exists public.place_ranking_snapshots (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  snapshot_date date not null,
  place_id text not null,
  rank integer not null check (rank > 0),
  name text not null,
  category text,
  image_url text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (keyword, snapshot_date, place_id)
);

create index if not exists place_ranking_snapshots_keyword_date_idx
  on public.place_ranking_snapshots (keyword, snapshot_date desc);

create index if not exists place_ranking_snapshots_keyword_place_idx
  on public.place_ranking_snapshots (keyword, place_id, snapshot_date desc);

create or replace function public.set_place_ranking_snapshots_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_place_ranking_snapshots_updated_at
  on public.place_ranking_snapshots;

create trigger set_place_ranking_snapshots_updated_at
before update on public.place_ranking_snapshots
for each row
execute function public.set_place_ranking_snapshots_updated_at();
