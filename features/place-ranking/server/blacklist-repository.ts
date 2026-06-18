import { getPostgresPool } from '@/lib/postgres/server'
import type {
  PlaceRankingBlacklistEntry,
  PlaceRankingBlacklistGroup,
} from '../types'

type PlaceRankingBlacklistRow = {
  id: number
  keyword: string
  place_key: string
  place_id: string | null
  place_name: string
  category: string | null
  created_at: string
  updated_at: string
}

export async function listPlaceRankingBlacklistEntries({
  keyword,
}: {
  keyword?: string
} = {}): Promise<PlaceRankingBlacklistEntry[]> {
  const pool = getPostgresPool()
  const result = await pool.query<PlaceRankingBlacklistRow>(
    `
      select
        id,
        keyword,
        place_key,
        place_id,
        place_name,
        category,
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at,
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as updated_at
      from public.place_ranking_blacklist
      where ($1::text is null or keyword = $1)
      order by keyword asc, created_at desc, id desc
    `,
    [keyword?.trim() || null],
  )

  return result.rows.map(toBlacklistEntry)
}

export async function listPlaceRankingBlacklistGroups(): Promise<PlaceRankingBlacklistGroup[]> {
  const entries = await listPlaceRankingBlacklistEntries()
  const groupMap = new Map<string, PlaceRankingBlacklistEntry[]>()

  entries.forEach((entry) => {
    const groupEntries = groupMap.get(entry.keyword) ?? []

    groupEntries.push(entry)
    groupMap.set(entry.keyword, groupEntries)
  })

  return Array.from(groupMap.entries()).map(([keyword, groupEntries]) => ({
    keyword,
    count: groupEntries.length,
    entries: groupEntries,
  }))
}

export async function upsertPlaceRankingBlacklistEntry({
  keyword,
  placeKey,
  placeId,
  placeName,
  category,
}: {
  keyword: string
  placeKey: string
  placeId?: string | null
  placeName: string
  category?: string | null
}): Promise<PlaceRankingBlacklistEntry> {
  const pool = getPostgresPool()
  const result = await pool.query<PlaceRankingBlacklistRow>(
    `
      insert into public.place_ranking_blacklist (
        keyword,
        place_key,
        place_id,
        place_name,
        category
      )
      values ($1, $2, $3, $4, $5)
      on conflict (keyword, place_key)
      do update set
        place_id = excluded.place_id,
        place_name = excluded.place_name,
        category = excluded.category,
        updated_at = now()
      returning
        id,
        keyword,
        place_key,
        place_id,
        place_name,
        category,
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at,
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as updated_at
    `,
    [
      keyword.trim(),
      placeKey,
      placeId?.trim() || null,
      placeName.trim(),
      category?.trim() || null,
    ],
  )

  return toBlacklistEntry(result.rows[0])
}

export async function deletePlaceRankingBlacklistEntry(id: number) {
  const pool = getPostgresPool()

  await pool.query(
    `
      delete from public.place_ranking_blacklist
      where id = $1
    `,
    [id],
  )
}

export async function deletePlaceRankingBlacklistEntryByKey({
  keyword,
  placeKey,
}: {
  keyword: string
  placeKey: string
}) {
  const pool = getPostgresPool()

  await pool.query(
    `
      delete from public.place_ranking_blacklist
      where keyword = $1
        and place_key = $2
    `,
    [keyword.trim(), placeKey],
  )
}

function toBlacklistEntry(row: PlaceRankingBlacklistRow): PlaceRankingBlacklistEntry {
  return {
    id: Number(row.id),
    keyword: row.keyword,
    placeKey: row.place_key,
    placeId: row.place_id,
    placeName: row.place_name,
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
