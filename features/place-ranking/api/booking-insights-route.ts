import { NextResponse } from 'next/server'
import type {
  PlaceBookingInsightBlock,
  PlaceBookingInsightCalendarRequest,
  PlaceBookingInsightDay,
  PlaceBookingInsightResponse,
  PlaceBookingProduct,
  PlaceBookingStatusResponse,
} from '../types'
import { collectNaverBookingStatus } from '../server/naver-booking-status'

const bookingInsightConcurrency = 4
const bookingInsightCacheTtlMs = 1000 * 60 * 5
const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토']
const maxForecastDays = 28
const bookingInsightCache = new Map<
  string,
  {
    expiresAt: number
    response: PlaceBookingInsightResponse
  }
>()

type CollectedStatus = {
  date: string
  response: PlaceBookingStatusResponse | null
  errorMessage?: string
}

type WeekdayPattern = {
  weekday: number
  activeDayCount: number
  totalBookedCount: number
  timeCounts: Map<string, number>
  minMinute: number | null
  maxMinute: number | null
}

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PlaceBookingInsightCalendarRequest
    const yearMonth = normalizeYearMonth(body.yearMonth)
    const cacheKey = createBookingInsightCacheKey(body, yearMonth)
    const cachedResponse = readCachedBookingInsight(cacheKey)

    if (cachedResponse) {
      return NextResponse.json(cachedResponse)
    }

    const today = getTodayKstDate()
    const forecastUntil = addDays(today, maxForecastDays)
    const monthDates = getMonthDateValues(yearMonth)
    const historyDates = getRecentHistoryDateValues(today, 56)
    const collectionDates = Array.from(new Set([...historyDates, ...monthDates])).sort()
    const collected = await runWithConcurrency(collectionDates, bookingInsightConcurrency, async (date) =>
      collectInsightStatus(body, date),
    )
    const collectedMap = new Map(collected.map((item) => [item.date, item]))
    const historyStatuses = historyDates
      .map((date) => collectedMap.get(date))
      .filter((item): item is CollectedStatus => Boolean(item?.response))
    const patterns = createWeekdayPatterns(historyStatuses)
    const monthDays = monthDates.reduce<Record<string, PlaceBookingInsightDay>>((accumulator, date) => {
      const collectedDay = collectedMap.get(date)
      accumulator[date] = createInsightDay({
        collected: collectedDay,
        date,
        forecastUntil,
        patterns,
        today,
      })

      return accumulator
    }, {})
    const response: PlaceBookingInsightResponse = {
      yearMonth,
      generatedAt: new Date().toISOString(),
      forecastUntil,
      days: monthDays,
      accuracy: createAccuracySummary({
        collectedMap,
        historyDates,
        monthDates,
        patterns,
        today,
      }),
      summary: createInsightSummary({
        days: monthDays,
        patterns,
        today,
      }),
    }

    bookingInsightCache.set(cacheKey, {
      expiresAt: Date.now() + bookingInsightCacheTtlMs,
      response,
    })

    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof Error) {
      console.error('Naver booking insight calendar error', {
        message: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      {
        message: 'AI 예약 수요 캘린더를 생성하는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
        debug:
          error instanceof Error
            ? {
                provider: 'booking-insights',
                message: error.message,
                createdAt: new Date().toISOString(),
              }
            : undefined,
      },
      { status: 500 },
    )
  }
}

async function collectInsightStatus(
  body: PlaceBookingInsightCalendarRequest,
  date: string,
): Promise<CollectedStatus> {
  try {
    return {
      date,
      response: await collectNaverBookingStatus({
        bookingBusinessId: body.bookingBusinessId,
        bookingUrl: body.bookingUrl,
        date,
      }),
    }
  } catch (error) {
    return {
      date,
      response: null,
      errorMessage: error instanceof Error ? error.message : '예약 데이터를 수집하지 못했습니다.',
    }
  }
}

function createInsightDay({
  collected,
  date,
  forecastUntil,
  patterns,
  today,
}: {
  collected?: CollectedStatus
  date: string
  forecastUntil: string
  patterns: Map<number, WeekdayPattern>
  today: string
}): PlaceBookingInsightDay {
  const isPast = date < today
  const isToday = date === today
  const isFuture = date > today
  const response = collected?.response ?? null
  const actualBlocks = response ? createActualBlocks(response) : []
  const weekday = createLocalDate(date).getDay()
  const pattern = patterns.get(weekday)
  const isClosed = isLikelyClosedDay(pattern, response)
  const aiBlocks =
    !isPast && date <= forecastUntil && !isClosed && response
      ? createAiBlocks({
          actualBlocks,
          date,
          isToday,
          pattern,
          products: response.products,
        })
      : []

  return {
    date,
    isPast,
    isToday,
    isFuture,
    isClosed,
    status: response ? 'ready' : 'failed',
    actualBlocks,
    aiBlocks,
    bookedCount: actualBlocks.length,
    predictedAdditionalCount: aiBlocks.length,
    expectedFinalCount: actualBlocks.length + aiBlocks.length,
    message: response ? undefined : collected?.errorMessage ?? '예약 데이터를 수집하지 못했습니다.',
  }
}

function createActualBlocks(response: PlaceBookingStatusResponse): PlaceBookingInsightBlock[] {
  return response.products.flatMap((product) =>
    product.slots
      .filter((slot) => slot.status === 'booked')
      .flatMap((slot) => {
        const count = Math.max(slot.bookingCount, 1)

        return Array.from({ length: count }, (_, index) => ({
          id: `actual:${response.date}:${product.id}:${slot.time}:${index}`,
          type: 'actual' as const,
          date: response.date,
          time: slot.time,
          label: slot.time,
          productName: product.name,
        }))
      }),
  ).sort((left, right) => left.time.localeCompare(right.time))
}

function createAiBlocks({
  actualBlocks,
  date,
  isToday,
  pattern,
  products,
}: {
  actualBlocks: PlaceBookingInsightBlock[]
  date: string
  isToday: boolean
  pattern?: WeekdayPattern
  products: PlaceBookingProduct[]
}): PlaceBookingInsightBlock[] {
  if (!pattern || pattern.activeDayCount === 0 || pattern.totalBookedCount === 0) {
    return []
  }

  const nowMinute = isToday ? getCurrentKstMinute() : null
  const actualTimes = new Set(actualBlocks.map((block) => block.time))
  const availableTimes = createAvailableTimeSet(products)
  const bookedTimes = createBookedTimeSet(products)
  const threshold = Math.max(2, Math.ceil(pattern.activeDayCount * 0.24))
  const candidates = Array.from(pattern.timeCounts.entries())
    .filter(([time, count]) => {
      const minute = parseTimeToMinute(time)

      return (
        minute !== null &&
        count >= threshold &&
        availableTimes.has(time) &&
        !bookedTimes.has(time) &&
        !actualTimes.has(time) &&
        isInsideOperationWindow(minute, pattern) &&
        (nowMinute === null || minute > nowMinute + 30)
      )
    })
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)

  return candidates.map(([time, count], index) => ({
    id: `ai:${date}:${time}:${index}`,
    type: 'ai',
    date,
    time,
    label: time,
    confidence: Math.min(92, Math.round((count / Math.max(pattern.activeDayCount, 1)) * 100)),
    reason: `${weekdayLabels[pattern.weekday]}요일 최근 8주 패턴에서 예약 빈도가 높은 시간대입니다.`,
    basis: [
      `최근 8주 ${weekdayLabels[pattern.weekday]}요일 중 ${count}회 예약 신호가 확인되었습니다.`,
      '실제 예약이 이미 잡힌 시간과 영업시간 외 시간은 제외했습니다.',
      isToday ? '오늘은 현재 시간 이후 예약 가능한 슬롯만 반영했습니다.' : '예약 가능한 슬롯 중 발생 확률이 높은 시간만 표시했습니다.',
    ],
  }))
}

function createWeekdayPatterns(statuses: CollectedStatus[]) {
  const patterns = new Map<number, WeekdayPattern>()

  statuses.forEach((item) => {
    if (!item.response) {
      return
    }

    const weekday = createLocalDate(item.date).getDay()
    const pattern =
      patterns.get(weekday) ??
      {
        weekday,
        activeDayCount: 0,
        totalBookedCount: 0,
        timeCounts: new Map<string, number>(),
        minMinute: null,
        maxMinute: null,
      }
    const actualBlocks = createActualBlocks(item.response)

    if (actualBlocks.length > 0) {
      pattern.activeDayCount += 1
    }

    actualBlocks.forEach((block) => {
      const minute = parseTimeToMinute(block.time)
      pattern.totalBookedCount += 1
      pattern.timeCounts.set(block.time, (pattern.timeCounts.get(block.time) ?? 0) + 1)

      if (minute !== null) {
        pattern.minMinute = pattern.minMinute === null ? minute : Math.min(pattern.minMinute, minute)
        pattern.maxMinute = pattern.maxMinute === null ? minute : Math.max(pattern.maxMinute, minute + 60)
      }
    })

    patterns.set(weekday, pattern)
  })

  return patterns
}

function createAccuracySummary({
  collectedMap,
  historyDates,
  monthDates,
  patterns,
  today,
}: {
  collectedMap: Map<string, CollectedStatus>
  historyDates: string[]
  monthDates: string[]
  patterns: Map<number, WeekdayPattern>
  today: string
}): PlaceBookingInsightResponse['accuracy'] {
  const recent7Dates = historyDates.slice(-7)
  const recent28Dates = historyDates.slice(-28)
  const monthToDate = monthDates.filter((date) => date < today)

  return {
    recent7Days: calculateBacktestAccuracy('최근 7일', recent7Dates, collectedMap, patterns),
    recent4Weeks: calculateBacktestAccuracy('최근 4주', recent28Dates, collectedMap, patterns),
    monthToDate: calculateBacktestAccuracy('이번 달', monthToDate, collectedMap, patterns),
  }
}

function calculateBacktestAccuracy(
  label: string,
  dates: string[],
  collectedMap: Map<string, CollectedStatus>,
  patterns: Map<number, WeekdayPattern>,
) {
  let total = 0
  let matched = 0

  dates.forEach((date) => {
    const response = collectedMap.get(date)?.response
    const pattern = patterns.get(createLocalDate(date).getDay())

    if (!response || !pattern || pattern.activeDayCount === 0) {
      return
    }

    const actualTimes = new Set(createActualBlocks(response).map((block) => block.time))
    const threshold = Math.max(2, Math.ceil(pattern.activeDayCount * 0.24))
    const predictedTimes = Array.from(pattern.timeCounts.entries())
      .filter(([, count]) => count >= threshold)
      .map(([time]) => time)

    predictedTimes.forEach((time) => {
      total += 1
      if (actualTimes.has(time) || hasNearbyActualTime(time, actualTimes)) {
        matched += 1
      }
    })
  })

  return {
    label,
    percent: total > 0 ? Math.round((matched / total) * 100) : 0,
    matched,
    total,
  }
}

function createInsightSummary({
  days,
  patterns,
  today,
}: {
  days: Record<string, PlaceBookingInsightDay>
  patterns: Map<number, WeekdayPattern>
  today: string
}): PlaceBookingInsightResponse['summary'] {
  const dayList = Object.values(days)
  const monthActualBookings = dayList.reduce((sum, day) => sum + day.bookedCount, 0)
  const monthAiPredictedBookings = dayList.reduce((sum, day) => sum + day.predictedAdditionalCount, 0)
  const monthExpectedFinalBookings = monthActualBookings + monthAiPredictedBookings
  const thisWeekDates = getWeekDateValues(today)
  const thisWeekExpectedBookings = thisWeekDates.reduce((sum, date) => {
    const day = days[date]

    return sum + (day?.expectedFinalCount ?? estimateExpectedBookingsFromPattern(date, patterns))
  }, 0)
  const recentEightWeekAverage = roundToOne(
    Array.from(patterns.values()).reduce(
      (sum, pattern) => sum + pattern.totalBookedCount / 8,
      0,
    ),
  )
  const comparisonRate = calculateComparisonRate(thisWeekExpectedBookings, recentEightWeekAverage)
  const statusLabel = comparisonRate <= -15 ? '주의' : comparisonRate >= 15 ? '좋음' : '보통'
  const futureDays = dayList.filter((day) => day.date >= today && !day.isClosed)
  const busyDates = futureDays
    .filter((day) => day.expectedFinalCount >= 3)
    .sort((left, right) => right.expectedFinalCount - left.expectedFinalCount)
    .slice(0, 5)
    .map((day) => day.date)
  const quietDates = futureDays
    .filter((day) => day.expectedFinalCount <= 1)
    .slice(0, 5)
    .map((day) => day.date)
  const timeCounts = new Map<string, number>()

  futureDays.forEach((day) => {
    day.aiBlocks.forEach((block) => {
      timeCounts.set(block.time, (timeCounts.get(block.time) ?? 0) + 1)
    })
  })

  const busyTimes = Array.from(timeCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([time]) => time)
  const quietTimes = getQuietTimes(patterns)

  return {
    monthActualBookings,
    monthAiPredictedBookings,
    monthExpectedFinalBookings,
    thisWeekExpectedBookings,
    recentEightWeekAverage,
    comparisonRate,
    statusLabel,
    busyDates,
    quietDates,
    busyTimes,
    quietTimes,
    insight:
      statusLabel === '좋음'
        ? '이번 주는 최근 평균보다 예약 흐름이 강한 편입니다.'
        : statusLabel === '주의'
          ? '이번 주는 최근 평균보다 예약 흐름이 낮아 주의 깊게 확인하는 편이 좋습니다.'
          : '이번 주는 최근 평균과 비슷한 예약 흐름입니다.',
  }
}

function isLikelyClosedDay(pattern: WeekdayPattern | undefined, response: PlaceBookingStatusResponse | null) {
  if (response) {
    const hasActiveSlot = response.products.some((product) =>
      product.slots.some((slot) => slot.status === 'available' || slot.status === 'booked'),
    )

    if (hasActiveSlot) {
      return false
    }
  }

  return !pattern || pattern.activeDayCount === 0
}

function createAvailableTimeSet(products: PlaceBookingProduct[]) {
  const times = new Set<string>()
  products.forEach((product) => {
    product.slots.forEach((slot) => {
      if (slot.status === 'available' && slot.remaining > 0) {
        times.add(slot.time)
      }
    })
  })

  return times
}

function createBookedTimeSet(products: PlaceBookingProduct[]) {
  const times = new Set<string>()
  products.forEach((product) => {
    product.slots.forEach((slot) => {
      if (slot.status === 'booked' || slot.statusReason === 'booking_related_block_estimated') {
        times.add(slot.time)
      }
    })
  })

  return times
}

function isInsideOperationWindow(minute: number, pattern: WeekdayPattern) {
  if (pattern.minMinute === null || pattern.maxMinute === null) {
    return false
  }

  return minute >= pattern.minMinute && minute < pattern.maxMinute
}

function estimateExpectedBookingsFromPattern(date: string, patterns: Map<number, WeekdayPattern>) {
  const pattern = patterns.get(createLocalDate(date).getDay())
  if (!pattern) {
    return 0
  }

  return Math.round(pattern.totalBookedCount / 8)
}

function getQuietTimes(patterns: Map<number, WeekdayPattern>) {
  const counts = new Map<string, number>()

  patterns.forEach((pattern) => {
    pattern.timeCounts.forEach((count, time) => {
      counts.set(time, (counts.get(time) ?? 0) + count)
    })
  })

  return Array.from(counts.entries())
    .filter(([, count]) => count <= 1)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([time]) => time)
}

function getWeekDateValues(dateValue: string) {
  const date = createLocalDate(dateValue)
  const weekday = date.getDay()
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday
  const monday = new Date(date)
  monday.setDate(date.getDate() + mondayOffset)

  return Array.from({ length: 7 }, (_, index) => {
    const item = new Date(monday)
    item.setDate(monday.getDate() + index)

    return formatDateValue(item)
  })
}

function getRecentHistoryDateValues(today: string, dayCount: number) {
  const todayDate = createLocalDate(today)

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(todayDate)
    date.setDate(todayDate.getDate() - dayCount + index)

    return formatDateValue(date)
  })
}

function getMonthDateValues(yearMonth: string) {
  const [year, month] = yearMonth.split('-').map(Number)
  const lastDate = new Date(year, month, 0).getDate()

  return Array.from({ length: lastDate }, (_, index) => {
    const day = String(index + 1).padStart(2, '0')

    return `${yearMonth}-${day}`
  })
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

function createBookingInsightCacheKey(
  body: PlaceBookingInsightCalendarRequest,
  yearMonth: string,
) {
  return JSON.stringify([
    yearMonth,
    body.bookingBusinessId?.trim() ?? '',
    body.bookingUrl?.trim() ?? '',
    getTodayKstDate(),
  ])
}

function readCachedBookingInsight(cacheKey: string) {
  const cached = bookingInsightCache.get(cacheKey)

  if (!cached) {
    return null
  }

  if (cached.expiresAt <= Date.now()) {
    bookingInsightCache.delete(cacheKey)

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

function getTodayKstDate() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function getCurrentKstMinute() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  }).formatToParts(new Date())
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0')

  return hour * 60 + minute
}

function addDays(dateValue: string, days: number) {
  const date = createLocalDate(dateValue)
  date.setDate(date.getDate() + days)

  return formatDateValue(date)
}

function createLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)

  return new Date(year, month - 1, day)
}

function formatDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
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

function hasNearbyActualTime(time: string, actualTimes: Set<string>) {
  const minute = parseTimeToMinute(time)
  if (minute === null) {
    return false
  }

  return Array.from(actualTimes).some((actualTime) => {
    const actualMinute = parseTimeToMinute(actualTime)

    return actualMinute !== null && Math.abs(actualMinute - minute) <= 60
  })
}

function calculateComparisonRate(value: number, baseline: number) {
  if (baseline <= 0) {
    return value > 0 ? 100 : 0
  }

  return Math.round(((value - baseline) / baseline) * 100)
}

function roundToOne(value: number) {
  return Math.round(value * 10) / 10
}
