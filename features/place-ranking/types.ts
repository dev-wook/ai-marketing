export type PlaceRankingItem = PlaceCard & {
  rank: number
  displayRank: number
  rawText: string
  rankChange?: PlaceRankingChange | null
}

export type PlaceRankingChange = {
  previousRank: number
  delta: number
  direction: 'up' | 'down' | 'same'
  comparedDate: string
}

export type PlaceCard = {
  id: string
  name: string
  category: string
  ad: PlaceAd
  location: PlaceLocation
  businessHours: PlaceBusinessHours
  images: PlaceImages
  actions: PlaceActions
  benefits: PlaceBenefits
  options: string[]
  reviews: PlaceReviews
  badges: string[]
  hashtags: string[]
}

export type PlaceAd = {
  isAd: boolean
  adId?: string
  description?: string
}

export type PlaceLocation = {
  roadAddress?: string
  address?: string
  fullAddress?: string
  commonAddress?: string
  distance?: string
  longitude: number
  latitude: number
}

export type PlaceBusinessHours = {
  status?: string
  description?: string
  dayOff?: string | null
}

export type PlaceImages = {
  mainImageUrl?: string
  imageCount: number
  imageUrls: string[]
}

export type PlaceActions = {
  hasBooking: boolean
  bookingUrl?: string
  bookingBusinessId?: string
  talktalkUrl?: string
  phone?: string
  routeUrl?: string
}

export type PlaceBenefits = {
  hasCoupon: boolean
  couponCount: number
  coupons: PlaceCoupon[]
}

export type PlaceCoupon = {
  title: string
  type?: string
  useType?: string
  landingUrl?: string
}

export type PlaceReviews = {
  totalReviewCount: number
  blogCafeReviewCount: number
  bookingReviewCount: number
  snippets: PlaceReviewSnippet[]
  images: PlaceReviewImage[]
}

export type PlaceReviewSnippet = {
  reviewId: string
  text: string
}

export type PlaceReviewImage = {
  id: string
  reviewId: string
  imageUrl: string
  profileImageUrl?: string
  nickname?: string
}

export type RawNaverPlace = {
  id?: string
  name?: string
  category?: string
  adId?: string
  adDescription?: string
  x?: string
  y?: string
  distance?: string
  imageUrl?: string
  imageCount?: string | number
  imageUrls?: string[]
  roadAddress?: string
  address?: string
  fullAddress?: string
  commonAddress?: string
  hasBooking?: boolean
  bookingUrl?: string
  bookingBusinessId?: string
  talktalkUrl?: string
  phone?: string | null
  virtualPhone?: string | null
  routeUrl?: string
  options?: string
  blogCafeReviewCount?: string | number
  bookingReviewCount?: string | number
  totalReviewCount?: string | number
  newBusinessHours?: {
    status?: string
    description?: string
    dayOff?: string | null
    dayOffDescription?: string | null
  } | null
  coupon?: {
    total?: string | number
    promotions?: RawNaverCoupon[]
  } | null
  visitorReviews?: RawNaverVisitorReview[]
  visitorImages?: RawNaverVisitorImage[]
}

export type RawNaverCoupon = {
  title?: string
  type?: string
  couponUseType?: string
  couponLandingUrl?: string
}

export type RawNaverVisitorReview = {
  reviewId?: string
  review?: string
}

export type RawNaverVisitorImage = {
  id?: string
  reviewId?: string
  imageUrl?: string
  profileImageUrl?: string
  nickname?: string
}

export type PlaceRankingResponse = {
  keyword: string
  collectedAt: string
  requestedLimit: number
  totalCollected: number
  hasMore: boolean
  nextLimit: number | null
  source: 'live' | 'cache'
  items: PlaceRankingItem[]
}

export type PlaceRankingSnapshotRecord = {
  keyword: string
  snapshotDate: string
  placeId: string
  rank: number
  name: string
  category?: string
  imageUrl?: string
  address?: string
}

export type PlaceRankingSnapshotHistoryItem = {
  snapshotDate: string
  rank: number
  change?: PlaceRankingChange | null
}

export type PlaceRankingSnapshotSummary = {
  keyword: string
  snapshotDate: string
  totalSaved: number
  previousSnapshotDate: string | null
  changesByPlaceId: Record<string, PlaceRankingChange | null>
}

export type PlaceRankingSnapshotSaveResponse = {
  message: string
  summary: PlaceRankingSnapshotSummary
}

export type PlaceRankingSnapshotHistoryResponse = {
  keyword: string
  placeId: string
  history: PlaceRankingSnapshotHistoryItem[]
}

export type PlaceRankingBatchKeyword = {
  id: number
  keyword: string
  isActive: boolean
  lastRunAt: string | null
  lastRunStatus: string | null
  lastRunMessage: string | null
  createdAt: string
  updatedAt: string
}

export type PlaceRankingBatchKeywordResponse = {
  keywords: PlaceRankingBatchKeyword[]
}

export type PlaceRankingBatchRunResult = {
  keyword: string
  ok: boolean
  savedCount: number
  message: string
}

export type PlaceRankingBatchRunResponse = {
  ranAt: string
  totalKeywords: number
  successCount: number
  failureCount: number
  results: PlaceRankingBatchRunResult[]
}

export type PlaceBookingStatusRequest = {
  bookingUrl?: string
  bookingBusinessId?: string
  date?: string
}

export type PlaceBookingSummaryRequestItem = {
  placeId: string
  rank: number
  name: string
  category: string
  bookingUrl?: string
  bookingBusinessId?: string
}

export type PlaceBookingSummaryRequest = {
  date?: string
  items: PlaceBookingSummaryRequestItem[]
}

export type PlaceBookingSummaryItem = {
  placeId: string
  rank: number
  name: string
  category: string
  status: 'ready' | 'unavailable' | 'failed'
  bookedSlots: number
  availableSlots: number
  productCount: number
  firstAvailableTime: string | null
  message?: string
}

export type PlaceBookingSummaryResponse = {
  date: string
  summaries: Record<string, PlaceBookingSummaryItem>
  top: PlaceBookingSummaryItem[]
  totalRequested: number
  totalSucceeded: number
  totalFailed: number
}

export type PlaceBookingStatusResponse = {
  businessId: string
  businessTypeId: number
  date: string
  products: PlaceBookingProduct[]
}

export type PlaceBookingProduct = {
  id: string
  name: string
  description: string
  isClosed: boolean
  minBookingCount: number
  maxBookingCount: number
  timeUnitCode?: string
  summary: PlaceBookingSummary
  slots: PlaceBookingSlot[]
}

export type PlaceBookingSummary = {
  totalSlots: number
  availableSlots: number
  bookedSlots: number
  closedSlots: number
  firstAvailableTime: string | null
}

export type PlaceBookingSlot = {
  time: string
  startDateTime: string
  duration: number
  remaining: number
  bookingCount: number
  unitBookingCount: number
  status: PlaceBookingAvailabilityStatus
}

export type PlaceBookingAvailabilityStatus = 'available' | 'booked' | 'closed'
