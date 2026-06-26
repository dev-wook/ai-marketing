import type {
  NaverPlaceReviewBatchItem,
  NaverPlaceReviewResponse,
  NaverReviewSummary,
  NaverReviewType,
  NaverReviewWarningCode,
} from '../types'
import { fetchNaverReviewPage } from './review-client'
import { createReviewCacheKey, readReviewCache, writeReviewCache } from './review-cache'
import { parseNaverReviewHtml } from './review-parser'
import { createNaverPlaceReviewUrl } from './review-url'

type FetchOptions = {
  placeId: string
  type: NaverReviewType | 'all'
  includeItems?: boolean
  limit?: number
}

type BatchOptions = {
  placeIds: string[]
  types: NaverReviewType[]
}

const batchConcurrency = 4

export async function getNaverPlaceReviews({
  placeId,
  type,
  includeItems = false,
  limit = 10,
}: FetchOptions): Promise<NaverPlaceReviewResponse> {
  const cacheKey = createReviewCacheKey({ placeId, type, includeItems, limit })
  const cached = readReviewCache(cacheKey)

  if (cached) {
    return cached
  }

  const fetchedAt = new Date().toISOString()
  const types = type === 'all' ? (['visitor', 'blog'] as const) : ([type] as const)
  const results = await Promise.allSettled(
    types.map((reviewType) =>
      getNaverPlaceReviewSummary({
        includeItems,
        limit,
        placeId,
        type: reviewType,
      }),
    ),
  )
  const response: NaverPlaceReviewResponse = {
    placeId,
    fetchedAt,
    source: 'html',
    cached: false,
    warnings: [],
  }

  results.forEach((result, index) => {
    const reviewType = types[index]

    if (result.status === 'fulfilled') {
      response[reviewType] = result.value.summary
      response.source = result.value.source
      response.warnings.push(...result.value.warnings)
      return
    }

    response[reviewType] = createEmptySummary(placeId, reviewType)
    response.warnings.push('NAVER_RESPONSE_INVALID')
  })

  response.warnings = uniqueWarnings(response.warnings)
  writeReviewCache(cacheKey, response)

  return response
}

export async function getNaverPlaceReviewsBatch({
  placeIds,
  types,
}: BatchOptions): Promise<NaverPlaceReviewBatchItem[]> {
  const items = await mapWithConcurrency(placeIds, batchConcurrency, async (placeId) => {
    const response = await getNaverPlaceReviews({
      placeId,
      type: types.length === 1 ? types[0] : 'all',
      includeItems: false,
      limit: 1,
    })

    return {
      placeId,
      visitorCount: response.visitor?.count ?? null,
      blogCount: response.blog?.count ?? null,
      fetchedAt: response.fetchedAt,
      cached: response.cached,
      warnings: response.warnings,
    }
  })

  return items
}

async function getNaverPlaceReviewSummary({
  includeItems,
  limit,
  placeId,
  type,
}: {
  includeItems: boolean
  limit: number
  placeId: string
  type: NaverReviewType
}): Promise<{
  summary: NaverReviewSummary
  source: NaverPlaceReviewResponse['source']
  warnings: NaverReviewWarningCode[]
}> {
  const fetched = await fetchNaverReviewPage({ placeId, type })

  if (!fetched.ok) {
    console.error('Naver place review fetch skipped', {
      placeId,
      reviewType: type,
      status: fetched.status,
      warning: fetched.warning,
      sourceUrl: fetched.sourceUrl,
    })

    return {
      summary: createEmptySummary(placeId, type),
      source: 'html',
      warnings: [fetched.warning],
    }
  }

  const parsed = parseNaverReviewHtml({
    html: fetched.html,
    includeItems,
    limit,
    placeId,
    type,
  })

  return parsed
}

function createEmptySummary(placeId: string, type: NaverReviewType): NaverReviewSummary {
  return {
    type,
    count: null,
    sourceUrl: createNaverPlaceReviewUrl(placeId, type),
    nextCursor: null,
    hasMore: false,
  }
}

function uniqueWarnings(warnings: NaverReviewWarningCode[]) {
  return Array.from(new Set(warnings))
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
) {
  const results: R[] = []
  let index = 0

  async function worker() {
    while (index < items.length) {
      const currentIndex = index

      index += 1
      results[currentIndex] = await mapper(items[currentIndex])
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))

  return results
}
