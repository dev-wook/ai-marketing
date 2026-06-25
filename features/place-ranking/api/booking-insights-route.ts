import { NextResponse } from 'next/server'
import { generateGeminiText } from '@/lib/gemini'
import type {
  PlaceBookingInsightBlock,
  PlaceBookingInsightCalendarRequest,
  PlaceBookingInsightDay,
  PlaceBookingInsightResponse,
  PlaceBookingProduct,
  PlaceBookingStatusResponse,
} from '../types'
import { collectNaverBookingStatus } from '../server/naver-booking-status'
import {
  applyGeminiRepeatDemandPredictions,
  createFallbackRepeatDemandPredictions,
  createRepeatDemandAiBlocks,
  createRepeatDemandCandidates,
  type BookingDemandCandidate,
  type BookingDemandPrediction,
  type GeminiRepeatDemandResponse,
} from '../server/booking-repeat-demand'
import { bookingRepeatDemandConfig } from '../server/booking-repeat-demand-config'

const bookingInsightConcurrency = 4
const bookingInsightCacheTtlMs = 1000 * 60 * 5
const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토']
const maxForecastDays = bookingRepeatDemandConfig.maxForecastDays
const geminiInsightModels = [
  'gemini-3.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite',
]
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

type RepeatDemandDateCandidates = {
  actualBookedCount: number
  candidates: BookingDemandCandidate[]
  date: string
  daysUntilUse: number
  remainingDailyCapacity: number
}

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PlaceBookingInsightCalendarRequest
    const yearMonth = normalizeYearMonth(body.yearMonth)
    const productFilter = normalizeProductFilter(body)
    const today = getTodayKstDate()
    const currentKstMinute = getCurrentKstMinute()
    const cacheKey = createBookingInsightCacheKey(body, yearMonth, today, currentKstMinute)
    const cachedResponse = readCachedBookingInsight(cacheKey)

    if (cachedResponse) {
      return NextResponse.json(cachedResponse)
    }

    const forecastUntil = addDays(today, maxForecastDays)
    const monthDates = getMonthDateValues(yearMonth)
    const previousMonthDates = getPreviousMonthDateValues(yearMonth)
    const historyDates = getRecentHistoryDateValues(today, 56)
    const collectionDates = Array.from(new Set([...historyDates, ...previousMonthDates, ...monthDates])).sort()
    const collected = await runWithConcurrency(collectionDates, bookingInsightConcurrency, async (date) =>
      collectInsightStatus(body, date),
    )
    const collectedMap = new Map(collected.map((item) => [item.date, item]))
    const historyStatuses = historyDates
      .map((date) => collectedMap.get(date))
      .filter((item): item is CollectedStatus => Boolean(item?.response))
    const patterns = createWeekdayPatterns(historyStatuses, productFilter)
    const repeatDemandDateCandidates = createRepeatDemandDateCandidates({
      collectedMap,
      forecastUntil,
      historyStatuses,
      monthDates,
      productFilter,
      today,
      currentKstMinute,
    })
    const repeatDemandPredictions = await createRepeatDemandPredictions({
      dateCandidates: repeatDemandDateCandidates,
      forecastUntil,
      today,
    })
    const monthDays = monthDates.reduce<Record<string, PlaceBookingInsightDay>>((accumulator, date) => {
      const collectedDay = collectedMap.get(date)
      accumulator[date] = createInsightDay({
        collected: collectedDay,
        date,
        forecastUntil,
        patterns,
        productFilter,
        repeatDemandPredictions: repeatDemandPredictions.filter((prediction) => prediction.date === date),
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
        productFilter,
        today,
      }),
      summary: createInsightSummary({
        collectedMap,
        days: monthDays,
        monthDates,
        patterns,
        previousMonthDates,
        productFilter,
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
  productFilter,
  repeatDemandPredictions,
  today,
}: {
  collected?: CollectedStatus
  date: string
  forecastUntil: string
  patterns: Map<number, WeekdayPattern>
  productFilter: ProductFilter
  repeatDemandPredictions: BookingDemandPrediction[]
  today: string
}): PlaceBookingInsightDay {
  const isPast = date < today
  const isToday = date === today
  const isFuture = date > today
  const response = collected?.response ?? null
  const actualBlocks = response ? createActualBlocks(response, productFilter) : []
  const weekday = createLocalDate(date).getDay()
  const pattern = patterns.get(weekday)
  const isClosed = isLikelyClosedDay(pattern, response, productFilter)
  const aiBlocks =
    !isPast && date <= forecastUntil && !isClosed && response
      ? createRepeatDemandAiBlocks({
          date,
          predictions: repeatDemandPredictions,
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

type ProductFilter = {
  productId?: string
  productName?: string
}

function createActualBlocks(
  response: PlaceBookingStatusResponse,
  productFilter: ProductFilter = {},
): PlaceBookingInsightBlock[] {
  return filterProducts(response.products, productFilter).flatMap((product) =>
    product.slots
      .filter((slot) => slot.status === 'booked')
      .map((slot) => ({
        id: `actual:${response.date}:${product.id}:${slot.time}`,
        type: 'actual' as const,
        date: response.date,
        time: slot.time,
        label: slot.time,
        productName: product.name,
      })),
  ).sort((left, right) => left.time.localeCompare(right.time))
}

function filterProducts(products: PlaceBookingProduct[], productFilter: ProductFilter) {
  if (productFilter.productId) {
    return products.filter((product) => product.id === productFilter.productId)
  }

  if (productFilter.productName) {
    return products.filter((product) => product.name === productFilter.productName)
  }

  return products
}

function createRepeatDemandDateCandidates({
  collectedMap,
  currentKstMinute,
  forecastUntil,
  historyStatuses,
  monthDates,
  productFilter,
  today,
}: {
  collectedMap: Map<string, CollectedStatus>
  currentKstMinute: number
  forecastUntil: string
  historyStatuses: CollectedStatus[]
  monthDates: string[]
  productFilter: ProductFilter
  today: string
}): RepeatDemandDateCandidates[] {
  const historyResponses = historyStatuses
    .map((item) => item.response)
    .filter((response): response is PlaceBookingStatusResponse => Boolean(response))

  return monthDates
    .filter((date) => date >= today && date <= forecastUntil)
    .map((date) => {
      const response = collectedMap.get(date)?.response ?? null
      const products = response ? filterProducts(response.products, productFilter) : []
      const candidates = response
        ? createRepeatDemandCandidates({
            currentKstMinute,
            date,
            historyStatuses: historyResponses,
            products,
            productName: productFilter.productName,
            today,
          }).slice(0, bookingRepeatDemandConfig.maxCandidatesPerDateForGemini)
        : []

      return {
        actualBookedCount: response ? createActualBlocks(response, productFilter).length : 0,
        candidates,
        date,
        daysUntilUse: getDateDiffDays(today, date),
        remainingDailyCapacity: countRemainingCapacity(products),
      }
    })
    .filter((item) => item.candidates.length > 0)
}

async function createRepeatDemandPredictions({
  dateCandidates,
  forecastUntil,
  today,
}: {
  dateCandidates: RepeatDemandDateCandidates[]
  forecastUntil: string
  today: string
}) {
  const candidates = dateCandidates.flatMap((item) => item.candidates)
  const fallbackPredictions = createFallbackRepeatDemandPredictions(candidates)

  if (candidates.length === 0) {
    return []
  }

  try {
    const text = await withTimeout(
      generateGeminiText(createRepeatDemandGeminiPrompt({
        dateCandidates,
        forecastUntil,
        today,
      }), {
        task: 'realtime-diagnosis',
        modelCandidates: geminiInsightModels,
      }),
      bookingRepeatDemandConfig.geminiTimeoutMs,
    )
    const payload = parseJsonPayload<GeminiRepeatDemandResponse>(text)

    return applyGeminiRepeatDemandPredictions({
      candidates,
      payload,
    })
  } catch (error) {
    if (error instanceof Error) {
      console.warn('Gemini booking insight fallback used', {
        message: error.message,
      })
    }

    return fallbackPredictions
  }
}

function createRepeatDemandGeminiPrompt({
  dateCandidates,
  forecastUntil,
  today,
}: {
  dateCandidates: RepeatDemandDateCandidates[]
  forecastUntil: string
  today: string
}) {
  return `
당신은 소규모 예약제 뷰티 매장의 예약 수요를 분석하는 예측 모델입니다.

현재 고객을 식별할 수 있는 정보는 제공되지 않습니다.

과거 예약 1건은 실제 특정 고객의 재방문이 확인된 것이 아니라,
미래에 재방문할 가능성이 있는 익명의 수요 신호 1건을 의미합니다.

서버는 과거 예약 데이터와 실제 예약 가능 슬롯을 기준으로
미래 예약 후보 슬롯을 미리 생성했습니다.

당신의 역할은 서버가 전달한 후보 슬롯의 상대적인 수요 가능성을 평가하고,
날짜별·시간대별 예상 추가 예약 수요를 합리적으로 분배하는 것입니다.

라솝뷰티의 분석된 예약 패턴은 다음과 같습니다.

- 재방문 중심 주기는 약 30~36일입니다.
- 주요 재방문 주기는 20~45일입니다.
- 46~56일은 낮은 가중치의 보조 재방문 패턴입니다.
- 이전 예약 요일 기준 앞뒤 2일 이내 재방문 비중이 높습니다.
- 앞뒤 3일은 확장 가능 범위입니다.
- 이전 예약 시간 기준 앞뒤 2시간 이내 재방문 비중이 높습니다.
- 앞뒤 3시간은 낮은 가중치의 확장 범위입니다.
- 예약 신청은 이용일 당일~2일 전에 가장 많이 발생합니다.
- 예약의 대부분은 이용일 7일 이내에 신청됩니다.

평가 시 다음 원칙을 지키세요.

1. 입력으로 전달된 slotId만 반환하세요.
2. 새로운 날짜나 시간을 생성하지 마세요.
3. 실제 예약 가능 슬롯만 평가하세요.
4. 이미 예약되었거나 마감된 슬롯은 추천하지 마세요.
5. 재방문 주기가 30~36일에 가까울수록 중요하게 평가하세요.
6. 재방문 주기가 20~45일이면 주요 수요 신호로 평가하세요.
7. 46~56일은 낮은 가중치의 보조 신호로 평가하세요.
8. 같은 요일만 고집하지 말고 앞뒤 2일까지 주요 범위로 평가하세요.
9. 같은 시간만 고집하지 말고 앞뒤 2시간까지 주요 범위로 평가하세요.
10. 하나의 과거 예약 수요를 여러 슬롯에 중복하여 과대 계산하지 마세요.
11. 서버가 제공한 expectedRepeatDemand의 전체 합계를 임의로 크게 증가시키지 마세요.
12. 이용일까지 8일 이상 남았다면 수요는 존재할 수 있지만 아직 예약 신청 시점이 아닐 수 있음을 반영하세요.
13. 근거가 부족한 슬롯에는 높은 신뢰도를 부여하지 마세요.
14. 고객이 반드시 재방문한다고 단정하지 마세요.
15. 오늘 날짜 후보는 sameDayBookingWeight가 낮을수록 현재 시점에서 추가 예약 신청 여유가 적은 슬롯입니다.
16. 반드시 지정된 JSON 형식으로만 응답하세요.

응답 형식:
{
  "predictions": [
    {
      "slotId": "입력 후보 slotId",
      "adjustedDemand": 0,
      "geminiScore": 0,
      "confidence": 0,
      "reasonCodes": ["PEAK_REPEAT_CYCLE"]
    }
  ],
  "warnings": []
}

허용 reasonCodes:
PEAK_REPEAT_CYCLE, CORE_REPEAT_CYCLE, EXTENDED_REPEAT_CYCLE, SAME_WEEKDAY_MATCH, WEEKDAY_RANGE_MATCH,
WEEKDAY_RANGE_WEAK, SAME_TIME_MATCH, TIME_RANGE_MATCH, TIME_RANGE_WEAK, MULTIPLE_HISTORY_SIGNALS,
BOOKING_WINDOW_ACTIVE, BOOKING_WINDOW_APPROACHING, BOOKING_WINDOW_NOT_REACHED, LOW_HISTORY_SIGNAL,
CAPACITY_LIMITED

데이터:
${JSON.stringify({
  asOf: `${today}T00:00:00+09:00`,
  targetRange: {
    from: today,
    to: forecastUntil,
  },
  patternPolicy: {
    coreCycleDays: {
      min: 20,
      max: 45,
    },
    peakCycleDays: {
      min: 30,
      max: 36,
    },
    extendedCycleDays: {
      min: 46,
      max: 56,
    },
    primaryWeekdayDifference: 2,
    extendedWeekdayDifference: 3,
    primaryTimeDifferenceMinutes: 120,
    extendedTimeDifferenceMinutes: 180,
    maxGeminiAdjustmentRatio: bookingRepeatDemandConfig.maxGeminiAdjustmentRatio,
  },
  dates: dateCandidates.map((item) => ({
    date: item.date,
    daysUntilUse: item.daysUntilUse,
    actualBookedCount: item.actualBookedCount,
    remainingDailyCapacity: item.remainingDailyCapacity,
    candidates: item.candidates.map((candidate) => ({
      slotId: candidate.slotId,
      time: candidate.time,
      remainingCapacity: candidate.remainingCapacity,
      historicalSignalCount: candidate.historicalSignalCount,
      expectedRepeatDemand: candidate.expectedRepeatDemand,
      baselineScore: candidate.baselineScore,
      signals: {
        cycleScore: candidate.cycleScore,
        weekdayScore: candidate.weekdayScore,
        timeScore: candidate.timeScore,
        bookingTimingScore: candidate.bookingTimingScore,
        sameDayBookingWeight: candidate.sameDayBookingWeight,
        averageCycleDays: candidate.averageCycleDays,
      },
    })),
  })),
})}
`.trim()
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

function createWeekdayPatterns(statuses: CollectedStatus[], productFilter: ProductFilter) {
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
    const actualBlocks = createActualBlocks(item.response, productFilter)

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
  productFilter,
  today,
}: {
  collectedMap: Map<string, CollectedStatus>
  historyDates: string[]
  monthDates: string[]
  patterns: Map<number, WeekdayPattern>
  productFilter: ProductFilter
  today: string
}): PlaceBookingInsightResponse['accuracy'] {
  const recent7Dates = historyDates.slice(-7)
  const recent28Dates = historyDates.slice(-28)
  const monthToDate = monthDates.filter((date) => date < today)

  return {
    recent7Days: calculateBacktestAccuracy('최근 7일', recent7Dates, collectedMap, patterns, productFilter),
    recent4Weeks: calculateBacktestAccuracy('최근 4주', recent28Dates, collectedMap, patterns, productFilter),
    monthToDate: calculateBacktestAccuracy('이번 달', monthToDate, collectedMap, patterns, productFilter),
  }
}

function calculateBacktestAccuracy(
  label: string,
  dates: string[],
  collectedMap: Map<string, CollectedStatus>,
  patterns: Map<number, WeekdayPattern>,
  productFilter: ProductFilter,
) {
  let total = 0
  let matched = 0

  dates.forEach((date) => {
    const response = collectedMap.get(date)?.response
    const pattern = patterns.get(createLocalDate(date).getDay())

    if (!response || !pattern || pattern.activeDayCount === 0) {
      return
    }

    const actualTimes = new Set(createActualBlocks(response, productFilter).map((block) => block.time))
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
  collectedMap,
  days,
  monthDates,
  patterns,
  previousMonthDates,
  productFilter,
  today,
}: {
  collectedMap: Map<string, CollectedStatus>
  days: Record<string, PlaceBookingInsightDay>
  monthDates: string[]
  patterns: Map<number, WeekdayPattern>
  previousMonthDates: string[]
  productFilter: ProductFilter
  today: string
}): PlaceBookingInsightResponse['summary'] {
  const dayList = Object.values(days)
  const monthActualBookings = dayList.reduce((sum, day) => sum + day.bookedCount, 0)
  const monthAiPredictedBookings = dayList.reduce((sum, day) => sum + day.predictedAdditionalCount, 0)
  const monthAiDemandSlotCount = monthAiPredictedBookings
  const monthExpectedAdditionalDemandRange = calculateDemandRangeFromBlocks(
    dayList.flatMap((day) => day.aiBlocks),
  )
  const monthExpectedAdditionalDemandMin = monthExpectedAdditionalDemandRange.min
  const monthExpectedAdditionalDemandMax = monthExpectedAdditionalDemandRange.max
  const monthExpectedFinalBookingsMin = monthActualBookings + monthExpectedAdditionalDemandMin
  const monthExpectedFinalBookingsMax = monthActualBookings + monthExpectedAdditionalDemandMax
  const monthExpectedFinalBookings = monthExpectedFinalBookingsMax
  const thisWeekDates = getWeekDateValues(today)
  const lastWeekDates = getRelativeWeekDateValues(today, -1)
  const thisWeekExpectedBookings = calculateExpectedBookingsForDates(thisWeekDates, days, collectedMap, productFilter, 'max')
  const lastWeekBookings = calculateActualBookingsForDates(lastWeekDates, collectedMap, productFilter)
  const previousMonthActualBookings = calculateActualBookingsForDates(previousMonthDates, collectedMap, productFilter)
  const monthExpectedVsPreviousMonthRate = calculateRateOrNull(
    monthExpectedFinalBookingsMax,
    previousMonthActualBookings,
  )
  const weekOverWeekRate = calculateRateOrNull(thisWeekExpectedBookings, lastWeekBookings)
  const weeklyTrend = createWeeklyTrend({
    collectedMap,
    days,
    monthDates,
    productFilter,
  })
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
    monthAiDemandSlotCount,
    monthExpectedAdditionalDemandMin,
    monthExpectedAdditionalDemandMax,
    monthExpectedFinalBookings,
    monthExpectedFinalBookingsMin,
    monthExpectedFinalBookingsMax,
    previousMonthActualBookings,
    monthExpectedVsPreviousMonthRate,
    thisWeekExpectedBookings,
    lastWeekBookings,
    weekOverWeekRate,
    recentEightWeekAverage,
    comparisonRate,
    statusLabel,
    weeklyTrend,
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

function isLikelyClosedDay(
  pattern: WeekdayPattern | undefined,
  response: PlaceBookingStatusResponse | null,
  productFilter: ProductFilter,
) {
  if (response) {
    const hasActiveSlot = filterProducts(response.products, productFilter).some((product) =>
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

function getRelativeWeekDateValues(dateValue: string, weekOffset: number) {
  const date = createLocalDate(dateValue)
  date.setDate(date.getDate() + weekOffset * 7)

  return getWeekDateValues(formatDateValue(date))
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

function getPreviousMonthDateValues(yearMonth: string) {
  const [year, month] = yearMonth.split('-').map(Number)
  const previousMonthDate = new Date(year, month - 2, 1)
  const previousYearMonth = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`

  return getMonthDateValues(previousYearMonth)
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
  currentKstDate: string,
  currentKstMinute: number,
) {
  const currentTimeBucket = Math.floor(currentKstMinute / 15)

  return JSON.stringify([
    yearMonth,
    body.bookingBusinessId?.trim() ?? '',
    body.bookingUrl?.trim() ?? '',
    body.productId?.trim() ?? '',
    body.productName?.trim() ?? '',
    currentKstDate,
    currentTimeBucket,
  ])
}

function normalizeProductFilter(body: PlaceBookingInsightCalendarRequest): ProductFilter {
  return {
    productId: body.productId?.trim() || undefined,
    productName: body.productName?.trim() || undefined,
  }
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

function calculateRateOrNull(value: number, baseline: number) {
  if (baseline <= 0) {
    return null
  }

  return Math.round((value / baseline) * 100)
}

function roundToOne(value: number) {
  return Math.round(value * 10) / 10
}

function calculateDemandRangeFromBlocks(blocks: PlaceBookingInsightBlock[]) {
  const blocksByDate = new Map<string, PlaceBookingInsightBlock[]>()

  blocks.forEach((block) => {
    blocksByDate.set(block.date, [...(blocksByDate.get(block.date) ?? []), block])
  })

  let expectedDemand = 0

  blocksByDate.forEach((dateBlocks) => {
    const sortedBlocks = [...dateBlocks].sort(
      (left, right) => (parseTimeToMinute(left.time) ?? 0) - (parseTimeToMinute(right.time) ?? 0),
    )
    let cluster: PlaceBookingInsightBlock[] = []

    const flushCluster = () => {
      if (cluster.length === 0) {
        return
      }

      const clusterDemand = cluster.reduce((sum, block) => sum + Math.max(0, block.expectedDemand ?? 0), 0)
      const adjacentSlotCap = Math.max(1, Math.ceil(cluster.length / 2))
      expectedDemand += Math.min(clusterDemand, adjacentSlotCap)
      cluster = []
    }

    sortedBlocks.forEach((block) => {
      const previous = cluster[cluster.length - 1]
      const previousMinute = previous ? parseTimeToMinute(previous.time) : null
      const currentMinute = parseTimeToMinute(block.time)

      if (previousMinute !== null && currentMinute !== null && currentMinute - previousMinute > 60) {
        flushCluster()
      }

      cluster.push(block)
    })

    flushCluster()
  })

  const min = Math.floor(expectedDemand)
  const max = Math.max(min, Math.ceil(expectedDemand))

  return { min, max }
}

function calculateExpectedBookingsForDates(
  dates: string[],
  days: Record<string, PlaceBookingInsightDay>,
  collectedMap: Map<string, CollectedStatus>,
  productFilter: ProductFilter,
  bound: 'min' | 'max',
) {
  return dates.reduce((sum, date) => {
    const day = days[date]

    if (day) {
      const demandRange = calculateDemandRangeFromBlocks(day.aiBlocks)

      return sum + day.bookedCount + demandRange[bound]
    }

    const response = collectedMap.get(date)?.response

    return sum + (response ? createActualBlocks(response, productFilter).length : 0)
  }, 0)
}

function calculateActualBookingsForDates(
  dates: string[],
  collectedMap: Map<string, CollectedStatus>,
  productFilter: ProductFilter,
) {
  return dates.reduce((sum, date) => {
    const response = collectedMap.get(date)?.response

    return sum + (response ? createActualBlocks(response, productFilter).length : 0)
  }, 0)
}

function createWeeklyTrend({
  collectedMap,
  days,
  monthDates,
  productFilter,
}: {
  collectedMap: Map<string, CollectedStatus>
  days: Record<string, PlaceBookingInsightDay>
  monthDates: string[]
  productFilter: ProductFilter
}): PlaceBookingInsightResponse['summary']['weeklyTrend'] {
  const weeks: string[][] = []

  monthDates.forEach((date) => {
    const currentWeek = weeks[weeks.length - 1]
    const weekday = createLocalDate(date).getDay()

    if (!currentWeek || (weekday === 1 && currentWeek.length > 0)) {
      weeks.push([date])
      return
    }

    currentWeek.push(date)
  })

  return weeks.map((weekDates, index) => {
    const actualBookings = calculateActualBookingsForDates(weekDates, collectedMap, productFilter)
    const expectedAdditionalDemand = calculateDemandRangeFromBlocks(
      weekDates.flatMap((date) => days[date]?.aiBlocks ?? []),
    )

    return {
      label: `${index + 1}주차`,
      startDate: weekDates[0],
      endDate: weekDates[weekDates.length - 1],
      actualBookings,
      expectedAdditionalDemandMin: expectedAdditionalDemand.min,
      expectedAdditionalDemandMax: expectedAdditionalDemand.max,
      expectedBookingsMin: actualBookings + expectedAdditionalDemand.min,
      expectedBookingsMax: actualBookings + expectedAdditionalDemand.max,
    }
  })
}

function countRemainingCapacity(products: PlaceBookingProduct[]) {
  return products.reduce(
    (sum, product) =>
      sum +
      product.slots.reduce(
        (slotSum, slot) => slotSum + (slot.status === 'available' ? Math.max(0, slot.remaining) : 0),
        0,
      ),
    0,
  )
}

function getDateDiffDays(from: string, to: string) {
  const fromDate = createLocalDate(from)
  const toDate = createLocalDate(to)

  return Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000)
}

function parseJsonPayload<T>(text: string): T {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const jsonText = fenced?.[1] ?? trimmed
  const start = jsonText.indexOf('{')
  const end = jsonText.lastIndexOf('}')

  if (start < 0 || end < start) {
    throw new Error('Gemini response did not include a JSON object.')
  }

  return JSON.parse(jsonText.slice(start, end + 1)) as T
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Gemini booking insight timed out.'))
    }, timeoutMs)

    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}
