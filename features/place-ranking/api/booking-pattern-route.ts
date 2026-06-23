import { NextResponse } from 'next/server'
import type { PlaceBookingPatternRequest, PlaceBookingPatternResponse } from '../types'
import { collectBookingPatternAnalysis } from '../server/booking-pattern-analysis'

const bookingPatternCacheTtlMs = 1000 * 60 * 10
const bookingPatternCache = new Map<
  string,
  {
    expiresAt: number
    response: PlaceBookingPatternResponse
  }
>()

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PlaceBookingPatternRequest
    const targetDate = normalizeDate(body.targetDate)
    const cacheKey = createBookingPatternCacheKey(body, targetDate)
    const cachedResponse = readCachedBookingPattern(cacheKey)

    if (cachedResponse) {
      return NextResponse.json(cachedResponse)
    }

    const response = await collectBookingPatternAnalysis(body, targetDate)

    bookingPatternCache.set(cacheKey, {
      expiresAt: Date.now() + bookingPatternCacheTtlMs,
      response,
    })

    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof Error) {
      console.error('Naver booking pattern error', {
        message: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      {
        message: '예약 시간대 패턴을 확인하는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
        debug:
          error instanceof Error
            ? {
                provider: 'naver-booking-pattern',
                message: error.message,
                createdAt: new Date().toISOString(),
              }
            : undefined,
      },
      { status: 500 },
    )
  }
}

function createBookingPatternCacheKey(body: PlaceBookingPatternRequest, targetDate: string) {
  return JSON.stringify([
    targetDate,
    body.bookingBusinessId?.trim() ?? '',
    body.bookingUrl?.trim() ?? '',
  ])
}

function readCachedBookingPattern(cacheKey: string) {
  const cached = bookingPatternCache.get(cacheKey)

  if (!cached) {
    return null
  }

  if (cached.expiresAt <= Date.now()) {
    bookingPatternCache.delete(cacheKey)

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
