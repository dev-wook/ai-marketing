import type {
  PlaceCoupon,
  PlaceRankingItem,
  PlaceRankingResponse,
  PlaceReviewImage,
} from '../types'
import { searchNaverLocal } from '@/lib/naver'
import type { NaverLocalSearchItem } from '@/lib/naver'

type CollectedPlaceItem = Omit<PlaceRankingItem, 'rank' | 'displayRank'>

type GraphQlPlaceResponse = Array<{
  data?: {
    placeList?: {
      businesses?: {
        items?: RawGraphQlPlace[]
      }
    }
  }
  errors?: Array<{ message?: string }>
}>

type RawGraphQlPlace = {
  id?: string | number
  name?: string
  category?: string
  businessCategory?: string
  commonAddress?: string
  roadAddress?: string
  address?: string
  fullAddress?: string
  distance?: string
  imageUrl?: string
  imageUrls?: string[]
  imageCount?: string | number
  tags?: Array<string | number | Record<string, unknown>>
  options?: string
  visitorReviews?: RawGraphQlVisitorReview[]
  visitorImages?: RawGraphQlVisitorImage[]
  x?: string | number
  y?: string | number
  hasBooking?: boolean
  hasNPay?: boolean
  hasWheelchairEntrance?: boolean
  bookingUrl?: string
  bookingBusinessId?: string
  talktalkUrl?: string
  phone?: string | null
  virtualPhone?: string | null
  routeUrl?: string
  totalReviewCount?: string | number
  blogCafeReviewCount?: string | number
  bookingReviewCount?: string | number
  microReview?: string
  newBusinessHours?: {
    status?: string
    description?: string
    dayOff?: string | null
    dayOffDescription?: string | null
  } | null
  coupon?: {
    total?: string | number
    promotions?: RawGraphQlCoupon[]
  } | null
}

type RawGraphQlCoupon = {
  title?: string
  type?: string
  couponUseType?: string
  couponLandingUrl?: string
}

type RawGraphQlVisitorReview = {
  id?: string
  reviewId?: string
  review?: string
}

type RawGraphQlVisitorImage = {
  id?: string
  reviewId?: string
  imageUrl?: string
  profileImageUrl?: string
  nickname?: string
}

class NaverPlaceGraphQlBlockedError extends Error {
  status: number
  responseSnippet: string

  constructor({
    responseSnippet,
    status,
  }: {
    responseSnippet: string
    status: number
  }) {
    super(`Naver Place GraphQL request was blocked with status ${status}.`)
    this.name = 'NaverPlaceGraphQlBlockedError'
    this.status = status
    this.responseSnippet = responseSnippet
  }
}

const defaultLimit = 300
const maxLimit = 300
const rankingStep = 50
const graphQlPageSize = 100
const cacheTtlMs = 5 * 60 * 1000
const naverPlaceGraphQlUrl = 'https://pcmap-api.place.naver.com/graphql'
const placeRankingGraphQlQuery = `
  query restList($input: PlaceListInput) {
    placeList(input: $input) {
      businesses {
        total
        items {
          id
          name
          category
          commonAddress
          roadAddress
          address
          fullAddress
          distance
          imageUrl
          imageUrls
          imageCount
          tags
          options
          visitorReviews {
            id
            review
            reviewId
            __typename
          }
          visitorImages {
            id
            reviewId
            imageUrl
            profileImageUrl
            nickname
            __typename
          }
          x
          y
          hasBooking
          hasNPay
          hasWheelchairEntrance
          bookingUrl
          bookingBusinessId
          talktalkUrl
          phone
          virtualPhone
          routeUrl
          totalReviewCount
          blogCafeReviewCount
          bookingReviewCount
          microReview
          newBusinessHours {
            status
            description
            dayOff
            dayOffDescription
            __typename
          }
          coupon {
            total
            promotions {
              title
              type
              couponUseType
              couponLandingUrl
              __typename
            }
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
  }
`

type RankingCacheEntry = {
  keyword: string
  collectedAt: string
  expiresAt: number
  items: PlaceRankingItem[]
  source: PlaceRankingResponse['source']
  warning?: string
}

const rankingCache = new Map<string, RankingCacheEntry>()

export async function collectNaverPlaceRankings({
  keyword,
  limit = defaultLimit,
}: {
  keyword: string
  limit?: number
}): Promise<PlaceRankingResponse> {
  const safeKeyword = keyword.trim()

  if (!safeKeyword) {
    throw new Error('검색어를 입력해주세요.')
  }

  const safeLimit = normalizeLimit(limit)
  const cacheKey = safeKeyword.toLocaleLowerCase('ko-KR')
  const cached = rankingCache.get(cacheKey)

  if (cached && cached.expiresAt > Date.now() && cached.items.length >= safeLimit) {
    return createResponse({
      keyword: safeKeyword,
      collectedAt: cached.collectedAt,
      items: cached.items.slice(0, safeLimit),
      requestedLimit: safeLimit,
      source: cached.source === 'local-fallback' ? 'local-fallback' : 'cache',
      availableTotal: cached.items.length,
      warning: cached.warning,
    })
  }

  const collectedAt = new Date().toISOString()
  let items: PlaceRankingItem[]
  let source: PlaceRankingResponse['source'] = 'live'
  let warning: string | undefined

  try {
    items = await collectRankingItems(safeKeyword, maxLimit)
  } catch (error) {
    if (!(error instanceof NaverPlaceGraphQlBlockedError)) {
      throw error
    }

    console.warn('Naver Place GraphQL blocked; falling back to Naver Local Search API', {
      keyword: safeKeyword,
      status: error.status,
      responseSnippet: error.responseSnippet,
    })

    items = await collectFallbackLocalSearchItems(safeKeyword)
    source = 'local-fallback'
    warning =
      '네이버 플레이스 GraphQL이 일시적으로 요청을 제한해 공식 네이버 지역검색 API 결과로 대체 조회했습니다. 정확한 300위 순위가 아니라 보조 검색 순서입니다.'
  }

  rankingCache.set(cacheKey, {
    keyword: safeKeyword,
    collectedAt,
    expiresAt: Date.now() + cacheTtlMs,
    items,
    source,
    warning,
  })

  return createResponse({
    keyword: safeKeyword,
    collectedAt,
    items: items.slice(0, safeLimit),
    requestedLimit: safeLimit,
    source,
    availableTotal: items.length,
    warning,
  })
}

function createResponse({
  keyword,
  collectedAt,
  items,
  requestedLimit,
  source,
  availableTotal = items.length,
  warning,
}: {
  keyword: string
  collectedAt: string
  items: PlaceRankingItem[]
  requestedLimit: number
  source: PlaceRankingResponse['source']
  availableTotal?: number
  warning?: string
}): PlaceRankingResponse {
  const hasMore = requestedLimit < maxLimit && availableTotal > requestedLimit
  const nextLimit = hasMore
    ? Math.min(items.length < requestedLimit ? requestedLimit : requestedLimit + rankingStep, maxLimit)
    : null

  return {
    keyword,
    collectedAt,
    requestedLimit,
    totalCollected: items.length,
    hasMore: nextLimit !== null,
    nextLimit,
    source,
    warning,
    items,
  }
}

async function collectRankingItems(keyword: string, limit: number): Promise<PlaceRankingItem[]> {
  const searchQuery = keyword.replace(/\s+/g, '')
  const items = await fetchGraphQlRankingItems(searchQuery, limit)

  return toRankedItems(items).slice(0, limit)
}

async function collectFallbackLocalSearchItems(keyword: string): Promise<PlaceRankingItem[]> {
  const response = await searchNaverLocal({
    query: keyword,
    display: 5,
    sort: 'random',
  })

  return response.items.map((item, index) => ({
    ...mapLocalSearchItemToPlace(item, index),
    rank: index + 1,
    displayRank: index + 1,
  }))
}

function mapLocalSearchItemToPlace(item: NaverLocalSearchItem, index: number): CollectedPlaceItem {
  const address = item.roadAddress || item.address
  const rawText = [item.title, item.category, address, item.description].filter(Boolean).join(' ')

  return {
    id: createFallbackPlaceId(item, index),
    name: item.title,
    category: item.category,
    ad: {
      isAd: false,
    },
    location: {
      roadAddress: item.roadAddress || undefined,
      address: item.address || undefined,
      fullAddress: address || undefined,
      commonAddress: address || undefined,
      latitude: parseNaverMapCoordinate(item.mapy),
      longitude: parseNaverMapCoordinate(item.mapx),
    },
    businessHours: {},
    images: {
      imageCount: 0,
      imageUrls: [],
    },
    actions: {
      hasBooking: false,
      routeUrl: item.link || undefined,
    },
    benefits: {
      couponCount: 0,
      coupons: [],
      hasCoupon: false,
    },
    options: [],
    reviews: {
      blogCafeReviewCount: 0,
      bookingReviewCount: 0,
      images: [],
      snippets: item.description
        ? [
            {
              reviewId: `local-description-${index + 1}`,
              text: item.description,
            },
          ]
        : [],
      totalReviewCount: 0,
    },
    badges: ['지역검색 대체 결과'],
    hashtags: [],
    rawText,
  }
}

function createFallbackPlaceId(item: NaverLocalSearchItem, index: number) {
  const source = [item.link, item.title, item.roadAddress, item.address, index].join('|')
  let hash = 0

  for (let charIndex = 0; charIndex < source.length; charIndex += 1) {
    hash = (hash * 31 + source.charCodeAt(charIndex)) >>> 0
  }

  return `local-${hash.toString(36)}`
}

function parseNaverMapCoordinate(value: string) {
  const numberValue = Number(value)

  if (!Number.isFinite(numberValue)) {
    return 0
  }

  return numberValue / 10_000_000
}

async function fetchGraphQlRankingItems(
  searchQuery: string,
  limit: number,
): Promise<CollectedPlaceItem[]> {
  const starts = Array.from(
    { length: Math.ceil(limit / graphQlPageSize) },
    (_, index) => index * graphQlPageSize + 1,
  )
  const pages = await Promise.all(starts.map((start) => fetchGraphQlRankingPage(searchQuery, start)))
  const seenIds = new Set<string>()

  return pages
    .flat()
    .flatMap((item) => {
      const id = asString(item.id)

      if (id && seenIds.has(id)) {
        return []
      }

      if (id) {
        seenIds.add(id)
      }

      return [mapGraphQlPlaceToItem(item)]
    })
    .filter((item) => item.name)
}

async function fetchGraphQlRankingPage(searchQuery: string, start: number) {
  const response = await fetch(naverPlaceGraphQlUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      origin: 'https://pcmap.place.naver.com',
      referer: `https://pcmap.place.naver.com/rest/list?query=${encodeURIComponent(
        searchQuery,
      )}&display=${graphQlPageSize}&locale=ko`,
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    },
    body: JSON.stringify([
      {
        operationName: 'restList',
        variables: {
          input: {
            query: searchQuery,
            start,
            display: graphQlPageSize,
            deviceType: 'pcmap',
            businessType: 'rest',
            sortingOrder: 'precision',
          },
        },
        query: placeRankingGraphQlQuery,
      },
    ]),
  })
  const responseText = await response.text()
  const contentType = response.headers.get('content-type') ?? ''

  if (!contentType.includes('application/json')) {
    throw new NaverPlaceGraphQlBlockedError({
      status: response.status,
      responseSnippet: responseText.slice(0, 240),
    })
  }

  let body: GraphQlPlaceResponse

  try {
    body = JSON.parse(responseText) as GraphQlPlaceResponse
  } catch (error) {
    throw new Error(
      `Naver Place GraphQL returned invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  if (!response.ok || body[0]?.errors?.length) {
    throw new Error(
      body[0]?.errors?.[0]?.message ||
        `Naver Place GraphQL request failed with status ${response.status}`,
    )
  }

  return body[0]?.data?.placeList?.businesses?.items ?? []
}

function mapGraphQlPlaceToItem(item: RawGraphQlPlace): CollectedPlaceItem {
  const hours = item.newBusinessHours ?? null
  const reviewSnippets = (item.visitorReviews ?? [])
    .map((review) => ({
      reviewId: asString(review.reviewId || review.id),
      text: asString(review.review),
    }))
    .filter((review) => review.reviewId && review.text)
  const reviewTexts = reviewSnippets.map((review) => review.text)
  const hashtags = createHashtags(item)
  const coupons = createCoupons(item)
  const imageUrls = Array.isArray(item.imageUrls) ? item.imageUrls.map(asString).filter(Boolean) : []
  const snippets = [asString(item.microReview), ...reviewTexts].filter(Boolean)
  const statusText = asString(hours?.status)
  const businessHoursDescription = asString(hours?.description)
  const status = [statusText, businessHoursDescription].filter(Boolean).join(' · ')
  const address =
    asString(item.commonAddress) ||
    asString(item.fullAddress) ||
    asString(item.address) ||
    asString(item.roadAddress)
  const rawText = [
    item.name,
    item.category,
    status,
    address,
    item.distance,
    ...hashtags,
    ...snippets.slice(0, 3),
  ]
    .map(asString)
    .filter(Boolean)
    .join(' ')

  return {
    id: asString(item.id),
    name: asString(item.name),
    category: asString(item.category || item.businessCategory),
    ad: {
      isAd: false,
    },
    location: {
      roadAddress: asString(item.roadAddress) || undefined,
      address: asString(item.address) || undefined,
      fullAddress: asString(item.fullAddress) || undefined,
      commonAddress: asString(item.commonAddress) || undefined,
      distance: asString(item.distance) || undefined,
      longitude: asNumber(item.x) ?? 0,
      latitude: asNumber(item.y) ?? 0,
    },
    businessHours: {
      status: statusText || undefined,
      description: businessHoursDescription || undefined,
      dayOff: asString(hours?.dayOffDescription) || asString(hours?.dayOff) || null,
    },
    images: {
      mainImageUrl: asString(item.imageUrl) || undefined,
      imageCount: toNumberOrZero(item.imageCount),
      imageUrls,
    },
    actions: {
      hasBooking: Boolean(item.hasBooking),
      bookingUrl: asString(item.bookingUrl) || undefined,
      bookingBusinessId: asString(item.bookingBusinessId) || undefined,
      talktalkUrl: asString(item.talktalkUrl) || undefined,
      phone: asString(item.virtualPhone) || asString(item.phone) || undefined,
      routeUrl: asString(item.routeUrl) || undefined,
    },
    benefits: {
      hasCoupon: toNumberOrZero(item.coupon?.total) > 0,
      couponCount: toNumberOrZero(item.coupon?.total),
      coupons,
    },
    options: splitOptions(item.options),
    reviews: {
      totalReviewCount: toNumberOrZero(item.totalReviewCount),
      blogCafeReviewCount: toNumberOrZero(item.blogCafeReviewCount),
      bookingReviewCount: toNumberOrZero(item.bookingReviewCount),
      snippets: reviewSnippets.slice(0, 3),
      images: createReviewImages(item),
    },
    badges: createBadges(item),
    hashtags,
    rawText,
  }
}

function createBadges(item: RawGraphQlPlace) {
  return [
    item.hasBooking || item.bookingUrl ? '예약' : '',
    item.talktalkUrl ? '톡톡' : '',
    item.hasNPay ? '네이버페이' : '',
    item.coupon?.total ? '쿠폰' : '',
  ].filter(Boolean)
}

function createHashtags(item: RawGraphQlPlace) {
  const tags = Array.isArray(item.tags) ? item.tags : []

  return tags
    .map((tag) => {
      if (typeof tag === 'string' || typeof tag === 'number') {
        return asString(tag)
      }

      return (
        asString(tag.name) ||
        asString(tag.text) ||
        asString(tag.tag) ||
        asString(tag.keyword)
      )
    })
    .filter(Boolean)
    .slice(0, 8)
}

function createCoupons(item: RawGraphQlPlace): PlaceCoupon[] {
  return (item.coupon?.promotions ?? [])
    .map((promotion) => ({
      title: asString(promotion.title),
      type: asString(promotion.type) || undefined,
      useType: asString(promotion.couponUseType) || undefined,
      landingUrl: asString(promotion.couponLandingUrl) || undefined,
    }))
    .filter((promotion) => promotion.title)
}

function createReviewImages(item: RawGraphQlPlace): PlaceReviewImage[] {
  const reviewImages = (item.visitorImages ?? [])
    .map((image) => ({
      id: asString(image.id),
      reviewId: asString(image.reviewId),
      imageUrl: asString(image.imageUrl),
      profileImageUrl: asString(image.profileImageUrl) || undefined,
      nickname: asString(image.nickname) || undefined,
    }))
    .filter((image) => image.id && image.reviewId && image.imageUrl)

  return uniqueBy(reviewImages, (image) => `${image.reviewId}:${image.imageUrl}`)
}

function toRankedItems(items: CollectedPlaceItem[]) {
  let organicRank = 0

  return items
    .map((item, index) => {
      if (item.ad.isAd) {
        return null
      }

      organicRank += 1

      return {
        ...item,
        displayRank: index + 1,
        rank: organicRank,
      }
    })
    .filter((item): item is PlaceRankingItem => item !== null)
}

function asString(value: unknown) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function asNumber(value: unknown) {
  const numberValue = Number(value)

  return Number.isFinite(numberValue) ? numberValue : null
}

function toNumberOrZero(value: unknown) {
  return asNumber(value) ?? 0
}

function splitOptions(value: unknown) {
  return asString(value)
    .split(',')
    .map((option) => option.trim())
    .filter(Boolean)
}

function uniqueBy<T>(items: T[], keyGetter: (item: T) => string) {
  const map = new Map<string, T>()

  items.forEach((item) => {
    const key = keyGetter(item)

    if (!key || map.has(key)) {
      return
    }

    map.set(key, item)
  })

  return Array.from(map.values())
}

function normalizeLimit(value: number) {
  const clamped = clampInteger(value, rankingStep, maxLimit)

  return Math.ceil(clamped / rankingStep) * rankingStep
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isInteger(value)) {
    return min
  }

  return Math.min(Math.max(value, min), max)
}
