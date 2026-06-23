import { NextResponse } from 'next/server'
import type {
  PlaceBookingPatternProduct,
  PlaceBookingPatternRequest,
  PlaceBookingPatternResponse,
  PlaceBookingPatternTimeBucket,
  PlaceBookingStatusResponse,
} from '../types'
import { collectNaverBookingStatus } from '../server/naver-booking-status'

const bookingPatternConcurrency = 3
const bookingPatternCacheTtlMs = 1000 * 60 * 10
const bookingPatternCache = new Map<
  string,
  {
    expiresAt: number
    response: PlaceBookingPatternResponse
  }
>()
const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토']

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

    const dates = getRecentSameWeekdayDates(targetDate)
    const snapshots = await runWithConcurrency(
      dates,
      bookingPatternConcurrency,
      async (date) => collectPatternSnapshot(body, date),
    )
    const succeeded = snapshots.filter(
      (snapshot): snapshot is { date: string; response: PlaceBookingStatusResponse } =>
        Boolean(snapshot.response),
    )
    const response: PlaceBookingPatternResponse = {
      targetDate,
      weekdayLabel: weekdayLabels[getDateParts(targetDate).weekday] ?? '',
      periodStart: dates[0] ?? targetDate,
      periodEnd: dates[dates.length - 1] ?? targetDate,
      sampledDateCount: succeeded.length,
      failedDateCount: snapshots.length - succeeded.length,
      products: createPatternProducts(succeeded.map((snapshot) => snapshot.response)),
    }

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

async function collectPatternSnapshot(
  body: PlaceBookingPatternRequest,
  date: string,
): Promise<{ date: string; response: PlaceBookingStatusResponse | null }> {
  try {
    const response = await collectNaverBookingStatus({
      bookingUrl: body.bookingUrl,
      bookingBusinessId: body.bookingBusinessId,
      date,
    })

    return { date, response }
  } catch {
    return { date, response: null }
  }
}

function createPatternProducts(responses: PlaceBookingStatusResponse[]) {
  const productMap = new Map<
    string,
    {
      productId: string
      productName: string
      buckets: Map<string, PlaceBookingPatternTimeBucket>
    }
  >()

  responses.forEach((response) => {
    response.products.forEach((product) => {
      const productState =
        productMap.get(product.id) ??
        {
          productId: product.id,
          productName: product.name,
          buckets: new Map<string, PlaceBookingPatternTimeBucket>(),
        }

      product.slots.forEach((slot) => {
        const bucket =
          productState.buckets.get(slot.time) ??
          {
            time: slot.time,
            bookedCount: 0,
            availableCount: 0,
            closedCount: 0,
            observedCount: 0,
            intensity: 'normal',
          }

        bucket.observedCount += 1

        if (slot.status === 'booked') {
          bucket.bookedCount += 1
        } else if (slot.status === 'available') {
          bucket.availableCount += 1
        } else {
          bucket.closedCount += 1
        }

        productState.buckets.set(slot.time, bucket)
      })

      productMap.set(product.id, productState)
    })
  })

  return Array.from(productMap.values()).map<PlaceBookingPatternProduct>((product) => {
    const buckets = Array.from(product.buckets.values())
      .filter((bucket) => bucket.time)
      .sort((left, right) => left.time.localeCompare(right.time))
    const activeBuckets = buckets.filter(
      (bucket) => bucket.bookedCount > 0 || bucket.availableCount > 0,
    )
    const averageBooked =
      activeBuckets.reduce((sum, bucket) => sum + bucket.bookedCount, 0) /
      Math.max(activeBuckets.length, 1)
    const maxBooked = Math.max(...activeBuckets.map((bucket) => bucket.bookedCount), 0)
    const minBooked = Math.min(...activeBuckets.map((bucket) => bucket.bookedCount), 0)
    const normalizedBuckets = buckets.map((bucket) => ({
      ...bucket,
      intensity: classifyBucketIntensity(bucket, averageBooked, maxBooked, minBooked),
    }))

    return {
      productId: product.productId,
      productName: product.productName,
      buckets: normalizedBuckets,
      busiestTimes: normalizedBuckets
        .filter((bucket) => bucket.intensity === 'busy')
        .slice(0, 3)
        .map((bucket) => bucket.time),
      quietTimes: normalizedBuckets
        .filter((bucket) => bucket.intensity === 'quiet')
        .slice(0, 3)
        .map((bucket) => bucket.time),
    }
  })
}

function classifyBucketIntensity(
  bucket: PlaceBookingPatternTimeBucket,
  averageBooked: number,
  maxBooked: number,
  minBooked: number,
): PlaceBookingPatternTimeBucket['intensity'] {
  if (bucket.bookedCount === 0 && bucket.availableCount > 0) {
    return 'quiet'
  }

  if (maxBooked > minBooked && bucket.bookedCount >= Math.max(2, averageBooked * 1.25)) {
    return 'busy'
  }

  if (bucket.availableCount > 0 && bucket.bookedCount <= Math.max(0, averageBooked * 0.5)) {
    return 'quiet'
  }

  return 'normal'
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

function getRecentSameWeekdayDates(targetDate: string) {
  const target = createLocalDate(targetDate)
  const today = createLocalDate(getTodayKstDate())
  const endDate = target.getTime() < today.getTime() ? target : today
  const startDate = new Date(endDate)

  startDate.setMonth(startDate.getMonth() - 3)

  const dates: string[] = []
  const cursor = new Date(startDate)

  while (cursor.getDay() !== target.getDay()) {
    cursor.setDate(cursor.getDate() + 1)
  }

  while (cursor <= endDate) {
    dates.push(formatDateValue(cursor))
    cursor.setDate(cursor.getDate() + 7)
  }

  return dates
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

  return getTodayKstDate()
}

function getTodayKstDate() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function getDateParts(value: string) {
  const date = createLocalDate(value)

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    weekday: date.getDay(),
  }
}

function createLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)

  return new Date(year, month - 1, day)
}

function formatDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}
