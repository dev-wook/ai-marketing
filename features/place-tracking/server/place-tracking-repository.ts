import { getPostgresPool } from '@/lib/postgres/server'
import type { TrackedKeyword, TrackedPlace } from '../types'

type PlaceRow = {
  id: number | string
  naver_place_id: string
  place_name: string
  place_url: string
  is_active: boolean
  created_at: string
  updated_at: string
}

type KeywordRow = {
  id: number | string
  place_id: number | string
  keyword: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export async function listTrackedPlaces(): Promise<TrackedPlace[]> {
  const pool = getPostgresPool()
  const [placesResult, keywordsResult] = await Promise.all([
    pool.query<PlaceRow>(
      `
        select
          id,
          naver_place_id,
          place_name,
          place_url,
          is_active,
          to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at,
          to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as updated_at
        from public.place_tracking_places
        where is_active = true
        order by created_at desc, id desc
      `,
    ),
    pool.query<KeywordRow>(
      `
        select
          id,
          place_id,
          keyword,
          is_active,
          to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at,
          to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as updated_at
        from public.place_tracking_keywords
        where is_active = true
        order by created_at asc, id asc
      `,
    ),
  ])
  const keywordsByPlaceId = new Map<number, TrackedKeyword[]>()

  keywordsResult.rows.map(toKeyword).forEach((keyword) => {
    const keywords = keywordsByPlaceId.get(keyword.placeId) ?? []

    keywords.push(keyword)
    keywordsByPlaceId.set(keyword.placeId, keywords)
  })

  return placesResult.rows.map((row) => ({
    ...toPlace(row),
    keywords: keywordsByPlaceId.get(Number(row.id)) ?? [],
  }))
}

export async function upsertTrackedPlace({
  naverPlaceId,
  placeName,
  placeUrl,
}: {
  naverPlaceId: string
  placeName: string
  placeUrl: string
}): Promise<TrackedPlace> {
  const pool = getPostgresPool()
  const result = await pool.query<PlaceRow>(
    `
      insert into public.place_tracking_places (
        naver_place_id,
        place_name,
        place_url,
        is_active
      )
      values ($1, $2, $3, true)
      on conflict (naver_place_id)
      do update set
        place_name = excluded.place_name,
        place_url = excluded.place_url,
        is_active = true,
        updated_at = now()
      returning
        id,
        naver_place_id,
        place_name,
        place_url,
        is_active,
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at,
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as updated_at
    `,
    [naverPlaceId, placeName, placeUrl],
  )

  return {
    ...toPlace(result.rows[0]),
    keywords: [],
  }
}

export async function updateTrackedPlace({
  id,
  placeName,
}: {
  id: number
  placeName: string
}) {
  const pool = getPostgresPool()

  await pool.query(
    `
      update public.place_tracking_places
      set place_name = $2
      where id = $1
    `,
    [id, placeName],
  )
}

export async function deleteTrackedPlace(id: number) {
  const pool = getPostgresPool()

  await pool.query(
    `
      delete from public.place_tracking_places
      where id = $1
    `,
    [id],
  )
}

export async function createTrackedKeyword({
  placeId,
  keyword,
}: {
  placeId: number
  keyword: string
}): Promise<TrackedKeyword> {
  const pool = getPostgresPool()
  const result = await pool.query<KeywordRow>(
    `
      insert into public.place_tracking_keywords (place_id, keyword, is_active)
      values ($1, $2, true)
      on conflict (place_id, keyword)
      do update set
        is_active = true,
        updated_at = now()
      returning
        id,
        place_id,
        keyword,
        is_active,
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at,
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as updated_at
    `,
    [placeId, keyword],
  )

  return toKeyword(result.rows[0])
}

export async function updateTrackedKeyword({
  id,
  keyword,
}: {
  id: number
  keyword: string
}) {
  const pool = getPostgresPool()

  await pool.query(
    `
      update public.place_tracking_keywords
      set keyword = $2
      where id = $1
    `,
    [id, keyword],
  )
}

export async function deleteTrackedKeyword(id: number) {
  const pool = getPostgresPool()

  await pool.query(
    `
      delete from public.place_tracking_keywords
      where id = $1
    `,
    [id],
  )
}

function toPlace(row: PlaceRow): Omit<TrackedPlace, 'keywords'> {
  return {
    id: Number(row.id),
    naverPlaceId: row.naver_place_id,
    placeName: row.place_name,
    placeUrl: row.place_url,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toKeyword(row: KeywordRow): TrackedKeyword {
  return {
    id: Number(row.id),
    placeId: Number(row.place_id),
    keyword: row.keyword,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
