import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAuthUserFromRequest } from '@/features/auth/server/session'
import { readPlaceRankingBatchKeywords } from '@/features/place-ranking/server/batch-keyword-service'
import { refreshAiPlaceBenchmarkProfile } from '../server/benchmark-profile-service'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  return handleBenchmarkDailyRun()
}

export async function POST(request: NextRequest) {
  if (!isManualRequestAuthorized(request)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  return handleBenchmarkDailyRun()
}

async function handleBenchmarkDailyRun() {
  try {
    const keywords = await readPlaceRankingBatchKeywords()
    const activeKeywords = keywords.filter((keyword) => keyword.isActive)
    const results = []

    for (const keyword of activeKeywords) {
      try {
        results.push({
          keyword: keyword.keyword,
          ok: true,
          result: await refreshAiPlaceBenchmarkProfile({
            keyword: keyword.keyword,
          }),
        })
      } catch (error) {
        results.push({
          keyword: keyword.keyword,
          ok: false,
          message: error instanceof Error ? error.message : '벤치마크 프로필 갱신에 실패했습니다.',
        })
      }
    }

    return NextResponse.json({
      ranAt: new Date().toISOString(),
      totalKeywords: activeKeywords.length,
      successCount: results.filter((result) => result.ok).length,
      failureCount: results.filter((result) => !result.ok).length,
      results,
    })
  } catch (error) {
    if (error instanceof Error) {
      console.error('AI place benchmark daily cron error', {
        message: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      {
        message: 'AI 플레이스 벤치마크 갱신 중 문제가 발생했습니다.',
        debug:
          error instanceof Error
            ? {
                provider: 'ai-place-benchmark-cron',
                message: error.message,
                createdAt: new Date().toISOString(),
              }
            : undefined,
      },
      { status: 500 },
    )
  }
}

function isCronRequestAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const cronSchedule = request.headers.get('x-vercel-cron-schedule')
  const isVercelCronRequest = Boolean(cronSchedule)
  const isSecretAuthorized = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`)

  return isVercelCronRequest || isSecretAuthorized
}

function isManualRequestAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const isSecretAuthorized = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`)

  return Boolean(getAuthUserFromRequest(request)) || isSecretAuthorized
}
