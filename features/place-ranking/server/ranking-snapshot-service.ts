import type {
  PlaceRankingItem,
  PlaceRankingSnapshotRecord,
  PlaceRankingSnapshotSummary,
} from '../types'
import {
  getPlaceRankingSnapshotHistory,
  getPlaceRankingSnapshotSummary,
  savePlaceRankingSnapshots,
} from './ranking-snapshot-repository'

const maxSnapshotItems = 300

export async function recordPlaceRankingSnapshots({
  keyword,
  snapshotDate = createTodayDate(),
  items,
}: {
  keyword: string
  snapshotDate?: string
  items: PlaceRankingItem[]
}) {
  const safeKeyword = normalizeKeyword(keyword)

  if (!safeKeyword) {
    throw new Error('기록할 키워드를 입력해주세요.')
  }

  const recordsByPlaceId = new Map<string, PlaceRankingSnapshotRecord>()

  items
    .slice(0, maxSnapshotItems)
    .map((item) => toSnapshotRecord({ keyword: safeKeyword, snapshotDate, item }))
    .filter((record): record is PlaceRankingSnapshotRecord => Boolean(record))
    .forEach((record) => {
      if (!recordsByPlaceId.has(record.placeId)) {
        recordsByPlaceId.set(record.placeId, record)
      }
    })

  const records = Array.from(recordsByPlaceId.values())

  return savePlaceRankingSnapshots({
    keyword: safeKeyword,
    snapshotDate,
    records,
  })
}

export async function readPlaceRankingSnapshotSummary({
  keyword,
  snapshotDate = createTodayDate(),
  placeIds,
}: {
  keyword: string
  snapshotDate?: string
  placeIds: string[]
}): Promise<PlaceRankingSnapshotSummary> {
  const safeKeyword = normalizeKeyword(keyword)

  if (!safeKeyword) {
    throw new Error('조회할 키워드를 입력해주세요.')
  }

  return getPlaceRankingSnapshotSummary({
    keyword: safeKeyword,
    snapshotDate,
    placeIds,
  })
}

export async function readPlaceRankingSnapshotHistory({
  keyword,
  placeId,
}: {
  keyword: string
  placeId: string
}) {
  const safeKeyword = normalizeKeyword(keyword)
  const safePlaceId = placeId.trim()

  if (!safeKeyword || !safePlaceId) {
    throw new Error('순위 이력을 조회할 플레이스 정보가 부족합니다.')
  }

  return getPlaceRankingSnapshotHistory({
    keyword: safeKeyword,
    placeId: safePlaceId,
  })
}

function toSnapshotRecord({
  keyword,
  snapshotDate,
  item,
}: {
  keyword: string
  snapshotDate: string
  item: PlaceRankingItem
}): PlaceRankingSnapshotRecord | null {
  if (!item.id || !item.name || !item.rank) {
    return null
  }

  return {
    keyword,
    snapshotDate,
    placeId: item.id,
    rank: item.rank,
    name: item.name,
    category: item.category || undefined,
    imageUrl: item.images.mainImageUrl,
    address:
      item.location.commonAddress ||
      item.location.address ||
      item.location.roadAddress ||
      item.location.fullAddress ||
      undefined,
  }
}

function normalizeKeyword(keyword: string) {
  return keyword.trim().replace(/\s+/g, ' ')
}

function createTodayDate() {
  return new Date().toLocaleDateString('sv-SE', {
    timeZone: 'Asia/Seoul',
  })
}
