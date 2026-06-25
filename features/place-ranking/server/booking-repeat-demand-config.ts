export type BookingRepeatDemandWeightRange = {
  min: number
  max: number
  weight: number
}

export type BookingRepeatDemandConfig = {
  cycleWeights: BookingRepeatDemandWeightRange[]
  weekdayWeights: Record<number, number>
  timeWeights: BookingRepeatDemandWeightRange[]
  bookingTimingWeights: BookingRepeatDemandWeightRange[]
  recencyWeight: {
    min: number
    max: number
  }
  maxForecastDays: number
  maxAiBlocksPerDay: number
  maxCandidatesPerDateForGemini: number
  maxGeminiAdjustmentRatio: number
  baselineWeight: number
  geminiWeight: number
  minExpectedRepeatDemandToDisplay: number
  minFinalScoreToDisplay: number
  geminiTimeoutMs: number
}

export const bookingRepeatDemandConfig: BookingRepeatDemandConfig = {
  cycleWeights: [
    { min: 20, max: 27, weight: 0.7 },
    { min: 28, max: 29, weight: 0.9 },
    { min: 30, max: 36, weight: 1 },
    { min: 37, max: 42, weight: 0.9 },
    { min: 43, max: 45, weight: 0.75 },
    { min: 46, max: 49, weight: 0.45 },
    { min: 50, max: 56, weight: 0.25 },
  ],
  weekdayWeights: {
    0: 1,
    1: 0.9,
    2: 0.75,
    3: 0.45,
  },
  timeWeights: [
    { min: 0, max: 0, weight: 1 },
    { min: 1, max: 30, weight: 0.95 },
    { min: 31, max: 60, weight: 0.85 },
    { min: 61, max: 120, weight: 0.7 },
    { min: 121, max: 180, weight: 0.4 },
  ],
  bookingTimingWeights: [
    { min: 0, max: 2, weight: 1 },
    { min: 3, max: 5, weight: 0.85 },
    { min: 6, max: 7, weight: 0.65 },
    { min: 8, max: Number.MAX_SAFE_INTEGER, weight: 0.45 },
  ],
  recencyWeight: {
    min: 0.86,
    max: 1,
  },
  maxForecastDays: 28,
  maxAiBlocksPerDay: 4,
  maxCandidatesPerDateForGemini: 10,
  maxGeminiAdjustmentRatio: 1.2,
  baselineWeight: 0.75,
  geminiWeight: 0.25,
  minExpectedRepeatDemandToDisplay: 0.18,
  minFinalScoreToDisplay: 0.18,
  geminiTimeoutMs: 16_000,
}
