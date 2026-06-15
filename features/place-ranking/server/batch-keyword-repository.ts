import { getPostgresPool } from '@/lib/postgres/server'
import type { PlaceRankingBatchKeyword } from '../types'

type PlaceRankingBatchKeywordRow = {
  id: number
  keyword: string
  is_active: boolean
  last_run_at: string | null
  last_run_status: string | null
  last_run_message: string | null
  created_at: string
  updated_at: string
}

export async function listPlaceRankingBatchKeywords({
  activeOnly = false,
}: {
  activeOnly?: boolean
} = {}): Promise<PlaceRankingBatchKeyword[]> {
  const pool = getPostgresPool()
  const result = await pool.query<PlaceRankingBatchKeywordRow>(
    `
      select
        id,
        keyword,
        is_active,
        last_run_at::text,
        last_run_status,
        last_run_message,
        created_at::text,
        updated_at::text
      from public.place_ranking_batch_keywords
      where ($1::boolean = false or is_active = true)
      order by created_at desc, id desc
    `,
    [activeOnly],
  )

  return result.rows.map(toBatchKeyword)
}

export async function createPlaceRankingBatchKeyword(
  keyword: string,
): Promise<PlaceRankingBatchKeyword> {
  const pool = getPostgresPool()
  const result = await pool.query<PlaceRankingBatchKeywordRow>(
    `
      insert into public.place_ranking_batch_keywords (keyword, is_active)
      values ($1, true)
      on conflict (keyword)
      do update set
        is_active = true,
        updated_at = timezone('Asia/Seoul', now())
      returning
        id,
        keyword,
        is_active,
        last_run_at::text,
        last_run_status,
        last_run_message,
        created_at::text,
        updated_at::text
    `,
    [keyword],
  )

  return toBatchKeyword(result.rows[0])
}

export async function deletePlaceRankingBatchKeyword(id: number) {
  const pool = getPostgresPool()

  await pool.query(
    `
      delete from public.place_ranking_batch_keywords
      where id = $1
    `,
    [id],
  )
}

export async function updatePlaceRankingBatchKeywordRunStatus({
  id,
  status,
  message,
}: {
  id: number
  status: 'success' | 'failed'
  message: string
}) {
  const pool = getPostgresPool()

  await pool.query(
    `
      update public.place_ranking_batch_keywords
      set
        last_run_at = timezone('Asia/Seoul', now()),
        last_run_status = $2,
        last_run_message = $3
      where id = $1
    `,
    [id, status, message],
  )
}

function toBatchKeyword(row: PlaceRankingBatchKeywordRow): PlaceRankingBatchKeyword {
  return {
    id: Number(row.id),
    keyword: row.keyword,
    isActive: row.is_active,
    lastRunAt: row.last_run_at,
    lastRunStatus: row.last_run_status,
    lastRunMessage: row.last_run_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
