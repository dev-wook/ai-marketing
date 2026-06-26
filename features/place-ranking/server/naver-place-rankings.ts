import type { PlaceRankingItem, PlaceRankingResponse } from '../types'
import { searchNaverLocal } from '@/lib/naver'
import type { NaverLocalSearchItem } from '@/lib/naver'

type CollectedPlaceItem = Omit<PlaceRankingItem, 'rank' | 'displayRank'>

type NaverMobileTokenResponse = {
  accessToken?: string
  expiresIn?: number
}

type NaverMobileFusionSearchResponse = {
  totalCount?: number
  items?: RawMobilePlace[]
  pageInfo?: {
    hasNextPage?: boolean
    nextPage?: number
  }
  searchType?: string
}

type RawMobilePlace = {
  id?: string | number
  name?: string
  category?: string
  address?: string
  roadAddress?: string
  tel?: string
  virtualTel?: string
  latitude?: string | number
  longitude?: string | number
  thumbUrl?: string
  reservationUrl?: string | null
  couponUrl?: string | null
  hasMenuInfo?: boolean
  hasNPay?: boolean
  isPollingPlace?: boolean
  isPublicSpace?: boolean
}

class NaverMobilePlaceBlockedError extends Error {
  status: number
  responseSnippet: string

  constructor({
    responseSnippet,
    status,
  }: {
    responseSnippet: string
    status: number
  }) {
    super(`Naver mobile place search request was blocked with status ${status}.`)
    this.name = 'NaverMobilePlaceBlockedError'
    this.status = status
    this.responseSnippet = responseSnippet
  }
}

const defaultLimit = 75
const maxLimit = 75
const rankingStep = 25
const mobileSearchPageSize = 75
const cacheTtlMs = 5 * 60 * 1000
const naverMobileMapUrl = 'https://m.map.naver.com/search'
const naverMobileAuthTokenUrl = 'https://svc-api.map.naver.com/v1/auth/token'
const naverMobileFusionSearchUrl = 'https://svc-api.map.naver.com/v1/fusion-search/all'
const mobileUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'

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
    if (!(error instanceof NaverMobilePlaceBlockedError)) {
      throw error
    }

    console.warn('Naver mobile place search blocked; falling back to Naver Local Search API', {
      keyword: safeKeyword,
      status: error.status,
      responseSnippet: error.responseSnippet,
    })

    items = await collectFallbackLocalSearchItems(safeKeyword)
    source = 'local-fallback'
    warning =
      '네이버 모바일 플레이스 검색이 일시적으로 요청을 제한해 공식 네이버 지역검색 API 결과로 대체 조회했습니다. 정확한 75위 순위가 아니라 보조 검색 순서입니다.'
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
  const items = await fetchMobileFusionSearchItems(keyword)

  return toRankedItems(items).slice(0, limit)
}

async function fetchMobileFusionSearchItems(keyword: string): Promise<CollectedPlaceItem[]> {
  const mapSearchUrl = `${naverMobileMapUrl}?query=${encodeURIComponent(keyword)}`
  const mapResponse = await fetch(mapSearchUrl, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'user-agent': mobileUserAgent,
    },
  })
  const cookie = toCookieHeader(readSetCookieHeaders(mapResponse.headers))

  if (!mapResponse.ok || !cookie.includes('nmap_mobileweb_token=')) {
    throw new NaverMobilePlaceBlockedError({
      status: mapResponse.status,
      responseSnippet: (await mapResponse.text()).slice(0, 240),
    })
  }

  const accessToken = await fetchMobileAccessToken({ cookie, referer: mapSearchUrl })
  const searchParams = new URLSearchParams({
    query: keyword,
    siteSort: 'relativity',
    petrolType: 'all',
    size: String(mobileSearchPageSize),
    includes: 'address_polygon',
  })
  const response = await fetch(`${naverMobileFusionSearchUrl}?${searchParams.toString()}`, {
    headers: {
      accept: 'application/json, text/plain, */*',
      'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'client-name': 'mobile-web',
      'client-version': '1.0.0',
      cookie,
      origin: 'https://m.map.naver.com',
      referer: mapSearchUrl,
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'user-agent': mobileUserAgent,
      'x-maps-mobileweb-token': accessToken,
    },
  })
  const responseText = await response.text()
  const contentType = response.headers.get('content-type') ?? ''

  if (!response.ok || !contentType.includes('application/json')) {
    throw new NaverMobilePlaceBlockedError({
      status: response.status,
      responseSnippet: responseText.slice(0, 240),
    })
  }

  let body: NaverMobileFusionSearchResponse

  try {
    body = JSON.parse(responseText) as NaverMobileFusionSearchResponse
  } catch (error) {
    throw new Error(
      `Naver mobile place search returned invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  return (body.items ?? []).map(mapMobilePlaceToItem).filter((item) => item.name)
}

async function fetchMobileAccessToken({
  cookie,
  referer,
}: {
  cookie: string
  referer: string
}) {
  const response = await fetch(naverMobileAuthTokenUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/plain, */*',
      'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'client-name': 'mobile-web',
      'client-version': '1.0.0',
      'content-type': 'application/json',
      cookie,
      origin: 'https://m.map.naver.com',
      referer,
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'user-agent': mobileUserAgent,
    },
    body: JSON.stringify({ grantType: 'mobile-web' }),
  })
  const responseText = await response.text()
  const contentType = response.headers.get('content-type') ?? ''

  if (!response.ok || !contentType.includes('application/json')) {
    throw new NaverMobilePlaceBlockedError({
      status: response.status,
      responseSnippet: responseText.slice(0, 240),
    })
  }

  let body: NaverMobileTokenResponse

  try {
    body = JSON.parse(responseText) as NaverMobileTokenResponse
  } catch (error) {
    throw new Error(
      `Naver mobile token returned invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  if (!body.accessToken) {
    throw new Error('Naver mobile token response did not include accessToken.')
  }

  return body.accessToken
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

function mapMobilePlaceToItem(item: RawMobilePlace): CollectedPlaceItem {
  const id = asString(item.id)
  const address = asString(item.roadAddress) || asString(item.address)
  const badges = [
    item.reservationUrl ? '예약' : '',
    item.hasNPay ? '네이버페이' : '',
    item.couponUrl ? '쿠폰' : '',
    item.hasMenuInfo ? '메뉴' : '',
  ].filter(Boolean)
  const rawText = [item.name, item.category, address, ...badges]
    .map(asString)
    .filter(Boolean)
    .join(' ')

  return {
    id,
    name: asString(item.name),
    category: asString(item.category),
    ad: {
      isAd: false,
    },
    location: {
      roadAddress: asString(item.roadAddress) || undefined,
      address: asString(item.address) || undefined,
      fullAddress: address || undefined,
      commonAddress: asString(item.address) || undefined,
      latitude: toNumberOrZero(item.latitude),
      longitude: toNumberOrZero(item.longitude),
    },
    businessHours: {},
    images: {
      mainImageUrl: asString(item.thumbUrl) || undefined,
      imageCount: item.thumbUrl ? 1 : 0,
      imageUrls: asString(item.thumbUrl) ? [asString(item.thumbUrl)] : [],
    },
    actions: {
      hasBooking: Boolean(item.reservationUrl),
      bookingUrl: normalizeBookingUrl(item.reservationUrl),
      bookingBusinessId: extractBookingBusinessId(item.reservationUrl),
      phone: asString(item.virtualTel) || asString(item.tel) || undefined,
      routeUrl: id ? `https://m.place.naver.com/place/${encodeURIComponent(id)}` : undefined,
    },
    benefits: {
      couponCount: item.couponUrl ? 1 : 0,
      coupons: item.couponUrl
        ? [
            {
              title: '네이버 플레이스 쿠폰',
              landingUrl: asString(item.couponUrl),
            },
          ]
        : [],
      hasCoupon: Boolean(item.couponUrl),
    },
    options: badges,
    reviews: {
      blogCafeReviewCount: 0,
      bookingReviewCount: 0,
      images: [],
      snippets: [],
      totalReviewCount: 0,
    },
    badges,
    hashtags: [],
    rawText,
  }
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

function toCookieHeader(cookies: string[]) {
  return cookies
    .map((cookie) => cookie.split(';')[0])
    .filter(Boolean)
    .join('; ')
}

function readSetCookieHeaders(headers: Headers) {
  const maybeHeadersWithGetSetCookie = headers as Headers & { getSetCookie?: () => string[] }
  const cookies = maybeHeadersWithGetSetCookie.getSetCookie?.()

  if (cookies?.length) {
    return cookies
  }

  const cookie = headers.get('set-cookie')

  return cookie ? [cookie] : []
}

function normalizeBookingUrl(value: unknown) {
  const bookingUrl = asString(value)

  if (!bookingUrl) {
    return undefined
  }

  return bookingUrl.startsWith('http')
    ? bookingUrl
    : `https://booking.naver.com${bookingUrl.startsWith('/') ? '' : '/'}${bookingUrl}`
}

function extractBookingBusinessId(value: unknown) {
  const bookingUrl = asString(value)
  const match = bookingUrl.match(/\/bizes\/(\d+)/)

  return match?.[1]
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

function normalizeLimit(value: number) {
  const clamped = clampInteger(value, rankingStep, maxLimit)

  return Math.min(Math.ceil(clamped / rankingStep) * rankingStep, maxLimit)
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isInteger(value)) {
    return min
  }

  return Math.min(Math.max(value, min), max)
}
