export const NAVER_REVIEW_TYPES = {
  VISITOR: 'visitor',
  BLOG: 'blog',
} as const

export type NaverReviewType = (typeof NAVER_REVIEW_TYPES)[keyof typeof NAVER_REVIEW_TYPES]

export type NaverReviewRequestType = NaverReviewType | 'all'

export type NaverReviewSource = 'official-api' | 'embedded-json' | 'internal-api' | 'html'

export type NaverReviewWarningCode =
  | 'INVALID_PLACE_ID'
  | 'INVALID_REVIEW_TYPE'
  | 'NAVER_REQUEST_TIMEOUT'
  | 'NAVER_REQUEST_FORBIDDEN'
  | 'NAVER_REQUEST_RATE_LIMITED'
  | 'NAVER_RESPONSE_INVALID'
  | 'NAVER_REVIEW_COUNT_NOT_FOUND'
  | 'NAVER_REVIEW_ITEMS_NOT_FOUND'
  | 'NAVER_STRUCTURE_CHANGED'
  | 'NAVER_REVIEW_DETAIL_UNAVAILABLE'

export type NaverReviewItem = {
  reviewId?: string
  title?: string | null
  content?: string | null
  authorName?: string | null
  writtenAt?: string | null
  rating?: number | null
  keywords?: string[]
  imageUrls?: string[]
  sourceUrl?: string | null
}

export type NaverReviewSummary = {
  type: NaverReviewType
  count: number | null
  sourceUrl: string
  items?: NaverReviewItem[]
  nextCursor?: string | null
  hasMore?: boolean
}

export type NaverPlaceReviewResponse = {
  placeId: string
  fetchedAt: string
  source: NaverReviewSource
  cached: boolean
  visitor?: NaverReviewSummary
  blog?: NaverReviewSummary
  warnings: NaverReviewWarningCode[]
}

export type NaverPlaceReviewBatchItem = {
  placeId: string
  visitorCount: number | null
  blogCount: number | null
  fetchedAt: string
  cached: boolean
  warnings: NaverReviewWarningCode[]
}

export type PlaceReviewMetrics = {
  visitorReviewCount: number | null
  blogReviewCount: number | null
  totalReviewCount: number | null
  visitorReviewRatio: number | null
  blogReviewRatio: number | null
  fetchedAt: string
}
