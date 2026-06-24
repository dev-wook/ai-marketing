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
            bookingRelatedBlockedCount: 0,
            manualBlockedCount: 0,
            offHoursClosedCount: 0,
            demandScore: 0,
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

          if (slot.statusReason === 'off_hours') {
            bucket.offHoursClosedCount += 1
          } else if (isClosedSlotNearBookedSlot(slot.time, product.slots)) {
            bucket.bookingRelatedBlockedCount += 1
          } else {
            bucket.manualBlockedCount += 1
          }
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
      (bucket) =>
        bucket.bookedCount > 0 ||
        bucket.availableCount > 0 ||
        bucket.bookingRelatedBlockedCount > 0,
    )
    const averageDemand =
      activeBuckets.reduce((sum, bucket) => sum + getBucketDemandScore(bucket), 0) /
      Math.max(activeBuckets.length, 1)
    const maxDemand = Math.max(...activeBuckets.map(getBucketDemandScore), 0)
    const minDemand = Math.min(...activeBuckets.map(getBucketDemandScore), 0)
    const normalizedBuckets = buckets.map((bucket) => ({
      ...bucket,
      demandScore: roundToOne(getBucketDemandScore(bucket)),
      intensity: classifyBucketIntensity(bucket, averageDemand, maxDemand, minDemand),
    }))

    return {
      productId: product.productId,
      productName: product.productName,
      buckets: normalizedBuckets,
      busiestTimes: normalizedBuckets
        .filter((bucket) => bucket.intensity === 'busy')
        .sort((left, right) => right.demandScore - left.demandScore)
        .slice(0, 3)
        .map((bucket) => bucket.time),
      quietTimes: normalizedBuckets
        .filter((bucket) => bucket.intensity === 'quiet')
        .sort((left, right) => left.demandScore - right.demandScore)
        .slice(0, 3)
        .map((bucket) => bucket.time),
    }
  })
}

function classifyBucketIntensity(
  bucket: PlaceBookingPatternTimeBucket,
  averageDemand: number,
  maxDemand: number,
  minDemand: number,
): PlaceBookingPatternTimeBucket['intensity'] {
  const demandScore = getBucketDemandScore(bucket)

  if (bucket.offHoursClosedCount > 0 && bucket.observedCount === bucket.offHoursClosedCount) {
    return 'normal'
  }

  if (
    bucket.bookedCount === 0 &&
    bucket.bookingRelatedBlockedCount === 0 &&
    bucket.availableCount > 0
  ) {
    return 'quiet'
  }

  if (maxDemand > minDemand && demandScore >= Math.max(2, averageDemand * 1.25)) {
    return 'busy'
  }

  if (
    bucket.availableCount > 0 &&
    bucket.manualBlockedCount <= bucket.availableCount &&
    demandScore <= Math.max(0.5, averageDemand * 0.55)
  ) {
    return 'quiet'
  }

  return 'normal'
}

function getBucketDemandScore(bucket: PlaceBookingPatternTimeBucket) {
  return bucket.bookedCount + bucket.bookingRelatedBlockedCount * 0.65
}

function isClosedSlotNearBookedSlot(time: string, slots: Array<{ time: string; status: string }>) {
  const minute = parseTimeToMinute(time)

  if (minute === null) {
    return false
  }

  return slots.some((slot) => {
    if (slot.status !== 'booked') {
      return false
    }

    const bookedMinute = parseTimeToMinute(slot.time)

    return bookedMinute !== null && Math.abs(bookedMinute - minute) <= 90
  })
}

function parseTimeToMinute(time: string) {
  const [hourText, minuteText] = time.split(':')
  const hour = Number(hourText)
  const minute = Number(minuteText)

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null
  }

  return hour * 60 + minute
}

function roundToOne(value: number) {
  return Math.round(value * 10) / 10
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
