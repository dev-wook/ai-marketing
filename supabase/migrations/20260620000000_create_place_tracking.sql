create table if not exists public.place_tracking_places (
  id bigserial primary key,
  naver_place_id text not null,
  place_name text not null,
  place_url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint place_tracking_places_naver_place_id_key unique (naver_place_id)
);

create table if not exists public.place_tracking_keywords (
  id bigserial primary key,
  place_id bigint not null references public.place_tracking_places(id) on delete cascade,
  keyword text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint place_tracking_keywords_place_id_keyword_key unique (place_id, keyword)
);

create or replace function public.update_place_tracking_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_place_tracking_places_updated_at on public.place_tracking_places;
create trigger update_place_tracking_places_updated_at
before update on public.place_tracking_places
for each row execute function public.update_place_tracking_updated_at();

drop trigger if exists update_place_tracking_keywords_updated_at on public.place_tracking_keywords;
create trigger update_place_tracking_keywords_updated_at
before update on public.place_tracking_keywords
for each row execute function public.update_place_tracking_updated_at();

create index if not exists place_tracking_keywords_place_id_idx
  on public.place_tracking_keywords (place_id);

create index if not exists place_tracking_keywords_keyword_idx
  on public.place_tracking_keywords (keyword);
