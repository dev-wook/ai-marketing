create table if not exists public.ai_place_base_snapshots (
  id uuid primary key default gen_random_uuid(),
  place_id text not null,
  place_name text,
  category text,
  raw_payload_json jsonb not null default '{}'::jsonb,
  normalized_payload_json jsonb not null default '{}'::jsonb,
  field_status_json jsonb not null default '{}'::jsonb,
  snapshot_hash text not null,
  data_completeness numeric not null default 0,
  collector_error_count integer not null default 0,
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (place_id, snapshot_hash)
);

create index if not exists ai_place_base_snapshots_place_collected_idx
  on public.ai_place_base_snapshots(place_id, collected_at desc);

create table if not exists public.ai_place_keyword_observations (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid not null references public.ai_place_keywords(id) on delete cascade,
  collection_run_id uuid not null references public.ai_place_collection_runs(id) on delete cascade,
  place_id text not null,
  place_snapshot_id uuid references public.ai_place_base_snapshots(id) on delete set null,
  rank integer,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (collection_run_id, place_id)
);

create index if not exists ai_place_keyword_observations_keyword_rank_idx
  on public.ai_place_keyword_observations(keyword_id, observed_at desc, rank);

create index if not exists ai_place_keyword_observations_place_idx
  on public.ai_place_keyword_observations(place_id, observed_at desc);
