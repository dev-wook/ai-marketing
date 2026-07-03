create table if not exists public.ai_image_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  is_active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_image_design_models (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.ai_image_categories(id) on delete cascade,
  code text not null,
  name text not null,
  description text not null default '',
  thumbnail_path text not null,
  prompt_key text not null,
  version integer not null default 1,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, code)
);

create table if not exists public.ai_image_generations (
  id uuid primary key default gen_random_uuid(),
  member_id bigint references public.admin_members(id) on delete set null,
  category_id uuid references public.ai_image_categories(id) on delete set null,
  design_model_id uuid references public.ai_image_design_models(id) on delete set null,
  design_model_version integer not null,
  source_image_path text,
  result_image_path text,
  status text not null check (status in ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
  provider text not null default 'gemini',
  provider_model text,
  prompt_snapshot jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ai_image_generations_member_created_idx
  on public.ai_image_generations (member_id, created_at desc);

insert into public.ai_image_categories (
  code,
  name,
  description,
  is_active,
  sort_order
) values
  ('eyelash', '속눈썹', '속눈썹 디자인 시뮬레이션', true, 10),
  ('eyebrow', '눈썹', '추후 제공 예정', false, 20),
  ('eyeline', '아이라인', '추후 제공 예정', false, 30),
  ('lip', '입술', '추후 제공 예정', false, 40),
  ('hairline', '헤어라인', '추후 제공 예정', false, 50)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.ai_image_design_models (
  category_id,
  code,
  name,
  description,
  thumbnail_path,
  prompt_key,
  sort_order
)
select
  category.id,
  model.code,
  model.name,
  model.description,
  model.thumbnail_path,
  model.prompt_key,
  model.sort_order
from public.ai_image_categories category
cross join (
  values
    (
      'model-a',
      '모델 A',
      '한쪽 눈과 눈썹을 크게 담고 흰 장갑이 함께 보이는 밝은 클로즈업 모델',
      '/ai-image-generation/clinical-lift.jpg',
      'model-a',
      10
    ),
    (
      'model-b',
      '모델 B',
      '브라운 롱헤어와 부드러운 사선 얼굴 구도가 돋보이는 인물 모델',
      '/ai-image-generation/sharp-curl.jpg',
      'model-b',
      20
    ),
    (
      'model-c',
      '모델 C',
      '시스루뱅 헤어와 정면에 가까운 자연스러운 얼굴 구도의 인물 모델',
      '/ai-image-generation/idol-lash.jpg',
      'model-c',
      30
    )
) as model(code, name, description, thumbnail_path, prompt_key, sort_order)
where category.code = 'eyelash'
on conflict (category_id, code) do update set
  name = excluded.name,
  description = excluded.description,
  thumbnail_path = excluded.thumbnail_path,
  prompt_key = excluded.prompt_key,
  sort_order = excluded.sort_order,
  updated_at = now();
