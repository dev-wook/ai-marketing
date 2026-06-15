create table if not exists public.place_ranking_batch_keywords (
  id bigserial primary key,
  keyword text not null,
  is_active boolean not null default true,
  last_run_at timestamptz,
  last_run_status text,
  last_run_message text,
  created_at timestamptz not null default timezone('Asia/Seoul', now()),
  updated_at timestamptz not null default timezone('Asia/Seoul', now()),
  unique (keyword)
);

create index if not exists place_ranking_batch_keywords_active_idx
  on public.place_ranking_batch_keywords (is_active, keyword);

create or replace function public.set_place_ranking_batch_keywords_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('Asia/Seoul', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_place_ranking_batch_keywords_updated_at
  on public.place_ranking_batch_keywords;

create trigger set_place_ranking_batch_keywords_updated_at
before update on public.place_ranking_batch_keywords
for each row
execute function public.set_place_ranking_batch_keywords_updated_at();
