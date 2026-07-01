import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAuthUserFromRequest } from '@/features/auth/server/session'
import { runNextAiPlaceHarnessWorkerBatch } from '../server/benchmark-profile-service'

export const runtime = 'nodejs'
export const maxDuration = 300

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

    return NextResponse.json({
      ...result,
      workerMode: 'CRON',
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
