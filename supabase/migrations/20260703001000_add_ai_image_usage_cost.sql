alter table public.ai_image_generations
  add column if not exists estimated_cost_usd numeric(12, 6) not null default 0;

comment on column public.ai_image_generations.estimated_cost_usd is
  'Application-side estimated Gemini cost at generation time. Not the final Google invoice amount.';
