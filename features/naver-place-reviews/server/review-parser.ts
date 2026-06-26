import type { NaverReviewItem, NaverReviewSummary, NaverReviewType } from '../types'
import { createNaverPlaceReviewUrl } from './review-url'

export type ParsedReviewResult = {
  summary: NaverReviewSummary
  source: 'embedded-json' | 'html'
  warnings: Array<'NAVER_REVIEW_COUNT_NOT_FOUND' | 'NAVER_REVIEW_ITEMS_NOT_FOUND' | 'NAVER_STRUCTURE_CHANGED'>
}

export function parseNaverReviewHtml({
  html,
  includeItems,
  limit,
  placeId,
  type,
}: {
  html: string
  includeItems: boolean
  limit: number
  placeId: string
  type: NaverReviewType
}): ParsedReviewResult {
  const embeddedJson = parseEmbeddedJson(html)
  const sourceUrl = createNaverPlaceReviewUrl(placeId, type)
  const embeddedCount = embeddedJson ? findReviewCountInJson(embeddedJson, type) : null
  const htmlCount = findReviewCountInText(html, type) ?? embeddedCount
  const items = includeItems && embeddedJson ? findReviewItemsInJson(embeddedJson, limit, sourceUrl) : []
  const warnings: ParsedReviewResult['warnings'] = []

  if (htmlCount === null) {
    warnings.push('NAVER_REVIEW_COUNT_NOT_FOUND')
  }

  if (includeItems && items.length === 0) {
    warnings.push('NAVER_REVIEW_ITEMS_NOT_FOUND')
  }

  return {
    source: embeddedJson ? 'embedded-json' : 'html',
    summary: {
      type,
      count: htmlCount,
      sourceUrl,
      items: includeItems ? items : undefined,
      nextCursor: null,
      hasMore: false,
    },
    warnings,
  }
}

function parseEmbeddedJson(html: string): unknown {
  const nextData = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/)

  if (nextData?.[1]) {
    try {
      return JSON.parse(decodeHtml(nextData[1]))
    } catch {
      return null
    }
  }

  const stateData = html.match(/window\.__APOLLO_STATE__\s*=\s*({[\s\S]*?});/)

  if (stateData?.[1]) {
    try {
      return JSON.parse(stateData[1])
    } catch {
      return null
    }
  }

  return null
}

function findReviewCountInJson(value: unknown, type: NaverReviewType): number | null {
  const preferredKeys =
    type === 'visitor'
      ? ['visitorReviewCount', 'visitorReviewsTotal', 'totalReviewCount', 'visitorReviewsCount']
      : ['blogCafeReviewCount', 'blogReviewCount', 'ugcReviewCount', 'blogReviewsTotal']
  const queue: unknown[] = [value]
  const seen = new Set<unknown>()

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current || typeof current !== 'object' || seen.has(current)) {
      continue
    }

    seen.add(current)

    for (const [key, nestedValue] of Object.entries(current)) {
      if (preferredKeys.includes(key)) {
        const count = toCount(nestedValue)

        if (count !== null) {
          return count
        }
      }

      if (nestedValue && typeof nestedValue === 'object') {
        queue.push(nestedValue)
      }
    }
  }

  return null
}

function findReviewCountInText(html: string, type: NaverReviewType): number | null {
  const rawText = decodeHtml(html).replace(/\s+/g, ' ')
  const strippedText = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const patterns =
    type === 'visitor'
      ? [/방문자\s*리뷰\s*([0-9,]+)\s*개?/, /([0-9,]+)\s*개의\s*방문자\s*리뷰/]
      : [/블로그\s*리뷰\s*([0-9,]+)\s*개?/, /([0-9,]+)\s*개의\s*블로그\s*리뷰/]

  for (const text of [rawText, strippedText]) {
    for (const pattern of patterns) {
      const matched = text.match(pattern)
      const count = toCount(matched?.[1])

      if (count !== null) {
        return count
      }
    }
  }

  return null
}

function findReviewItemsInJson(value: unknown, limit: number, sourceUrl: string): NaverReviewItem[] {
  const items: NaverReviewItem[] = []
  const queue: unknown[] = [value]
  const seen = new Set<unknown>()

  while (queue.length > 0 && items.length < limit) {
    const current = queue.shift()

    if (!current || typeof current !== 'object' || seen.has(current)) {
      continue
    }

    seen.add(current)

    if (Array.isArray(current)) {
      current.forEach((item) => queue.push(item))
      continue
    }

    const record = current as Record<string, unknown>
    const content = toText(record.content) || toText(record.review) || toText(record.body)
    const reviewId = toText(record.reviewId) || toText(record.id)
    const title = toText(record.title)
    const authorName = toText(record.authorName) || toText(record.nickname)
    const typeName = toText(record.typeName)
    const reviewType = toText(record.type)
    const isReviewLikeRecord =
      Boolean(content || authorName) ||
      typeName?.includes('리뷰') ||
      reviewType === 'blog' ||
      reviewType === 'visitor'

    if ((content || title || authorName) && isReviewLikeRecord) {
      items.push({
        reviewId: reviewId || undefined,
        title,
        content,
        authorName,
        writtenAt: toText(record.writtenAt) || toText(record.createdAt),
        rating: toCount(record.rating),
        keywords: toStringArray(record.keywords),
        imageUrls: toStringArray(record.imageUrls),
        sourceUrl,
      })
    }

    Object.values(record).forEach((nestedValue) => {
      if (nestedValue && typeof nestedValue === 'object') {
        queue.push(nestedValue)
      }
    })
  }

  return items
}

function toCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value))
  }

  if (typeof value !== 'string') {
    return null
  }

  const numberValue = Number(value.replace(/,/g, '').trim())

  return Number.isFinite(numberValue) ? Math.max(0, Math.trunc(numberValue)) : null
}

function toText(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null
  }

  const text = String(value).replace(/\s+/g, ' ').trim()

  return text || null
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map(toText).filter((item): item is string => Boolean(item)).slice(0, 12)
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}
