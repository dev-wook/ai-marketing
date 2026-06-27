const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토']

export type BookingDashboardSignal = {
  amount?: number
  date: string
  time: string
}

export type BookingDashboardComparison = {
  hourlyDeltas: Array<{
    current: number
    expected: number
    hour: string
    previous: number
  }>
  weekdayDeltas: Array<{
    current: number
    day: string
    expected: number
    previous: number
  }>
}

export function createBookingDashboardComparison({
  currentSignals,
  expectedSignals,
  previousSignals,
}: {
  currentSignals: BookingDashboardSignal[]
  expectedSignals: BookingDashboardSignal[]
  previousSignals: BookingDashboardSignal[]
}): BookingDashboardComparison {
  const currentHours = countSignals(currentSignals, getHour)
  const expectedHours = countSignals(expectedSignals, getHour)
  const previousHours = countSignals(previousSignals, getHour)
  const currentWeekdays = countSignals(currentSignals, getWeekday)
  const expectedWeekdays = countSignals(expectedSignals, getWeekday)
  const previousWeekdays = countSignals(previousSignals, getWeekday)
  const hours = Array.from(
    new Set([...currentHours.keys(), ...expectedHours.keys(), ...previousHours.keys()]),
  ).sort((left, right) => left - right)

  return {
    hourlyDeltas: hours.map((hour) => ({
      hour: `${hour}시`,
      current: currentHours.get(hour) ?? 0,
      expected: roundToTwo(expectedHours.get(hour) ?? 0),
      previous: previousHours.get(hour) ?? 0,
    })),
    weekdayDeltas: weekdayLabels
      .map((day, weekday) => ({
        day,
        current: currentWeekdays.get(weekday) ?? 0,
        expected: roundToTwo(expectedWeekdays.get(weekday) ?? 0),
        previous: previousWeekdays.get(weekday) ?? 0,
      }))
      .filter((item) => item.current > 0 || item.expected > 0 || item.previous > 0),
  }
}

function countSignals(
  signals: BookingDashboardSignal[],
  getKey: (signal: BookingDashboardSignal) => number | null,
) {
  const counts = new Map<number, number>()

  signals.forEach((signal) => {
    const key = getKey(signal)

    if (key === null) {
      return
    }

    counts.set(key, (counts.get(key) ?? 0) + Math.max(0, signal.amount ?? 1))
  })

  return counts
}

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100
}

function getHour(signal: BookingDashboardSignal) {
  const match = signal.time.match(/^(\d{1,2}):/)
  const hour = match ? Number(match[1]) : Number.NaN

  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null
}

function getWeekday(signal: BookingDashboardSignal) {
  const [year, month, day] = signal.date.split('-').map(Number)

  if (!year || !month || !day) {
    return null
  }

  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}
