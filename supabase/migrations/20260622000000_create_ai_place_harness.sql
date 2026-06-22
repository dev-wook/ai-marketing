create extension if not exists pgcrypto;

create table if not exists public.ai_place_keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  normalized_keyword text not null,
  region_term text,
  service_term text,
  need_term text,
  intent_cluster_key text,
  active_profile_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_keyword)
);

create table if not exists public.ai_place_collection_runs (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid not null references public.ai_place_keywords(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED')),
  collector_version text not null,
  search_context_json jsonb not null default '{}'::jsonb,
  result_count integer,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_place_snapshots (
  id uuid primary key default gen_random_uuid(),
  collection_run_id uuid not null references public.ai_place_collection_runs(id) on delete cascade,
  place_id text not null,
  rank integer,
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
  unique (collection_run_id, place_id)
);

create table if not exists public.ai_place_benchmark_profiles (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid not null references public.ai_place_keywords(id) on delete cascade,
  window_start timestamptz not null,
  window_end timestamptz not null,
  status text not null check (status in ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'FAILED')),
  profile_version text not null,
  rubric_version text not null,
  algorithm_version text not null,
  prompt_version text,
  model_name text,
  source_run_count integer not null default 0,
  sample_count integer not null default 0,
  statistics_json jsonb not null default '{}'::jsonb,
  signal_json jsonb not null default '{}'::jsonb,
  llm_summary_json jsonb,
  data_confidence numeric not null default 0,
  created_by text not null default 'system',
  created_at timestamptz not null default now()
);

create unique index if not exists ai_place_benchmark_profiles_one_active_idx
  on public.ai_place_benchmark_profiles(keyword_id)
  where status = 'ACTIVE';

alter table public.ai_place_keywords
  drop constraint if exists ai_place_keywords_active_profile_id_fkey;

alter table public.ai_place_keywords
  add constraint ai_place_keywords_active_profile_id_fkey
  foreign key (active_profile_id)
  references public.ai_place_benchmark_profiles(id)
  on delete set null;

create table if not exists public.ai_place_diagnosis_runs (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid not null references public.ai_place_keywords(id) on delete cascade,
  place_id text not null,
  target_snapshot_id uuid references public.ai_place_snapshots(id) on delete set null,
  benchmark_profile_id uuid references public.ai_place_benchmark_profiles(id) on delete set null,
  cache_key text not null,
  status text not null check (status in ('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED')),
  rank_at_diagnosis integer,
  absolute_score numeric,
  benchmark_percentile numeric,
  data_confidence numeric,
  category_scores_json jsonb not null default '{}'::jsonb,
  quantitative_scores_json jsonb not null default '{}'::jsonb,
  semantic_scores_json jsonb not null default '{}'::jsonb,
  diagnosis_result_json jsonb not null default '{}'::jsonb,
  improvements_json jsonb not null default '[]'::jsonb,
  evidence_json jsonb not null default '{}'::jsonb,
  rubric_version text not null,
  scorer_version text not null,
  feature_extractor_version text not null,
  prompt_version text,
  model_name text,
  gemini_invocation_json jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ai_place_collection_runs_keyword_idx
  on public.ai_place_collection_runs(keyword_id, started_at desc);

create index if not exists ai_place_snapshots_run_rank_idx
  on public.ai_place_snapshots(collection_run_id, rank);

create index if not exists ai_place_snapshots_place_idx
  on public.ai_place_snapshots(place_id, collected_at desc);

create index if not exists ai_place_benchmark_profiles_keyword_created_idx
  on public.ai_place_benchmark_profiles(keyword_id, created_at desc);

create index if not exists ai_place_diagnosis_runs_cache_idx
  on public.ai_place_diagnosis_runs(cache_key);

create unique index if not exists ai_place_diagnosis_runs_completed_cache_idx
  on public.ai_place_diagnosis_runs(cache_key)
  where status in ('COMPLETED', 'PARTIAL');

create or replace function public.set_ai_place_keywords_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_ai_place_keywords_updated_at on public.ai_place_keywords;
create trigger set_ai_place_keywords_updated_at
before update on public.ai_place_keywords
for each row execute function public.set_ai_place_keywords_updated_at();
