import { NextResponse } from 'next/server'
import type {
  PlaceBookingSummaryItem,
  PlaceBookingSummaryRequest,
  PlaceBookingSummaryRequestItem,
  PlaceBookingSummaryResponse,
} from '../types'
import { collectNaverBookingStatus } from '../server/naver-booking-status'

const bookingSummaryConcurrency = 4
const bookingSummaryCacheTtlMs = 1000 * 60 * 5
const bookingSummaryTopLimit = 100
const bookingSummaryCache = new Map<
  string,
  {
    expiresAt: number
    response: PlaceBookingSummaryResponse
  }
>()

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PlaceBookingSummaryRequest
    const date = normalizeDate(body.date)
    const items = Array.isArray(body.items) ? body.items : []
    const excludePlaceKeys = new Set(
      Array.isArray(body.excludePlaceKeys)
        ? body.excludePlaceKeys.filter((key) => typeof key === 'string' && key.trim())
        : [],
    )
    const targets = items
      .filter(hasBookingTarget)
      .filter((item) => !excludePlaceKeys.has(createPlaceBlacklistKey(item.placeId, item.name)))
      .slice(0, bookingSummaryTopLimit)
    const cacheKey = createBookingSummaryCacheKey(date, targets)
    const cachedResponse = readCachedBookingSummary(cacheKey)

    if (cachedResponse) {
      return NextResponse.json(cachedResponse)
    }

    const collected = await runWithConcurrency(
      targets,
      bookingSummaryConcurrency,
      async (item) => collectBookingSummary(item, date),
    )
    const summaries = collected.reduce<Record<string, PlaceBookingSummaryItem>>(
      (accumulator, summary) => {
        accumulator[summary.placeId] = summary

        return accumulator
      },
      {},
    )
    const readySummaries = collected.filter((summary) => summary.status === 'ready')
    const top = [...readySummaries]
      .sort((left, right) => {
        if (right.bookedSlots !== left.bookedSlots) {
          return right.bookedSlots - left.bookedSlots
        }

        return left.rank - right.rank
      })
      .slice(0, bookingSummaryTopLimit)

    const response: PlaceBookingSummaryResponse = {
      date,
      summaries,
      top,
      totalRequested: targets.length,
      totalSucceeded: readySummaries.length,
      totalFailed: collected.filter((summary) => summary.status === 'failed').length,
    }

    bookingSummaryCache.set(cacheKey, {
      expiresAt: Date.now() + bookingSummaryCacheTtlMs,
      response,
    })

    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof Error) {
      console.error('Naver booking summary error', {
        message: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      {
        message: '오늘 예약 현황을 확인하는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
        debug:
          error instanceof Error
            ? {
                provider: 'naver-booking-summary',
                message: error.message,
                createdAt: new Date().toISOString(),
              }
            : undefined,
      },
      { status: 500 },
    )
  }
}

async function collectBookingSummary(
  item: PlaceBookingSummaryRequestItem,
  date: string,
): Promise<PlaceBookingSummaryItem> {
  try {
    const response = await collectNaverBookingStatus({
      bookingUrl: item.bookingUrl,
      bookingBusinessId: item.bookingBusinessId,
      date,
    })
    const summary = response.products.reduce(
      (accumulator, product) => ({
        bookedSlots: accumulator.bookedSlots + product.summary.bookedSlots,
        availableSlots: accumulator.availableSlots + product.summary.availableSlots,
        firstAvailableTime:
          accumulator.firstAvailableTime ?? product.summary.firstAvailableTime,
      }),
      {
        bookedSlots: 0,
        availableSlots: 0,
        firstAvailableTime: null as string | null,
      },
    )

    return {
      placeId: item.placeId,
      rank: item.rank,
      name: item.name,
      category: item.category,
      status: 'ready',
      bookedSlots: summary.bookedSlots,
      availableSlots: summary.availableSlots,
      productCount: response.products.length,
      firstAvailableTime: summary.firstAvailableTime,
    }
  } catch (error) {
    return {
      placeId: item.placeId,
      rank: item.rank,
      name: item.name,
      category: item.category,
      status: 'failed',
      bookedSlots: 0,
      availableSlots: 0,
      productCount: 0,
      firstAvailableTime: null,
      message: error instanceof Error ? error.message : '예약 요약 조회에 실패했습니다.',
    }
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
) {
  const results: R[] = []
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const currentIndex = cursor
      cursor += 1
      results[currentIndex] = await task(items[currentIndex])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  )

  return results
}

function hasBookingTarget(item: PlaceBookingSummaryRequestItem) {
  return Boolean(item.placeId && (item.bookingUrl || item.bookingBusinessId))
}

function createPlaceBlacklistKey(placeId?: string | null, placeName = '') {
  const normalizedId = placeId?.trim()

  if (normalizedId) {
    return `id:${normalizedId}`
  }

  return `name:${normalizeBlacklistName(placeName)}`
}

function normalizeBlacklistName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR')
}

function createBookingSummaryCacheKey(
  date: string,
  targets: PlaceBookingSummaryRequestItem[],
) {
  return JSON.stringify([
    date,
    targets.map((target) => [
      target.placeId,
      target.rank,
      target.bookingBusinessId ?? '',
      target.bookingUrl ?? '',
    ]),
  ])
}

function readCachedBookingSummary(cacheKey: string) {
  const cached = bookingSummaryCache.get(cacheKey)

  if (!cached) {
    return null
  }

  if (cached.expiresAt <= Date.now()) {
    bookingSummaryCache.delete(cacheKey)

    return null
  }

  return cached.response
}

function normalizeDate(value?: string) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
