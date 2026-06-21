import type { PlaceRankingItem } from '@/features/place-ranking/types'

export type AiPlaceDiagnosisRequest = {
  placeId?: string
  placeUrl?: string
  keyword?: string
  comparisonLimit?: number
  placeIntroduction?: string
  menuItemsText?: string
}

export type AiPlaceDiagnosisPlaceSearchRequest = {
  query?: string
}

export type AiPlaceDiagnosisPlaceSearchItem = {
  id: string
  name: string
  category: string
  address: string
  imageUrl?: string
}

export type AiPlaceDiagnosisPlaceSearchResponse = {
  query: string
  collectedAt: string
  items: AiPlaceDiagnosisPlaceSearchItem[]
}

export type AiPlaceDiagnosisScoreKey =
  | 'intentFit'
  | 'serviceCompleteness'
  | 'reviewTrust'
  | 'contentRichness'
  | 'conversionReadiness'
  | 'localRelevance'
  | 'competitiveDifferentiation'

export type AiPlaceDiagnosisScore = {
  key: AiPlaceDiagnosisScoreKey
  label: string
  score: number
  maxScore: number
  reason: string
}

export type AiPlaceDiagnosisTarget = {
  placeId: string
  name: string
  rank: number
  category: string
  address: string
  imageUrl?: string
  metrics: AiPlaceDiagnosisMetrics
  profile: AiPlaceDiagnosisPlaceProfile
  manualContext: {
    hasIntroduction: boolean
    hasMenuItemsText: boolean
  }
  dataSources: AiPlaceDiagnosisDataSource[]
  bookingProducts: AiPlaceDiagnosisBookingProduct[]
}

export type AiPlaceDiagnosisPlaceProfile = {
  introduction: string
  promotion: string
  locationGuide: string
  amenities: string[]
  websiteUrl?: string
  phone?: string
  imageUrls: string[]
  nPayStatus?: string
}

export type AiPlaceDiagnosisMetrics = {
  totalReviewCount: number
  blogCafeReviewCount: number
  bookingReviewCount: number
  imageCount: number
  hashtagCount: number
  reviewSnippetCount: number
  hasBooking: boolean
  hasTalktalk: boolean
  hasCoupon: boolean
  hasNPay: boolean
}

export type AiPlaceDiagnosisDataSource = {
  key: string
  label: string
  status: 'collected' | 'partial' | 'missing' | 'failed'
  count?: number
  message: string
}

export type AiPlaceDiagnosisBookingProduct = {
  id: string
  name: string
  description: string
  price: number | null
  minPrice: number | null
  maxPrice: number | null
  minBookingCount: number
  maxBookingCount: number
  minBookingTime: number | null
  maxBookingTime: number | null
  inferredDurationMinutes: number | null
  totalSlots: number
  availableSlots: number
  bookedSlots: number
  firstAvailableTime: string | null
  timeUnitCode?: string
  precautions: string[]
  extraDescriptions: string[]
  imageUrls: string[]
}

export type AiPlaceDiagnosisCompetitorSummary = {
  comparedCount: number
  averageRank: number
  averageReviewCount: number
  averageBlogReviewCount: number
  averageImageCount: number
  bookingEnabledRate: number
  couponEnabledRate: number
  talktalkEnabledRate: number
  topPlaces: Array<Pick<PlaceRankingItem, 'id' | 'name' | 'rank' | 'category'>>
}

export type AiPlaceDiagnosisResponse = {
  keyword: string
  collectedAt: string
  totalScore: number
  grade: 'A' | 'B' | 'C' | 'D'
  scoreNotice: string
  target: AiPlaceDiagnosisTarget
  competitorSummary: AiPlaceDiagnosisCompetitorSummary
  scores: AiPlaceDiagnosisScore[]
  topGaps: string[]
  strengths: string[]
  priorities: string[]
  introductionExample: string
  menuDescriptionExample: string
  reviewKeywords: string[]
  imageContentActions: string[]
  bookingProductActions: string[]
}
