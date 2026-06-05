export type PlaceRankingItem = PlaceCard & {
  rank: number
  displayRank: number
  rawText: string
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
