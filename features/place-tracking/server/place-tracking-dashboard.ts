import type { PlaceRankingItem } from '@/features/place-ranking/types'
import { attachPreviousRankChanges } from '@/features/place-ranking/server/ranking-snapshot-service'
import { collectNaverPlaceRankings } from '@/features/place-ranking/server/naver-place-rankings'
import type {
  TrackingDashboardPlace,
  TrackingDashboardResponse,
  TrackedKeyword,
  TrackedPlace,
} from '../types'
import { listTrackedPlaces } from './place-tracking-repository'

type CreatePlaceTrackingDashboardOptions = {
  placeId?: number
}

export async function createPlaceTrackingDashboard({
  placeId,
}: CreatePlaceTrackingDashboardOptions = {}): Promise<TrackingDashboardResponse> {
  const allPlaces = await listTrackedPlaces()
  const places = placeId ? allPlaces.filter((place) => place.id === placeId) : allPlaces
  const keywords = Array.from(
    new Set(
      places
        .flatMap((place) => place.keywords)
        .map((keyword) => normalizeKeyword(keyword.keyword))
        .filter(Boolean),
    ),
  )
  const rankingByKeyword = new Map<string, Awaited<ReturnType<typeof collectKeywordRanking>>>()

  await Promise.all(
    keywords.map(async (keyword) => {
      rankingByKeyword.set(keyword, await collectKeywordRanking(keyword))
    }),
  )

  return {
    places: places.map((place) => toDashboardPlace(place, rankingByKeyword)),
    updatedAt: new Date().toISOString(),
  }
}

function toDashboardPlace(
  place: TrackedPlace,
  rankingByKeyword: Map<string, Awaited<ReturnType<typeof collectKeywordRanking>>>,
): TrackingDashboardPlace {
  return {
    id: place.id,
    naverPlaceId: place.naverPlaceId,
    placeName: place.placeName,
    placeUrl: place.placeUrl,
    keywords: place.keywords.map((keyword) => {
      const normalizedKeyword = normalizeKeyword(keyword.keyword)
      const ranking = rankingByKeyword.get(normalizedKeyword)
      const matchedItem = ranking?.items.find((item) => item.id === place.naverPlaceId)

      return toKeywordRank(keyword, matchedItem, ranking?.collectedAt)
    }),
  }
}

async function collectKeywordRanking(keyword: string) {
  const result = await collectNaverPlaceRankings({
    keyword,
    limit: 75,
  })

  try {
    return await attachPreviousRankChanges(result)
  } catch {
    return result
  }
}

function toKeywordRank(
  keyword: TrackedKeyword,
  matchedItem: PlaceRankingItem | undefined,
  collectedAt: string | undefined,
) {
  return {
    keywordId: keyword.id,
    keyword: keyword.keyword,
    rank: matchedItem?.rank ?? null,
    rankChange: matchedItem?.rankChange ?? null,
    status: matchedItem ? 'found' as const : 'not_found' as const,
    matchedPlaceName: matchedItem?.name,
    collectedAt,
  }
}

function normalizeKeyword(keyword: string) {
  return keyword.trim().replace(/\s+/g, ' ')
}
