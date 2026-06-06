import { getPostgresPool } from '@/lib/postgres/server'
import type {
  PlaceRankingChange,
  PlaceRankingSnapshotHistoryItem,
  PlaceRankingSnapshotRecord,
  PlaceRankingSnapshotSummary,
} from '../types'

type PlaceRankingSnapshotRow = {
  keyword: string
  snapshot_date: string
  place_id: string
  rank: number
  name: string
  category: string | null
  image_url: string | null
  address: string | null
}

type PlaceRankingSnapshotInsert = {
  keyword: string
  snapshot_date: string
  place_id: string
  rank: number
  name: string
  category: string | null
  image_url: string | null
  address: string | null
}

type RankingRow = {
  place_id: string
  rank: number
}

export async function savePlaceRankingSnapshots({
  keyword,
  snapshotDate,
  records,
}: {
  keyword: string
  snapshotDate: string
  records: PlaceRankingSnapshotRecord[]
}): Promise<PlaceRankingSnapshotSummary> {
  if (records.length === 0) {
    throw new Error('저장할 순위 데이터가 없습니다.')
  }

  const rows: PlaceRankingSnapshotInsert[] = records.map((record) => ({
    keyword,
    snapshot_date: snapshotDate,
    place_id: record.placeId,
    rank: record.rank,
    name: record.name,
    category: record.category ?? null,
    image_url: record.imageUrl ?? null,
    address: record.address ?? null,
  }))

  const pool = getPostgresPool()
  const client = await pool.connect()
  const values: unknown[] = []
  const placeholders = rows.map((row, rowIndex) => {
    const offset = rowIndex * 8

    values.push(
      row.keyword,
      row.snapshot_date,
      row.place_id,
      row.rank,
      row.name,
      row.category,
      row.image_url,
      row.address,
    )

    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
  })

  try {
    await client.query('begin')
    await client.query(
      `
        delete from public.place_ranking_snapshots
        where keyword = $1
          and snapshot_date = $2::date
      `,
      [keyword, snapshotDate],
    )
    await client.query(
      `
        insert into public.place_ranking_snapshots (
          keyword,
          snapshot_date,
          place_id,
          rank,
          name,
          category,
          image_url,
          address
        )
        values ${placeholders.join(', ')}
      `,
      values,
    )
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }

  return getPlaceRankingSnapshotSummary({ keyword, snapshotDate, placeIds: records.map((record) => record.placeId) })
}

export async function getPlaceRankingSnapshotSummary({
  keyword,
  snapshotDate,
  placeIds,
}: {
  keyword: string
  snapshotDate: string
  placeIds: string[]
}): Promise<PlaceRankingSnapshotSummary> {
  const pool = getPostgresPool()
  const previousDateResult = await pool.query<{ snapshot_date: string }>(
    `
      select snapshot_date::text
      from public.place_ranking_snapshots
      where keyword = $1
        and snapshot_date < $2::date
      order by snapshot_date desc
      limit 1
    `,
    [keyword, snapshotDate],
  )

  const previousSnapshotDate = previousDateResult.rows[0]?.snapshot_date ?? null
  const changesByPlaceId: Record<string, PlaceRankingChange | null> = {}

  placeIds.forEach((placeId) => {
    changesByPlaceId[placeId] = null
  })

  if (!previousSnapshotDate || placeIds.length === 0) {
    return {
      keyword,
      snapshotDate,
      totalSaved: placeIds.length,
      previousSnapshotDate,
      changesByPlaceId,
    }
  }

  const [currentResult, previousResult] = await Promise.all([
    pool.query<RankingRow>(
      `
        select place_id, rank
        from public.place_ranking_snapshots
        where keyword = $1
          and snapshot_date = $2::date
          and place_id = any($3::text[])
      `,
      [keyword, snapshotDate, placeIds],
    ),
    pool.query<RankingRow>(
      `
        select place_id, rank
        from public.place_ranking_snapshots
        where keyword = $1
          and snapshot_date = $2::date
          and place_id = any($3::text[])
      `,
      [keyword, previousSnapshotDate, placeIds],
    ),
  ])

  const previousRanks = new Map(
    previousResult.rows.map((row) => [String(row.place_id), Number(row.rank)]),
  )

  currentResult.rows.forEach((row) => {
    const placeId = String(row.place_id)
    const currentRank = Number(row.rank)
    const previousRank = previousRanks.get(placeId)

    if (!previousRank) {
      changesByPlaceId[placeId] = null
      return
    }

    const delta = previousRank - currentRank

    changesByPlaceId[placeId] = {
      previousRank,
      delta: Math.abs(delta),
      direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
      comparedDate: previousSnapshotDate,
    }
  })

  return {
    keyword,
    snapshotDate,
    totalSaved: placeIds.length,
    previousSnapshotDate,
    changesByPlaceId,
  }
}

export async function getPlaceRankingSnapshotHistory({
  keyword,
  placeId,
  limit = 30,
}: {
  keyword: string
  placeId: string
  limit?: number
}): Promise<PlaceRankingSnapshotHistoryItem[]> {
  const pool = getPostgresPool()
  const result = await pool.query<Pick<PlaceRankingSnapshotRow, 'snapshot_date' | 'rank'>>(
    `
      select snapshot_date::text, rank
      from public.place_ranking_snapshots
      where keyword = $1
        and place_id = $2
      order by snapshot_date desc
      limit $3
    `,
    [keyword, placeId, limit],
  )

  return createHistoryWithChanges(result.rows)
}

function createHistoryWithChanges(
  rows: Pick<PlaceRankingSnapshotRow, 'snapshot_date' | 'rank'>[],
): PlaceRankingSnapshotHistoryItem[] {
  return rows.map((row, index) => {
    const previousRow = rows[index + 1]

    if (!previousRow) {
      return {
        snapshotDate: row.snapshot_date,
        rank: row.rank,
        change: null,
      }
    }

    const delta = previousRow.rank - row.rank

    return {
      snapshotDate: row.snapshot_date,
      rank: row.rank,
      change: {
        previousRank: previousRow.rank,
        delta: Math.abs(delta),
        direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
        comparedDate: previousRow.snapshot_date,
      },
    }
  })
}
