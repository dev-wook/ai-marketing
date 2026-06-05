import { existsSync } from 'node:fs'
import type { Browser, Page } from 'playwright-core'
import type { PlaceRankingItem, PlaceRankingResponse } from '../types'

type CollectedPlaceItem = Omit<PlaceRankingItem, 'rank' | 'displayRank'>

type ChromiumModule = {
  args: string[]
  executablePath: () => Promise<string>
}

const defaultLimit = 300
const maxLimit = 300
const rankingStep = 50
const graphQlPageSize = 100
const cacheTtlMs = 5 * 60 * 1000
const localChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
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
      source: 'cache',
      availableTotal: cached.items.length,
    })
  }

  const browser = await launchBrowser()

  try {
    const page = await createRankingPage(browser)
    const collectedAt = new Date().toISOString()
    const items = await collectRankingItems(page, safeKeyword, maxLimit)

    rankingCache.set(cacheKey, {
      keyword: safeKeyword,
      collectedAt,
      expiresAt: Date.now() + cacheTtlMs,
      items,
    })

    return createResponse({
      keyword: safeKeyword,
      collectedAt,
      items: items.slice(0, safeLimit),
      requestedLimit: safeLimit,
      source: 'live',
      availableTotal: items.length,
    })
  } finally {
    await browser.close()
  }
}

function createResponse({
  keyword,
  collectedAt,
  items,
  requestedLimit,
  source,
  availableTotal = items.length,
}: {
  keyword: string
  collectedAt: string
  items: PlaceRankingItem[]
  requestedLimit: number
  source: PlaceRankingResponse['source']
  availableTotal?: number
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
    items,
  }
}

async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import('playwright-core')

  if (process.env.VERCEL) {
    const chromiumModule = (await import('@sparticuz/chromium')).default as unknown as ChromiumModule

    return chromium.launch({
      args: chromiumModule.args,
      executablePath: await chromiumModule.executablePath(),
      headless: true,
    })
  }

  if (!existsSync(localChromePath)) {
    throw new Error('로컬 Chrome 실행 파일을 찾을 수 없습니다.')
  }

  return chromium.launch({
    executablePath: localChromePath,
    headless: true,
  })
}

async function createRankingPage(browser: Browser) {
  const page = await browser.newPage({
    viewport: {
      width: 1280,
      height: 900,
    },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  })

  await page.route('**/*', (route) => {
    const resourceType = route.request().resourceType()

    if (resourceType === 'font' || resourceType === 'image' || resourceType === 'media') {
      return route.abort()
    }

    return route.continue()
  })

  return page
}

async function collectRankingItems(
  page: Page,
  keyword: string,
  limit: number,
): Promise<PlaceRankingItem[]> {
  await prepareRankingPage(page, keyword)

  return collectRankingItemsFromGraphQl(page, keyword.replace(/\s+/g, ''), limit)
}

async function prepareRankingPage(page: Page, keyword: string) {
  const searchQuery = keyword.replace(/\s+/g, '')
  const listUrl = `https://pcmap.place.naver.com/rest/list?query=${encodeURIComponent(
    searchQuery,
  )}&display=${graphQlPageSize}&locale=ko`

  await page.goto(listUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await page.waitForFunction(() => {
    const state = (window as typeof window & { __APOLLO_STATE__?: Record<string, unknown> })
      .__APOLLO_STATE__

    return Boolean(
      state && Object.keys(state).some((key) => key.startsWith('PlaceListBusinessesItem:')),
    )
  }, { timeout: 30000 })
}

async function collectRankingItemsFromGraphQl(page: Page, searchQuery: string, limit: number) {
  const items = await fetchGraphQlRankingItems(page, searchQuery, limit)

  return toRankedItems(items).slice(0, limit)
}

async function fetchGraphQlRankingItems(
  page: Page,
  searchQuery: string,
  limit: number,
): Promise<CollectedPlaceItem[]> {
  const starts = Array.from(
    { length: Math.ceil(limit / graphQlPageSize) },
    (_, index) => index * graphQlPageSize + 1,
  )

  return page.evaluate(
    async ({ pageSize, query, searchQuery, starts }) => {
      type ApolloRecord = Record<string, unknown>
      type GraphQlResponse = Array<{
        data?: {
          placeList?: {
            businesses?: {
              items?: ApolloRecord[]
            }
          }
        }
        errors?: Array<{ message?: string }>
      }>

      const clean = (value: unknown) =>
        String(value ?? '')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&gt;/g, '>')
          .replace(/&lt;/g, '<')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, ' ')
          .trim()
      const asString = (value: unknown) => clean(value)
      const asNumber = (value: unknown) => {
        const numberValue = Number(value)

        return Number.isFinite(numberValue) ? numberValue : null
      }
      const toNumberOrZero = (value: unknown) => asNumber(value) ?? 0
      const splitOptions = (value: unknown) =>
        asString(value)
          .split(',')
          .map((option) => option.trim())
          .filter(Boolean)
      const uniqueBy = <T,>(items: T[], keyGetter: (item: T) => string) => {
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
      const resolveValue = (value: unknown): ApolloRecord | null => {
        if (!value || typeof value !== 'object') {
          return null
        }

        return value as ApolloRecord
      }
      const resolveArray = (value: unknown) =>
        Array.isArray(value)
          ? value.map(resolveValue).filter((item): item is ApolloRecord => Boolean(item))
          : []
      const createBadges = (item: ApolloRecord) =>
        [
          item.hasBooking || item.bookingUrl ? '예약' : '',
          item.talktalkUrl ? '톡톡' : '',
          item.hasNPay ? '네이버페이' : '',
          resolveValue(item.coupon)?.total ? '쿠폰' : '',
        ].filter(Boolean)
      const createHashtags = (item: ApolloRecord) => {
        const tags = Array.isArray(item.tags) ? item.tags : []

        return tags
          .map((tag) => {
            if (typeof tag === 'string' || typeof tag === 'number') {
              return asString(tag)
            }

            const tagObject = resolveValue(tag)

            return (
              asString(tagObject?.name) ||
              asString(tagObject?.text) ||
              asString(tagObject?.tag) ||
              asString(tagObject?.keyword)
            )
          })
          .filter(Boolean)
          .slice(0, 8)
      }
      const createCoupons = (item: ApolloRecord) => {
        const coupon = resolveValue(item.coupon)
        const promotions = resolveArray(coupon?.promotions)

        return promotions
          .map((promotion) => ({
            title: asString(promotion.title),
            type: asString(promotion.type) || undefined,
            useType: asString(promotion.couponUseType) || undefined,
            landingUrl: asString(promotion.couponLandingUrl) || undefined,
          }))
          .filter((promotion) => promotion.title)
      }
      const createReviewImages = (item: ApolloRecord) => {
        const visitorImages = resolveArray(item.visitorImages)
        const reviewImages = visitorImages
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
      const fetchPage = async (start: number) => {
        const response = await fetch('https://pcmap-api.place.naver.com/graphql', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify([
            {
              operationName: 'restList',
              variables: {
                input: {
                  query: searchQuery,
                  start,
                  display: pageSize,
                  deviceType: 'pcmap',
                  businessType: 'rest',
                  sortingOrder: 'precision',
                },
              },
              query,
            },
          ]),
        })
        const body = (await response.json()) as GraphQlResponse

        if (!response.ok || body[0]?.errors?.length) {
          throw new Error(
            body[0]?.errors?.[0]?.message ||
              `Naver Place GraphQL request failed with status ${response.status}`,
          )
        }

        return body[0]?.data?.placeList?.businesses?.items ?? []
      }

      const pages = await Promise.all(starts.map(fetchPage))
      const seenIds = new Set<string>()

      return pages.flat().flatMap((item) => {
        const id = asString(item.id)

        if (id && seenIds.has(id)) {
          return []
        }

        if (id) {
          seenIds.add(id)
        }

        const hours = resolveValue(item.newBusinessHours)
        const coupon = resolveValue(item.coupon)
        const visitorReviews = resolveArray(item.visitorReviews)
        const reviewSnippets = visitorReviews
          .map((review) => ({
            reviewId: asString(review.reviewId || review.id),
            text: asString(review.review),
          }))
          .filter((review) => review.reviewId && review.text)
        const reviewTexts = reviewSnippets.map((review) => review.text)
        const hashtags = createHashtags(item)
        const coupons = createCoupons(item)
        const imageUrls = Array.isArray(item.imageUrls)
          ? item.imageUrls.map(asString).filter(Boolean)
          : []
        const snippets = [
          asString(item.microReview),
          ...reviewTexts,
        ].filter(Boolean)
        const statusText = asString(hours?.status)
        const businessHoursDescription = asString(hours?.description)
        const status = [statusText, businessHoursDescription]
          .filter(Boolean)
          .join(' · ')
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
          id,
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
            hasCoupon: toNumberOrZero(coupon?.total) > 0,
            couponCount: toNumberOrZero(coupon?.total),
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
      })
      .filter((item) => item.name)
    },
    {
      pageSize: graphQlPageSize,
      query: placeRankingGraphQlQuery,
      searchQuery,
      starts,
    },
  )
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
