create table if not exists public.ai_place_harness_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_source text not null check (trigger_source in ('CRON', 'MANUAL')),
  status text not null default 'RUNNING' check (status in ('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED')),
  total_keywords integer not null default 0,
  queued_count integer not null default 0,
  skipped_count integer not null default 0,
  failure_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.ai_place_harness_jobs
  drop constraint if exists ai_place_harness_jobs_status_check;

alter table public.ai_place_harness_jobs
  add constraint ai_place_harness_jobs_status_check
  check (status in ('PENDING', 'RUNNING', 'RETRY_WAIT', 'COMPLETED', 'PARTIAL', 'FAILED'));

alter table public.ai_place_harness_jobs
  add column if not exists run_id uuid references public.ai_place_harness_runs(id) on delete set null,
  add column if not exists trigger_source text check (trigger_source in ('CRON', 'MANUAL')),
  add column if not exists retry_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz not null default now();

create unique index if not exists ai_place_harness_jobs_one_active_keyword_idx
  on public.ai_place_harness_jobs(keyword_id)
  where status in ('PENDING', 'RUNNING', 'RETRY_WAIT');

create index if not exists ai_place_harness_jobs_next_attempt_idx
  on public.ai_place_harness_jobs(status, next_attempt_at, created_at);
