alter table public.place_ranking_batch_keywords
  alter column created_at set default now(),
  alter column updated_at set default now();

create or replace function public.set_place_ranking_batch_keywords_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
