import type { PlaceRankingChange } from '@/features/place-ranking/types'

export type TrackedPlace = {
  id: number
  naverPlaceId: string
  placeName: string
  placeUrl: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  keywords: TrackedKeyword[]
}

export type TrackedKeyword = {
  id: number
  placeId: number
  keyword: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type PlacePreview = {
  naverPlaceId: string
  placeName: string
  placeUrl: string
}

export type TrackingKeywordRank = {
  keywordId: number
  keyword: string
  rank: number | null
  rankChange: PlaceRankingChange | null
  status: 'found' | 'not_found'
  matchedPlaceName?: string
  collectedAt?: string
}

export type TrackingDashboardPlace = {
  id: number
  naverPlaceId: string
  placeName: string
  placeUrl: string
  keywords: TrackingKeywordRank[]
}

export type TrackingDashboardResponse = {
  places: TrackingDashboardPlace[]
  updatedAt: string
}
