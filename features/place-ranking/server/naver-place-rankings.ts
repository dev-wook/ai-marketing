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
          imageCount
          visitorReviews {
            id
            review
            reviewId
            __typename
          }
          x
          y
          hasBooking
          hasNPay
          hasWheelchairEntrance
          totalReviewCount
          blogCafeReviewCount
          bookingReviewCount
          microReview
          newBusinessHours {
            status
            description
            __typename
          }
          coupon {
            total
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
          item.hasBooking ? '예약' : '',
          item.hasNPay ? '네이버페이' : '',
          item.hasWheelchairEntrance ? '휠체어 출입 가능' : '',
          resolveValue(item.coupon)?.total ? '쿠폰' : '',
        ].filter(Boolean)
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
        const visitorReviews = resolveArray(item.visitorReviews)
        const reviewTexts = visitorReviews.map((review) => asString(review.review)).filter(Boolean)
        const snippets = [
          asString(item.microReview),
          ...reviewTexts,
        ].filter(Boolean)
        const status = [asString(hours?.status), asString(hours?.description)]
          .filter(Boolean)
          .join('')
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
          ...snippets.slice(0, 3),
        ]
          .map(asString)
          .filter(Boolean)
          .join(' ')

        return {
          name: asString(item.name),
          category: asString(item.category || item.businessCategory),
          isAd: false,
          expId: id,
          imageCount: asNumber(item.imageCount),
          thumbnailUrl: asString(item.imageUrl) || null,
          status,
          address,
          distance: asString(item.distance),
          badges: createBadges(item),
          snippets: snippets.slice(0, 3),
          visitorReviews: reviewTexts.slice(0, 3),
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
      if (item.isAd) {
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
