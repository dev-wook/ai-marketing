import type {
  PlaceBookingInsightBlock,
  PlaceBookingProduct,
  PlaceBookingStatusResponse,
} from '../types'
import {
  bookingRepeatDemandConfig,
  type BookingRepeatDemandConfig,
} from './booking-repeat-demand-config'

export type BookingDemandCandidate = {
  slotId: string
  date: string
  time: string
  productName?: string
  remainingCapacity: number
  historicalSignalCount: number
  expectedRepeatDemand: number
  averageCycleDays: number
  cycleScore: number
  weekdayScore: number
  timeScore: number
  bookingTimingScore: number
  baselineScore: number
}

export type BookingDemandPrediction = BookingDemandCandidate & {
  adjustedDemand: number
  geminiScore: number
  confidence: number
  finalScore: number
  reasonCodes: string[]
  predictionMode: 'gemini-adjusted' | 'statistical-fallback'
}

export type GeminiRepeatDemandPrediction = {
  slotId?: unknown
  adjustedDemand?: unknown
  geminiScore?: unknown
  confidence?: unknown
  reasonCodes?: unknown
}

export type GeminiRepeatDemandResponse = {
  predictions?: unknown
  warnings?: unknown
}

type HistoricalBookingSignal = {
  date: string
  time: string
  weekday: number
  minute: number
}

type CandidateAccumulator = BookingDemandCandidate & {
  cycleScoreSum: number
  weekdayScoreSum: number
  timeScoreSum: number
  cycleDaysSum: number
  rawSignalStrengthSum: number
}

export function createRepeatDemandCandidates({
  config = bookingRepeatDemandConfig,
  date,
  historyStatuses,
  products,
  productName,
  today,
}: {
  config?: BookingRepeatDemandConfig
  date: string
  historyStatuses: PlaceBookingStatusResponse[]
  products: PlaceBookingProduct[]
  productName?: string
  today: string
}): BookingDemandCandidate[] {
  const targetDate = createLocalDate(date)
  const targetWeekday = targetDate.getDay()
  const targetSlots = createAvailableTargetSlots({ date, products, productName })

  if (targetSlots.length === 0) {
    return []
  }

  const historySignals = collectHistoricalBookingSignals({
    date,
    historyStatuses,
    productName,
    today,
  })
  const candidates = new Map<string, CandidateAccumulator>()

  historySignals.forEach((signal) => {
    const slotScores = targetSlots
      .map((slot) => {
        const cycleDays = getDateDiffDays(signal.date, date)
        const cycleWeight = getCycleWeight(cycleDays, config)
        const weekdayDiff = calculateCircularWeekdayDiff(signal.weekday, targetWeekday)
        const weekdayWeight = getWeekdayWeight(weekdayDiff, config)
        const timeDiffMinutes = Math.abs(slot.minute - signal.minute)
        const timeWeight = getTimeWeight(timeDiffMinutes, config)

        if (cycleWeight <= 0 || weekdayWeight <= 0 || timeWeight <= 0) {
          return null
        }

        const recencyWeight = getRecencyWeight(cycleDays, config)
        const rawScore = cycleWeight * weekdayWeight * timeWeight * recencyWeight

        return {
          slot,
          cycleDays,
          cycleWeight,
          rawScore,
          timeWeight,
          weekdayWeight,
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item?.rawScore && item.rawScore > 0))
    const rawScoreTotal = slotScores.reduce((sum, item) => sum + item.rawScore, 0)

    if (rawScoreTotal <= 0) {
      return
    }

    slotScores.forEach((item) => {
      const normalizedContribution = item.rawScore / rawScoreTotal
      const existing = candidates.get(item.slot.slotId)
      const next =
        existing ??
        {
          slotId: item.slot.slotId,
          date,
          time: item.slot.time,
          productName: item.slot.productName,
          remainingCapacity: item.slot.remainingCapacity,
          historicalSignalCount: 0,
          expectedRepeatDemand: 0,
          averageCycleDays: 0,
          cycleScore: 0,
          weekdayScore: 0,
          timeScore: 0,
          bookingTimingScore: getBookingTimingWeight(getDateDiffDays(today, date), config),
          baselineScore: 0,
          cycleScoreSum: 0,
          weekdayScoreSum: 0,
          timeScoreSum: 0,
          cycleDaysSum: 0,
          rawSignalStrengthSum: 0,
        }

      next.historicalSignalCount += 1
      next.expectedRepeatDemand += normalizedContribution
      next.cycleScoreSum += item.cycleWeight
      next.weekdayScoreSum += item.weekdayWeight
      next.timeScoreSum += item.timeWeight
      next.cycleDaysSum += item.cycleDays
      next.rawSignalStrengthSum += item.rawScore
      candidates.set(item.slot.slotId, next)
    })
  })

  return Array.from(candidates.values())
    .map(finalizeCandidate)
    .filter((candidate) => candidate.expectedRepeatDemand > 0)
    .sort((left, right) => right.baselineScore - left.baselineScore || left.time.localeCompare(right.time))
}

export function createFallbackRepeatDemandPredictions(
  candidates: BookingDemandCandidate[],
): BookingDemandPrediction[] {
  return candidates.map((candidate) => ({
    ...candidate,
    adjustedDemand: Math.min(candidate.remainingCapacity, candidate.expectedRepeatDemand),
    geminiScore: candidate.baselineScore,
    confidence: calculateFallbackConfidence(candidate),
    finalScore: candidate.baselineScore,
    reasonCodes: createBaselineReasonCodes(candidate),
    predictionMode: 'statistical-fallback',
  }))
}

export function applyGeminiRepeatDemandPredictions({
  candidates,
  config = bookingRepeatDemandConfig,
  payload,
}: {
  candidates: BookingDemandCandidate[]
  config?: BookingRepeatDemandConfig
  payload: GeminiRepeatDemandResponse
}): BookingDemandPrediction[] {
  const fallbackPredictions = createFallbackRepeatDemandPredictions(candidates)
  const fallbackBySlotId = new Map(fallbackPredictions.map((prediction) => [prediction.slotId, prediction]))
  const candidateBySlotId = new Map(candidates.map((candidate) => [candidate.slotId, candidate]))
  const rawPredictions = Array.isArray(payload.predictions) ? payload.predictions : []
  const acceptedBySlotId = new Map<string, BookingDemandPrediction>()

  rawPredictions.forEach((item) => {
    if (!isRecord(item)) {
      return
    }

    const slotId = typeof item.slotId === 'string' ? item.slotId : ''
    const candidate = candidateBySlotId.get(slotId)

    if (!candidate) {
      return
    }

    const fallback = fallbackBySlotId.get(slotId)
    if (!fallback) {
      return
    }

    const adjustedDemand = clampNumber(
      toFiniteNumber(item.adjustedDemand, fallback.adjustedDemand),
      0,
      Math.min(
        candidate.remainingCapacity,
        candidate.expectedRepeatDemand * config.maxGeminiAdjustmentRatio,
      ),
    )
    const geminiScore = clampNumber(toFiniteNumber(item.geminiScore, fallback.geminiScore), 0, 1)
    const confidence = clampNumber(toFiniteNumber(item.confidence, fallback.confidence), 0, 1)
    const reasonCodes = toReasonCodes(item.reasonCodes)
    const finalScore = clampNumber(
      candidate.baselineScore * config.baselineWeight + geminiScore * config.geminiWeight,
      0,
      1,
    )

    acceptedBySlotId.set(slotId, {
      ...candidate,
      adjustedDemand,
      geminiScore,
      confidence,
      finalScore,
      reasonCodes: reasonCodes.length ? reasonCodes : createBaselineReasonCodes(candidate),
      predictionMode: 'gemini-adjusted',
    })
  })

  return fallbackPredictions.map((fallback) => acceptedBySlotId.get(fallback.slotId) ?? fallback)
}

export function createRepeatDemandAiBlocks({
  config = bookingRepeatDemandConfig,
  date,
  predictions,
}: {
  config?: BookingRepeatDemandConfig
  date: string
  predictions: BookingDemandPrediction[]
}): PlaceBookingInsightBlock[] {
  return predictions
    .filter(
      (prediction) =>
        prediction.date === date &&
        prediction.adjustedDemand > 0 &&
        prediction.expectedRepeatDemand >= config.minExpectedRepeatDemandToDisplay &&
        prediction.finalScore >= config.minFinalScoreToDisplay,
    )
    .sort((left, right) => right.finalScore - left.finalScore || right.adjustedDemand - left.adjustedDemand || left.time.localeCompare(right.time))
    .slice(0, config.maxAiBlocksPerDay)
    .sort((left, right) => left.time.localeCompare(right.time))
    .map((prediction, index) => ({
      id: `ai:${prediction.slotId}:${index}`,
      type: 'ai',
      date: prediction.date,
      time: prediction.time,
      label: prediction.time,
      productName: prediction.productName,
      expectedDemand: roundToTwo(prediction.adjustedDemand),
      confidence: Math.min(95, Math.max(1, Math.round(prediction.confidence * 100))),
      reason: createPredictionReason(prediction),
      basis: createPredictionBasis(prediction),
    }))
}

export function calculateCircularWeekdayDiff(leftWeekday: number, rightWeekday: number) {
  const rawDiff = Math.abs(leftWeekday - rightWeekday)

  return Math.min(rawDiff, 7 - rawDiff)
}

export function getCycleWeight(days: number, config: BookingRepeatDemandConfig = bookingRepeatDemandConfig) {
  return getRangeWeight(days, config.cycleWeights)
}

export function getWeekdayWeight(diff: number, config: BookingRepeatDemandConfig = bookingRepeatDemandConfig) {
  return config.weekdayWeights[diff] ?? 0
}

export function getTimeWeight(minutes: number, config: BookingRepeatDemandConfig = bookingRepeatDemandConfig) {
  return getRangeWeight(minutes, config.timeWeights)
}

export function getBookingTimingWeight(daysUntilUse: number, config: BookingRepeatDemandConfig = bookingRepeatDemandConfig) {
  return getRangeWeight(Math.max(0, daysUntilUse), config.bookingTimingWeights)
}

function collectHistoricalBookingSignals({
  date,
  historyStatuses,
  productName,
  today,
}: {
  date: string
  historyStatuses: PlaceBookingStatusResponse[]
  productName?: string
  today: string
}): HistoricalBookingSignal[] {
  return historyStatuses.flatMap((status) => {
    const cycleDays = getDateDiffDays(status.date, date)

    if (status.date >= today || cycleDays < 20 || cycleDays > 56) {
      return []
    }

    return filterProductsByName(status.products, productName).flatMap((product) =>
      product.slots
        .filter((slot) => slot.status === 'booked')
        .map((slot) => {
          const minute = parseTimeToMinute(slot.time)

          if (minute === null) {
            return null
          }

          return {
            date: status.date,
            time: slot.time,
            weekday: createLocalDate(status.date).getDay(),
            minute,
          }
        })
        .filter((signal): signal is HistoricalBookingSignal => Boolean(signal)),
    )
  })
}

function createAvailableTargetSlots({
  date,
  products,
  productName,
}: {
  date: string
  products: PlaceBookingProduct[]
  productName?: string
}) {
  return filterProductsByName(products, productName).flatMap((product) =>
    product.slots
      .filter((slot) => slot.status === 'available' && slot.remaining > 0)
      .map((slot) => {
        const minute = parseTimeToMinute(slot.time)

        if (minute === null) {
          return null
        }

        return {
          slotId: `${date}T${slot.time}:00+09:00`,
          time: slot.time,
          minute,
          productName: product.name,
          remainingCapacity: slot.remaining,
        }
      })
      .filter((slot): slot is NonNullable<typeof slot> => Boolean(slot)),
  )
}

function filterProductsByName(products: PlaceBookingProduct[], productName?: string) {
  if (!productName) {
    return products
  }

  return products.filter((product) => product.name === productName)
}

function finalizeCandidate(candidate: CandidateAccumulator): BookingDemandCandidate {
  const signalCount = Math.max(candidate.historicalSignalCount, 1)
  const cycleScore = candidate.cycleScoreSum / signalCount
  const weekdayScore = candidate.weekdayScoreSum / signalCount
  const timeScore = candidate.timeScoreSum / signalCount
  const averageCycleDays = candidate.cycleDaysSum / signalCount
  const rawSignalStrength = candidate.rawSignalStrengthSum / signalCount
  const capacityLimitedDemand = Math.min(candidate.remainingCapacity, candidate.expectedRepeatDemand)
  const demandScore = Math.min(1, capacityLimitedDemand / Math.max(1, candidate.remainingCapacity))
  const supportScore = Math.min(1, signalCount / 4)
  const baselineScore = clampNumber(
    demandScore * 0.36 +
      rawSignalStrength * 0.28 +
      supportScore * 0.18 +
      candidate.bookingTimingScore * 0.12 +
      ((cycleScore + weekdayScore + timeScore) / 3) * 0.06,
    0,
    1,
  )

  return {
    slotId: candidate.slotId,
    date: candidate.date,
    time: candidate.time,
    productName: candidate.productName,
    remainingCapacity: candidate.remainingCapacity,
    historicalSignalCount: candidate.historicalSignalCount,
    expectedRepeatDemand: roundToTwo(candidate.expectedRepeatDemand),
    averageCycleDays: roundToOne(averageCycleDays),
    cycleScore: roundToTwo(cycleScore),
    weekdayScore: roundToTwo(weekdayScore),
    timeScore: roundToTwo(timeScore),
    bookingTimingScore: roundToTwo(candidate.bookingTimingScore),
    baselineScore: roundToTwo(baselineScore),
  }
}

function getRecencyWeight(cycleDays: number, config: BookingRepeatDemandConfig) {
  const normalized = clampNumber((56 - cycleDays) / (56 - 20), 0, 1)

  return config.recencyWeight.min + (config.recencyWeight.max - config.recencyWeight.min) * normalized
}

function getRangeWeight(value: number, ranges: Array<{ min: number; max: number; weight: number }>) {
  return ranges.find((range) => value >= range.min && value <= range.max)?.weight ?? 0
}

function calculateFallbackConfidence(candidate: BookingDemandCandidate) {
  return clampNumber(
    candidate.baselineScore * 0.58 +
      Math.min(1, candidate.historicalSignalCount / 5) * 0.2 +
      candidate.bookingTimingScore * 0.12 +
      Math.min(1, candidate.expectedRepeatDemand) * 0.1,
    0,
    0.92,
  )
}

function createBaselineReasonCodes(candidate: BookingDemandCandidate) {
  const reasonCodes: string[] = []

  if (candidate.averageCycleDays >= 30 && candidate.averageCycleDays <= 36) {
    reasonCodes.push('PEAK_REPEAT_CYCLE')
  } else if (candidate.averageCycleDays >= 20 && candidate.averageCycleDays <= 45) {
    reasonCodes.push('CORE_REPEAT_CYCLE')
  } else {
    reasonCodes.push('EXTENDED_REPEAT_CYCLE')
  }

  reasonCodes.push(candidate.weekdayScore >= 1 ? 'SAME_WEEKDAY_MATCH' : candidate.weekdayScore >= 0.75 ? 'WEEKDAY_RANGE_MATCH' : 'WEEKDAY_RANGE_WEAK')
  reasonCodes.push(candidate.timeScore >= 1 ? 'SAME_TIME_MATCH' : candidate.timeScore >= 0.7 ? 'TIME_RANGE_MATCH' : 'TIME_RANGE_WEAK')

  if (candidate.historicalSignalCount >= 2) {
    reasonCodes.push('MULTIPLE_HISTORY_SIGNALS')
  } else {
    reasonCodes.push('LOW_HISTORY_SIGNAL')
  }

  reasonCodes.push(
    candidate.bookingTimingScore >= 1
      ? 'BOOKING_WINDOW_ACTIVE'
      : candidate.bookingTimingScore >= 0.65
        ? 'BOOKING_WINDOW_APPROACHING'
        : 'BOOKING_WINDOW_NOT_REACHED',
  )

  if (candidate.remainingCapacity <= 1) {
    reasonCodes.push('CAPACITY_LIMITED')
  }

  return reasonCodes
}

function createPredictionReason(prediction: BookingDemandPrediction) {
  if (prediction.reasonCodes.includes('PEAK_REPEAT_CYCLE')) {
    return '최근 예약 신호가 30~36일 재방문 중심 주기에 가까운 시간대입니다.'
  }

  if (prediction.reasonCodes.includes('CORE_REPEAT_CYCLE')) {
    return '최근 예약 신호가 20~45일 재방문 주요 주기 안에서 반복된 시간대입니다.'
  }

  return '최근 예약 신호가 보조 재방문 주기와 요일·시간 범위 안에서 확인된 시간대입니다.'
}

function createPredictionBasis(prediction: BookingDemandPrediction) {
  const basis = [
    `과거 예약 ${prediction.historicalSignalCount}건이 이 시간대 주변 수요를 지지합니다.`,
    `평균 재방문 후보 주기는 ${prediction.averageCycleDays}일이고 예상 추가 수요는 ${roundToTwo(prediction.adjustedDemand)}건입니다.`,
    `요일 유사도 ${Math.round(prediction.weekdayScore * 100)}%, 시간대 유사도 ${Math.round(prediction.timeScore * 100)}%를 반영했습니다.`,
  ]

  if (prediction.reasonCodes.includes('BOOKING_WINDOW_NOT_REACHED')) {
    basis.push('이용일까지 8일 이상 남아 아직 실제 예약 신청이 본격화되기 전일 수 있습니다.')
  } else if (prediction.reasonCodes.includes('BOOKING_WINDOW_ACTIVE')) {
    basis.push('이용일이 가까워 실제 예약 신청 가능성이 높은 시점입니다.')
  }

  if (prediction.predictionMode === 'statistical-fallback') {
    basis.push('Gemini 보정은 사용할 수 없어 통계 기반 재방문 수요 예측을 표시합니다.')
  } else {
    basis.push('Gemini는 서버가 생성한 예약 가능 후보 안에서만 점수를 보정했습니다.')
  }

  return basis
}

function toReasonCodes(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string').slice(0, 8)
}

function toFiniteNumber(value: unknown, fallback: number) {
  const numberValue = Number(value)

  return Number.isFinite(numberValue) ? numberValue : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getDateDiffDays(from: string, to: string) {
  const fromDate = createLocalDate(from)
  const toDate = createLocalDate(to)

  return Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000)
}

function createLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)

  return new Date(year, month - 1, day)
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

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100
}
