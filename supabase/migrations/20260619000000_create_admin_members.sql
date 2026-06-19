create table if not exists public.admin_members (
  id bigserial primary key,
  username text not null,
  password_salt text not null,
  password_hash text not null,
  nickname text not null,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (username)
);

create index if not exists admin_members_active_username_idx
  on public.admin_members (username)
  where is_deleted = false;

create or replace function public.set_admin_members_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_admin_members_updated_at
  on public.admin_members;

create trigger set_admin_members_updated_at
before update on public.admin_members
for each row
execute function public.set_admin_members_updated_at();

insert into public.admin_members (
  username,
  password_salt,
  password_hash,
  nickname
) values (
  'admin',
  'aiva-admin-2026-06-19',
  '7861d862c31a9798a4a52d35ec4383cda998369a568f68dbc4ea8c4a05dd5ff77c553954492a8aec0793ee8bb7cf9be9bf41fcf0a41008ac2e52561c1b481533',
  '관리자'
)
on conflict (username) do update
set
  password_salt = excluded.password_salt,
  password_hash = excluded.password_hash,
  nickname = excluded.nickname,
  is_deleted = false,
  deleted_at = null,
  updated_at = now();
