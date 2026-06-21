import { NextResponse } from 'next/server'
import { runPlaceRankingDailyBatch } from '../server/batch-keyword-service'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const cronSchedule = request.headers.get('x-vercel-cron-schedule')
  const isVercelCronRequest = Boolean(cronSchedule)
  const isSecretAuthorized = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`)

  if (!isVercelCronRequest && !isSecretAuthorized) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const snapshotDate = createDailyCronSnapshotDate()
    const result = await runPlaceRankingDailyBatch({ snapshotDate })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error) {
      console.error('Place ranking daily cron error', {
        message: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      {
        message: '플레이스 순위 자동 기록 중 문제가 발생했습니다.',
        debug:
          error instanceof Error
            ? {
                provider: 'place-ranking-cron',
                message: error.message,
                createdAt: new Date().toISOString(),
              }
            : undefined,
      },
      { status: 500 },
    )
  }
}

function createDailyCronSnapshotDate(now = new Date()) {
  const koreaNow = getKoreaDateParts(now)

  if (koreaNow.hour < 3) {
    return toKoreaDateString(addDays(now, -1))
  }

  return toKoreaDateString(now)
}

function toKoreaDateString(date: Date) {
  return date.toLocaleDateString('sv-SE', {
    timeZone: 'Asia/Seoul',
  })
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date)

  nextDate.setUTCDate(nextDate.getUTCDate() + days)

  return nextDate
}

function getKoreaDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    hour: 'numeric',
    hourCycle: 'h23',
    hour12: false,
  }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0) % 24

  return { hour }
}
