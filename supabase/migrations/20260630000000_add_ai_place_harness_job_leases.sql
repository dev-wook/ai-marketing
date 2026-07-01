alter table public.ai_place_harness_jobs
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists processing_stage text not null default 'QUEUED'
    check (processing_stage in ('QUEUED', 'EVALUATING_PLACES', 'FINALIZING_PROFILE', 'COMPLETED'));

create index if not exists ai_place_harness_jobs_worker_poll_idx
  on public.ai_place_harness_jobs(status, next_attempt_at, lease_expires_at, created_at);
