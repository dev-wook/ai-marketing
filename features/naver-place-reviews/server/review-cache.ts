import type { NaverPlaceReviewResponse, NaverReviewType } from '../types'

type CacheEntry = {
  expiresAt: number
  value: NaverPlaceReviewResponse
}

const reviewCache = new Map<string, CacheEntry>()

const parserCacheVersion = 'v2'
const countTtlMs = 6 * 60 * 60 * 1000
const itemTtlMs = 12 * 60 * 60 * 1000
const errorTtlMs = 7 * 60 * 1000

export function createReviewCacheKey({
  placeId,
  type,
  includeItems,
  limit,
}: {
  placeId: string
  type: NaverReviewType | 'all'
  includeItems: boolean
  limit: number
}) {
  return `naver-place-review:${parserCacheVersion}:${placeId}:${type}:${includeItems}:${limit}`
}

export function readReviewCache(key: string) {
  const cached = reviewCache.get(key)

  if (!cached || cached.expiresAt <= Date.now()) {
    if (cached) {
      reviewCache.delete(key)
    }

    return null
  }

  return {
    ...cached.value,
    cached: true,
  }
}

export function writeReviewCache(key: string, value: NaverPlaceReviewResponse) {
  const hasCount = Boolean(value.visitor?.count !== null && value.visitor?.count !== undefined)
    || Boolean(value.blog?.count !== null && value.blog?.count !== undefined)
  const hasItems = Boolean(value.visitor?.items?.length || value.blog?.items?.length)
  const ttl = hasCount ? (hasItems ? itemTtlMs : countTtlMs) : errorTtlMs

  reviewCache.set(key, {
    expiresAt: Date.now() + ttl,
    value: {
      ...value,
      cached: false,
    },
  })
}
