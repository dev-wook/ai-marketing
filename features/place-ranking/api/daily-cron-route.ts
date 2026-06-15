import { NextResponse } from 'next/server'
import { runPlaceRankingDailyBatch } from '../server/batch-keyword-service'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const cronSchedule = request.headers.get('x-vercel-cron-schedule')

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !cronSchedule) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runPlaceRankingDailyBatch()

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
