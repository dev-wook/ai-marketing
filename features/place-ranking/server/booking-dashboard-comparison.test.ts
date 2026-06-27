import assert from 'node:assert/strict'
import test from 'node:test'
import { createBookingDashboardComparison } from './booking-dashboard-comparison'

test('booking dashboard comparisons are derived from each place booking signals', () => {
  const result = createBookingDashboardComparison({
    currentSignals: [
      { date: '2026-06-01', time: '10:00' },
      { date: '2026-06-01', time: '10:30' },
      { date: '2026-06-02', time: '14:00' },
    ],
    expectedSignals: [
      { date: '2026-06-02', time: '14:30', amount: 0.6 },
      { date: '2026-06-03', time: '16:00', amount: 0.4 },
    ],
    previousSignals: [
      { date: '2026-05-04', time: '10:00' },
      { date: '2026-05-06', time: '16:00' },
    ],
  })

  assert.deepEqual(result.hourlyDeltas, [
    { hour: '10시', current: 2, expected: 0, previous: 1 },
    { hour: '14시', current: 1, expected: 0.6, previous: 0 },
    { hour: '16시', current: 0, expected: 0.4, previous: 1 },
  ])
  assert.deepEqual(result.weekdayDeltas, [
    { day: '월', current: 2, expected: 0, previous: 1 },
    { day: '화', current: 1, expected: 0.6, previous: 0 },
    { day: '수', current: 0, expected: 0.4, previous: 1 },
  ])
})

test('booking dashboard comparisons omit buckets with no booking signals', () => {
  const result = createBookingDashboardComparison({
    currentSignals: [],
    expectedSignals: [],
    previousSignals: [],
  })

  assert.deepEqual(result.hourlyDeltas, [])
  assert.deepEqual(result.weekdayDeltas, [])
})
