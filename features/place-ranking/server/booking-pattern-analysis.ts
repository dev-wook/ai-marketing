import type {
  PlaceBookingPatternProduct,
  PlaceBookingPatternRequest,
  PlaceBookingPatternResponse,
  PlaceBookingPatternTimeBucket,
  PlaceBookingStatusResponse,
} from '../types'
import { collectNaverBookingStatus } from './naver-booking-status'

const bookingPatternConcurrency = 3
const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토']

export async function collectBookingPatternAnalysis(
  body: PlaceBookingPatternRequest,
  targetDate = normalizeDate(body.targetDate),
  options: { maxSampleDates?: number } = {},
): Promise<PlaceBookingPatternResponse> {
  const dates = limitRecentDates(getRecentSameWeekdayDates(targetDate), options.maxSampleDates)
  const snapshots = await runWithConcurrency(
    dates,
    bookingPatternConcurrency,
    async (date) => collectPatternSnapshot(body, date),
  )
  const succeeded = snapshots.filter(
    (snapshot): snapshot is { date: string; response: PlaceBookingStatusResponse } =>
      Boolean(snapshot.response),
  )

  return {
    targetDate,
    weekdayLabel: weekdayLabels[getDateParts(targetDate).weekday] ?? '',
    periodStart: dates[0] ?? targetDate,
    periodEnd: dates[dates.length - 1] ?? targetDate,
    sampledDateCount: succeeded.length,
    failedDateCount: snapshots.length - succeeded.length,
    products: createPatternProducts(succeeded.map((snapshot) => snapshot.response)),
  }
}

export async function collectCycleWindowStatus({
  bookingBusinessId,
  bookingUrl,
  targetDate,
}: PlaceBookingPatternRequest & { targetDate: string }) {
  const dates = getCycleWindowDates(targetDate)
  const snapshots = await runWithConcurrency(dates, bookingPatternConcurrency, async (date) =>
    collectPatternSnapshot({ bookingBusinessId, bookingUrl, targetDate: date }, date),
  )
  const succeeded = snapshots.filter(
    (snapshot): snapshot is { date: string; response: PlaceBookingStatusResponse } =>
      Boolean(snapshot.response),
  )

  return {
    periodStart: dates[0] ?? targetDate,
    periodEnd: dates[dates.length - 1] ?? targetDate,
    sampledDateCount: succeeded.length,
    failedDateCount: snapshots.length - succeeded.length,
    products: createPatternProducts(succeeded.map((snapshot) => snapshot.response)),
  }
}

export async function runWithConcurrency<T, R>(
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

function getCycleWindowDates(targetDate: string) {
  const target = createLocalDate(targetDate)
  const fourWeeksAgo = new Date(target)
  const fiveWeeksAgo = new Date(target)

  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)
  fiveWeeksAgo.setDate(fiveWeeksAgo.getDate() - 35)

  return [fiveWeeksAgo, fourWeeksAgo].map(formatDateValue)
}

function limitRecentDates(dates: string[], maxSampleDates?: number) {
  if (!maxSampleDates || dates.length <= maxSampleDates) {
    return dates
  }

  return dates.slice(-maxSampleDates)
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
