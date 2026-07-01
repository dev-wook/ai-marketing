import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAuthUserFromRequest } from '@/features/auth/server/session'
import { refreshAiPlaceBenchmarkProfile } from '../server/benchmark-profile-service'
import {
  completeAiPlaceHarnessRun,
  createAiPlaceHarnessRun,
  listAiPlaceKeywords,
} from '../server/repository'

export const runtime = 'nodejs'
export const maxDuration = 300

type BenchmarkDailyRequestBody = {
  keywordIds?: string[]
}

export async function GET(request: NextRequest) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  return handleBenchmarkDailyRun(request, 'CRON')
}

export async function POST(request: NextRequest) {
  if (!isManualRequestAuthorized(request)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as BenchmarkDailyRequestBody
  const keywordIds = Array.isArray(body.keywordIds)
    ? body.keywordIds.filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))
    : undefined

  return handleBenchmarkDailyRun(request, 'MANUAL', keywordIds)
}

async function handleBenchmarkDailyRun(
  request: NextRequest,
  triggerSource: 'CRON' | 'MANUAL',
  keywordIds?: string[],
) {
  try {
    const activeKeywords = await listAiPlaceKeywords({ activeOnly: true, ids: keywordIds })

    if (keywordIds?.length && activeKeywords.length === 0) {
      return NextResponse.json({ message: '실행할 AI 진단 기준 키워드를 찾지 못했습니다.' }, { status: 404 })
    }

    const runId = await createAiPlaceHarnessRun({
      totalKeywords: activeKeywords.length,
      triggerSource,
    })
    const results = []

    for (const keyword of activeKeywords) {
      try {
        const result = await refreshAiPlaceBenchmarkProfile({
          keyword: keyword.keyword,
          runId,
          triggerSource,
        })

        results.push({
          keyword: keyword.keyword,
          ok: true,
          result,
          skipped: result.status === 'PENDING' || result.status === 'RUNNING' || result.status === 'RETRY_WAIT',
        })
      } catch (error) {
        results.push({
          keyword: keyword.keyword,
          ok: false,
          message: error instanceof Error ? error.message : '벤치마크 프로필 갱신에 실패했습니다.',
        })
      }
    }

    const queuedCount = results.filter((result) => result.ok && !result.skipped).length
    const skippedCount = results.filter((result) => result.skipped).length
    const failureCount = results.filter((result) => !result.ok).length

    await completeAiPlaceHarnessRun({
      failureCount,
      queuedCount,
      runId,
      skippedCount,
    })
    return NextResponse.json({
      runId,
      ranAt: new Date().toISOString(),
      totalKeywords: activeKeywords.length,
      successCount: results.filter((result) => result.ok).length,
      queuedCount,
      skippedCount,
      failureCount,
      workerMode: 'CRON',
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

  return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`)
}

function isManualRequestAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const isSecretAuthorized = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`)

  return Boolean(getAuthUserFromRequest(request)) || isSecretAuthorized
}
