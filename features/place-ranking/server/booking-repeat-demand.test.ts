import assert from 'node:assert/strict'
import test from 'node:test'
import type { PlaceBookingProduct, PlaceBookingStatusResponse } from '../types'
import {
  applyGeminiRepeatDemandPredictions,
  calculateCircularWeekdayDiff,
  createFallbackRepeatDemandPredictions,
  createRepeatDemandCandidates,
  getCycleWeight,
  getTimeWeight,
} from './booking-repeat-demand'

test('repeat cycle weights follow the revisit demand policy', () => {
  assert.equal(getCycleWeight(30), 1)
  assert.equal(getCycleWeight(36), 1)
  assert.equal(getCycleWeight(42), 0.9)
  assert.equal(getCycleWeight(45), 0.75)
  assert.equal(getCycleWeight(50), 0.25)
  assert.equal(getCycleWeight(57), 0)
  assert.equal(getCycleWeight(19), 0)
})

test('weekday difference uses circular week distance', () => {
  assert.equal(calculateCircularWeekdayDiff(3, 5), 2)
  assert.equal(calculateCircularWeekdayDiff(5, 3), 2)
  assert.equal(calculateCircularWeekdayDiff(1, 0), 1)
  assert.equal(calculateCircularWeekdayDiff(0, 1), 1)
  assert.equal(calculateCircularWeekdayDiff(2, 2), 0)
})

test('time weights keep two hours as primary range and three hours as extended range', () => {
  assert.equal(getTimeWeight(0), 1)
  assert.equal(getTimeWeight(60), 0.85)
  assert.equal(getTimeWeight(120), 0.7)
  assert.equal(getTimeWeight(180), 0.4)
  assert.equal(getTimeWeight(210), 0)
})

test('historical booking contribution is distributed without over-counting', () => {
  const candidates = createRepeatDemandCandidates({
    date: '2026-07-01',
    historyStatuses: [
      createHistoryStatus('2026-06-01', ['14:00']),
      createHistoryStatus('2026-06-02', ['14:00']),
      createHistoryStatus('2026-06-03', ['14:00']),
      createHistoryStatus('2026-06-04', ['14:00']),
      createHistoryStatus('2026-06-05', ['14:00']),
    ],
    products: [
      createProduct('target', [
        ['13:00', 'available', 1],
        ['14:00', 'available', 1],
        ['15:00', 'available', 1],
        ['17:30', 'available', 1],
        ['18:00', 'booked', 0],
        ['19:00', 'closed', 0],
      ]),
    ],
    today: '2026-06-26',
  })
  const totalDemand = candidates.reduce((sum, candidate) => sum + candidate.expectedRepeatDemand, 0)

  assert.ok(totalDemand <= 5)
  assert.ok(candidates.some((candidate) => candidate.time === '14:00'))
  assert.equal(candidates.some((candidate) => candidate.time === '17:30'), false)
  assert.equal(candidates.some((candidate) => candidate.time === '18:00'), false)
  assert.equal(candidates.some((candidate) => candidate.time === '19:00'), false)
})

test('zero-capacity and booked slots do not receive repeat demand', () => {
  const candidates = createRepeatDemandCandidates({
    date: '2026-07-01',
    historyStatuses: [createHistoryStatus('2026-06-01', ['14:00'])],
    products: [
      createProduct('target', [
        ['14:00', 'available', 0],
        ['15:00', 'booked', 0],
        ['16:00', 'closed', 0],
      ]),
    ],
    today: '2026-06-26',
  })

  assert.deepEqual(candidates, [])
})

test('Gemini predictions are validated, capped, and unknown slot ids are ignored', () => {
  const candidates = createRepeatDemandCandidates({
    date: '2026-07-01',
    historyStatuses: [createHistoryStatus('2026-06-01', ['14:00'])],
    products: [createProduct('target', [['14:00', 'available', 1]])],
    today: '2026-06-26',
  })
  const fallback = createFallbackRepeatDemandPredictions(candidates)
  const predictions = applyGeminiRepeatDemandPredictions({
    candidates,
    payload: {
      predictions: [
        {
          slotId: candidates[0].slotId,
          adjustedDemand: candidates[0].expectedRepeatDemand * 10,
          geminiScore: 3,
          confidence: 2,
          reasonCodes: ['PEAK_REPEAT_CYCLE'],
        },
        {
          slotId: '2026-07-01T99:99:00+09:00',
          adjustedDemand: 1,
          geminiScore: 1,
          confidence: 1,
          reasonCodes: ['PEAK_REPEAT_CYCLE'],
        },
      ],
    },
  })

  assert.equal(predictions.length, 1)
  assert.equal(predictions[0].predictionMode, 'gemini-adjusted')
  assert.ok(predictions[0].adjustedDemand <= candidates[0].expectedRepeatDemand * 1.2)
  assert.ok(predictions[0].geminiScore <= 1)
  assert.ok(predictions[0].confidence <= 1)
  assert.equal(fallback.length, 1)
})

test('invalid Gemini payload falls back to statistical predictions', () => {
  const candidates = createRepeatDemandCandidates({
    date: '2026-07-01',
    historyStatuses: [createHistoryStatus('2026-06-01', ['14:00'])],
    products: [createProduct('target', [['14:00', 'available', 1]])],
    today: '2026-06-26',
  })
  const predictions = applyGeminiRepeatDemandPredictions({
    candidates,
    payload: {
      predictions: 'not-json-array',
    },
  })

  assert.equal(predictions[0].predictionMode, 'statistical-fallback')
})

function createHistoryStatus(date: string, bookedTimes: string[]): PlaceBookingStatusResponse {
  return {
    businessId: 'biz',
    businessTypeId: 13,
    date,
    products: [createProduct('target', bookedTimes.map((time) => [time, 'booked', 0]))],
  }
}

function createProduct(
  name: string,
  slots: Array<[string, 'available' | 'booked' | 'closed', number]>,
): PlaceBookingProduct {
  return {
    id: name,
    name,
    description: '',
    isClosed: false,
    minBookingCount: 1,
    maxBookingCount: 1,
    summary: {
      totalSlots: slots.length,
      availableSlots: slots.filter((slot) => slot[1] === 'available').length,
      bookedSlots: slots.filter((slot) => slot[1] === 'booked').length,
      closedSlots: slots.filter((slot) => slot[1] === 'closed').length,
      firstAvailableTime: slots.find((slot) => slot[1] === 'available')?.[0] ?? null,
    },
    slots: slots.map(([time, status, remaining]) => ({
      time,
      startDateTime: `2026-07-01T${time}:00`,
      duration: 60,
      remaining,
      bookingCount: status === 'booked' ? 1 : 0,
      unitBookingCount: status === 'booked' ? 1 : 0,
      status,
      statusReason:
        status === 'booked'
          ? 'actual_booking'
          : status === 'available'
            ? 'available'
            : 'manual_block_or_full',
    })),
  }
}
