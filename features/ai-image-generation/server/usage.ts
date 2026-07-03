import { getPostgresPool } from '@/lib/postgres/server'
import type { AiImageDesignModelId, AiImageUsageResponse } from '../types'

const defaultMonthlyBudgetKrw = 15_000
const defaultUsdKrwRate = 1_400
const estimatedUsdPerGeneration: Record<string, number> = {
  'vertex-ai/gemini-3.1-flash-image': 0.07,
  'vertex-ai/gemini-2.5-flash-image': 0.042,
  'gemini-developer/gemini-3.1-flash-lite-image': 0.036,
  'gemini-developer/gemini-2.5-flash-image': 0.042,
}
const billingConsoleUrl = 'https://console.cloud.google.com/billing'

type UsageSummaryRow = {
  generation_count: string | number
  estimated_cost_usd: string | number
  primary_count: string | number
  fallback_count: string | number
}

export async function recordSuccessfulGeneration(input: {
  memberId: number
  designModelId: AiImageDesignModelId
  provider: 'vertex-ai' | 'gemini-developer'
  providerModel: string
}) {
  const estimatedCostUsd =
    estimatedUsdPerGeneration[`${input.provider}/${input.providerModel}`] ?? 0
  const pool = getPostgresPool()

  await pool.query(
    `
      insert into public.ai_image_generations (
        member_id,
        category_id,
        design_model_id,
        design_model_version,
        status,
        provider,
        provider_model,
        prompt_snapshot,
        estimated_cost_usd,
        completed_at
      )
      select
        $1,
        category.id,
        design_model.id,
        design_model.version,
        'SUCCEEDED',
        $3,
        $4,
        jsonb_build_object('designModelId', $2::text),
        $5,
        now()
      from public.ai_image_categories category
      join public.ai_image_design_models design_model
        on design_model.category_id = category.id
       and design_model.code = $2
      where category.code = 'eyelash'
      limit 1
    `,
    [
      input.memberId,
      input.designModelId,
      input.provider,
      input.providerModel,
      estimatedCostUsd,
    ],
  )
}

export async function getMonthlyUsage(memberId: number): Promise<AiImageUsageResponse> {
  const pool = getPostgresPool()
  const result = await pool.query<UsageSummaryRow>(
    `
      select
        count(*)::integer as generation_count,
        coalesce(sum(estimated_cost_usd), 0)::numeric as estimated_cost_usd,
        count(*) filter (where provider_model like 'gemini-3.1%')::integer
          as primary_count,
        count(*) filter (where provider_model like 'gemini-2.5%')::integer
          as fallback_count
      from public.ai_image_generations
      where member_id = $1
        and status = 'SUCCEEDED'
        and created_at >= date_trunc('month', now() at time zone 'Asia/Seoul')
          at time zone 'Asia/Seoul'
        and created_at < (
          date_trunc('month', now() at time zone 'Asia/Seoul') + interval '1 month'
        ) at time zone 'Asia/Seoul'
    `,
    [memberId],
  )
  const row = result.rows[0]
  const generationCount = Number(row?.generation_count ?? 0)
  const estimatedCostUsd = Number(row?.estimated_cost_usd ?? 0)
  const usdKrwRate = getPositiveNumber(process.env.GEMINI_USD_KRW_RATE, defaultUsdKrwRate)
  const monthlyBudgetKrw = getPositiveNumber(
    process.env.GEMINI_MONTHLY_BUDGET_KRW,
    defaultMonthlyBudgetKrw,
  )
  const estimatedCostKrw = Math.round(estimatedCostUsd * usdKrwRate)

  return {
    trackingAvailable: true,
    periodLabel: new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'long',
    }).format(new Date()),
    generationCount,
    estimatedCostKrw,
    monthlyBudgetKrw,
    usageRate: Math.min(100, (estimatedCostKrw / monthlyBudgetKrw) * 100),
    modelUsage: [
      { model: 'primary', count: Number(row?.primary_count ?? 0) },
      { model: 'fallback', count: Number(row?.fallback_count ?? 0) },
    ],
    billingConsoleUrl,
  }
}

function getPositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
