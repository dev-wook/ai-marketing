import { NextResponse } from 'next/server'
import type {
  PlaceBookingCalendarDaySummary,
  PlaceBookingCalendarRequest,
  PlaceBookingCalendarResponse,
} from '../types'
import { collectNaverBookingStatus } from '../server/naver-booking-status'

const bookingCalendarConcurrency = 4
const bookingCalendarCacheTtlMs = 1000 * 60 * 5
const bookingCalendarCache = new Map<
  string,
  {
    expiresAt: number
    response: PlaceBookingCalendarResponse
  }
>()

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PlaceBookingCalendarRequest
    const yearMonth = normalizeYearMonth(body.yearMonth)
    const cacheKey = createBookingCalendarCacheKey(body, yearMonth)
    const cachedResponse = readCachedBookingCalendar(cacheKey)

    if (cachedResponse) {
      return NextResponse.json(cachedResponse)
    }

    const dates = getMonthDateValues(yearMonth)
    const summaries = await runWithConcurrency(
      dates,
      bookingCalendarConcurrency,
      async (date) => collectCalendarDaySummary(body, date),
    )
    const response: PlaceBookingCalendarResponse = {
      yearMonth,
      days: summaries.reduce<Record<string, PlaceBookingCalendarDaySummary>>(
        (accumulator, summary) => {
          accumulator[summary.date] = summary

          return accumulator
        },
        {},
      ),
    }

    bookingCalendarCache.set(cacheKey, {
      expiresAt: Date.now() + bookingCalendarCacheTtlMs,
      response,
    })

    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof Error) {
      console.error('Naver booking calendar error', {
        message: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      {
        message: '예약 캘린더를 확인하는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
        debug:
          error instanceof Error
            ? {
                provider: 'naver-booking-calendar',
                message: error.message,
                createdAt: new Date().toISOString(),
              }
            : undefined,
      },
      { status: 500 },
    )
  }
}

async function collectCalendarDaySummary(
  body: PlaceBookingCalendarRequest,
  date: string,
): Promise<PlaceBookingCalendarDaySummary> {
  try {
    const response = await collectNaverBookingStatus({
      bookingUrl: body.bookingUrl,
      bookingBusinessId: body.bookingBusinessId,
      date,
    })
    const summary = response.products.reduce(
      (accumulator, product) => ({
        bookedSlots: accumulator.bookedSlots + product.summary.bookedSlots,
        availableSlots: accumulator.availableSlots + product.summary.availableSlots,
        productCount: accumulator.productCount + 1,
      }),
      {
        bookedSlots: 0,
        availableSlots: 0,
        productCount: 0,
      },
    )

    return {
      date,
      status: 'ready',
      bookedSlots: summary.bookedSlots,
      availableSlots: summary.availableSlots,
      productCount: summary.productCount,
    }
  } catch (error) {
    return {
      date,
      status: 'failed',
      bookedSlots: 0,
      availableSlots: 0,
      productCount: 0,
      message: error instanceof Error ? error.message : '예약 캘린더 조회에 실패했습니다.',
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

function createBookingCalendarCacheKey(
  body: PlaceBookingCalendarRequest,
  yearMonth: string,
) {
  return JSON.stringify([
    yearMonth,
    body.bookingBusinessId?.trim() ?? '',
    body.bookingUrl?.trim() ?? '',
  ])
}

function readCachedBookingCalendar(cacheKey: string) {
  const cached = bookingCalendarCache.get(cacheKey)

  if (!cached) {
    return null
  }

  if (cached.expiresAt <= Date.now()) {
    bookingCalendarCache.delete(cacheKey)

    return null
  }

  return cached.response
}

function normalizeYearMonth(value?: string) {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    return value
  }

  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

function getMonthDateValues(yearMonth: string) {
  const [year, month] = yearMonth.split('-').map(Number)
  const lastDate = new Date(year, month, 0).getDate()

  return Array.from({ length: lastDate }, (_, index) => {
    const day = String(index + 1).padStart(2, '0')

    return `${yearMonth}-${day}`
  })
}
