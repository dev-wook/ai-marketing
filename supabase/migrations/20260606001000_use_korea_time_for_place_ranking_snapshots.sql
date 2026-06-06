alter table public.place_ranking_snapshots
  alter column created_at type timestamp without time zone
    using created_at at time zone 'Asia/Seoul',
  alter column updated_at type timestamp without time zone
    using updated_at at time zone 'Asia/Seoul';

alter table public.place_ranking_snapshots
  alter column created_at set default timezone('Asia/Seoul', now()),
  alter column updated_at set default timezone('Asia/Seoul', now());

create or replace function public.set_place_ranking_snapshots_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('Asia/Seoul', now());
  return new;
end;
$$;
