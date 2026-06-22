create table if not exists public.ai_place_harness_jobs (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid not null references public.ai_place_keywords(id) on delete cascade,
  collection_run_id uuid references public.ai_place_collection_runs(id) on delete set null,
  status text not null check (status in ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED')),
  next_rank_start integer not null default 1,
  batch_size integer not null default 10,
  total_count integer not null default 50,
  evaluated_count integer not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_place_harness_place_scores (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ai_place_harness_jobs(id) on delete cascade,
  keyword_id uuid not null references public.ai_place_keywords(id) on delete cascade,
  collection_run_id uuid not null references public.ai_place_collection_runs(id) on delete cascade,
  snapshot_id uuid not null references public.ai_place_snapshots(id) on delete cascade,
  place_id text not null,
  rank integer not null,
  evaluation_status text not null check (evaluation_status in ('COMPLETED', 'PARTIAL', 'FAILED')),
  ai_score numeric,
  category_scores_json jsonb not null default '{}'::jsonb,
  semantic_scores_json jsonb not null default '{}'::jsonb,
  profile_context_json jsonb not null default '{}'::jsonb,
  evaluation_result_json jsonb not null default '{}'::jsonb,
  prompt_version text not null,
  model_name text not null,
  error_message text,
  created_at timestamptz not null default now(),
  unique (job_id, place_id)
);

create index if not exists ai_place_harness_jobs_status_idx
  on public.ai_place_harness_jobs(status, created_at);

create index if not exists ai_place_harness_scores_job_rank_idx
  on public.ai_place_harness_place_scores(job_id, rank);

create or replace function public.set_ai_place_harness_jobs_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_ai_place_harness_jobs_updated_at on public.ai_place_harness_jobs;
create trigger set_ai_place_harness_jobs_updated_at
before update on public.ai_place_harness_jobs
for each row execute function public.set_ai_place_harness_jobs_updated_at();
