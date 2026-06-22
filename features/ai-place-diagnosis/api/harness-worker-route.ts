import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAuthUserFromRequest } from '@/features/auth/server/session'
import { runNextAiPlaceHarnessWorkerBatch } from '../server/benchmark-profile-service'
import { scheduleAiPlaceHarnessWorkerRun } from '../server/harness-worker-scheduler'

export const runtime = 'nodejs'
export const maxDuration = 300

const stableGeminiBatchDelayMs = 75_000

export async function GET(request: NextRequest) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  return handleHarnessWorkerRun(request)
}

export async function POST(request: NextRequest) {
  if (!isManualRequestAuthorized(request)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  return handleHarnessWorkerRun(request)
}

async function handleHarnessWorkerRun(request: NextRequest) {
  try {
    const result = await runNextAiPlaceHarnessWorkerBatch()
    const nextDelayMs = getNextWorkerDelayMs(result)
    const backgroundWorkerScheduled =
      typeof nextDelayMs === 'number'
        ? scheduleAiPlaceHarnessWorkerRun({
            delayMs: nextDelayMs,
            origin: request.nextUrl.origin,
          })
        : false

    return NextResponse.json({
      ...result,
      backgroundWorkerScheduled,
      nextWorkerDelayMs: nextDelayMs,
    })
  } catch (error) {
    if (error instanceof Error) {
      console.error('AI place harness worker error', {
        message: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      {
        message: 'AI 진단 데이터 분석 실행 중 문제가 발생했습니다.',
        debug:
          error instanceof Error
            ? {
                provider: 'ai-place-harness-worker',
                message: error.message,
                createdAt: new Date().toISOString(),
              }
            : undefined,
      },
      { status: 500 },
    )
  }
}

function getNextWorkerDelayMs(result: Awaited<ReturnType<typeof runNextAiPlaceHarnessWorkerBatch>>) {
  if (!('jobId' in result) || !result.jobId) {
    return null
  }

  if ('retryWait' in result && result.retryWait) {
    return Math.max(stableGeminiBatchDelayMs, result.retryAfterMs ?? stableGeminiBatchDelayMs)
  }

  if ('fatalQuota' in result && result.fatalQuota) {
    return null
  }

  if ('completed' in result && result.completed) {
    return stableGeminiBatchDelayMs
  }

  return stableGeminiBatchDelayMs
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
