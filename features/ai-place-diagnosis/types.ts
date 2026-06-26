import type { PlaceRankingItem } from '@/features/place-ranking/types'
import type { PlaceReviewMetrics } from '@/features/naver-place-reviews/types'

export type AiPlaceDiagnosisRequest = {
  placeId?: string
  placeUrl?: string
  keyword?: string
  comparisonLimit?: number
  fallbackPlace?: AiPlaceDiagnosisPlaceSearchItem
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
  | 'intentAndService'
  | 'serviceInformation'
  | 'localEntity'
  | 'reviewTrust'
  | 'contentRichness'
  | 'conversion'
  | 'differentiation'

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
  reviewMetrics: PlaceReviewMetrics
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
  detailUrl?: string
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
  treatmentMenuCategories: AiPlaceDiagnosisTreatmentMenuCategory[]
}

export type AiPlaceDiagnosisTreatmentMenuCategory = {
  id: string
  name: string
  categoryTypeCode: string
  selectionTypeCode: string
  menus: AiPlaceDiagnosisTreatmentMenu[]
}

export type AiPlaceDiagnosisTreatmentMenu = {
  id: string
  name: string
  description: string
  normalPrice: number | null
  price: number | null
  priceDescription: string
  discountRate: number | null
  serviceDurationMinutes: number | null
  isSoldOut: boolean
  isFree: boolean
}

export type AiPlaceFieldStatus = 'PRESENT' | 'ABSENT' | 'UNAVAILABLE' | 'ERROR'

export type AiPlaceFieldStatusMap = Record<string, AiPlaceFieldStatus>

export type AiPlaceNormalizedSnapshot = {
  placeId: string
  name: string
  category: string
  address: string
  imageUrl?: string
  profile: AiPlaceDiagnosisPlaceProfile
  metrics: AiPlaceDiagnosisMetrics
  bookingProducts: AiPlaceDiagnosisBookingProduct[]
  reviewSnippets: string[]
  reviewImages: string[]
  imageUrls: string[]
  hashtags: string[]
  options: string[]
  conversion: {
    hasBooking: boolean
    hasTalktalk: boolean
    hasCoupon: boolean
    couponCount: number
    hasNPay: boolean
    hasPhone: boolean
    hasRoute: boolean
    hasWebsite: boolean
    hasInstagram: boolean
  }
}

export type AiPlaceFeatureSet = {
  review: {
    visitorReviewCount: number
    blogReviewCount: number
    bookingReviewCount: number
    reviewSnippetTexts: string[]
    reviewSnippetKeywordMentions: number
    reviewSnippetSpecificityScore: number
    reviewImageCount: number
  }
  service: {
    hasIntroduction: boolean
    introductionLength: number
    hasPromotion: boolean
    promotionLength: number
    bookingProductCount: number
    productDescriptionCoverage: number
    productAverageDescriptionLength: number
    priceCoverage: number
    durationCoverage: number
    precautionCoverage: number
    productImageCount: number
  }
  local: {
    hasAddress: boolean
    hasLocationGuide: boolean
    locationGuideLength: number
    keywordRegionMentioned: boolean
    hasRoute: boolean
  }
  content: {
    imageCount: number
    imageUrlCount: number
    hashtagCount: number
    optionCount: number
    hasWebsite: boolean
    hasInstagram: boolean
  }
  conversion: AiPlaceNormalizedSnapshot['conversion'] & {
    bookingProductCount: number
    bookingPolicyNoticeCount: number
    bookingPolicyDescriptionCount: number
  }
}

export type AiPlaceBenchmarkProfileSummary = {
  id?: string
  status: 'ACTIVE' | 'DRAFT' | 'SUPERSEDED' | 'FAILED' | 'DEFAULT'
  profileVersion: string
  rubricVersion: string
  algorithmVersion: string
  promptVersion?: string
  modelName?: string
  dataConfidence: number
  windowStart?: string
  windowEnd?: string
  signalSummary: {
    strongSignals: string[]
    weakSignals: string[]
    newSignals: string[]
    diagnosisHints: string[]
    calibrationHints?: string[]
  }
  statistics?: unknown
}

export type AiPlaceDiagnosisScoreBreakdown = {
  absolute: number
  dataConfidence: number
  benchmarkPercentile: number | null
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
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED'
  keyword: string
  collectedAt: string
  totalScore: number
  grade: 'A' | 'B' | 'C' | 'D'
  score: AiPlaceDiagnosisScoreBreakdown
  scoreNotice: string
  aiAnalysisAvailable: boolean
  target: AiPlaceDiagnosisTarget
  competitorSummary: AiPlaceDiagnosisCompetitorSummary
  benchmark: {
    profile: AiPlaceBenchmarkProfileSummary
    summary: string
  }
  scores: AiPlaceDiagnosisScore[]
  categories: Record<AiPlaceDiagnosisScoreKey, number>
  topGaps: string[]
  strengths: string[]
  priorities: string[]
  introductionExample: string
  menuDescriptionExample: string
  reviewKeywords: string[]
  imageContentActions: string[]
  bookingProductActions: string[]
  versions: {
    rubricVersion: string
    scorerVersion: string
    featureExtractorVersion: string
    promptVersion: string
    modelName: string
    benchmarkProfileId?: string
  }
}
