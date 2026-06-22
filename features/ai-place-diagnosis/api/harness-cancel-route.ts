import { NextResponse, type NextRequest } from 'next/server'
import { getAuthUserFromRequest } from '@/features/auth/server/session'
import { cancelAiPlaceHarnessJobs } from '../server/repository'

export const runtime = 'nodejs'

type CancelRequest = {
  jobId?: string
}

export async function POST(request: NextRequest) {
  if (!getAuthUserFromRequest(request)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as CancelRequest
    const cancelledCount = await cancelAiPlaceHarnessJobs({
      jobId: typeof body.jobId === 'string' && body.jobId.trim() ? body.jobId.trim() : undefined,
    })

    return NextResponse.json({
      ok: true,
      cancelledCount,
      message:
        cancelledCount > 0
          ? 'AI 진단 데이터 최신화 작업을 중도취소했습니다.'
          : '취소할 수 있는 진행 중 작업이 없습니다.',
    })
  } catch (error) {
    if (error instanceof Error) {
      console.error('AI place harness cancel error', {
        message: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      {
        message: 'AI 진단 데이터 최신화 취소 중 문제가 발생했습니다.',
        debug:
          error instanceof Error
            ? {
                provider: 'ai-place-harness-cancel',
                message: error.message,
                createdAt: new Date().toISOString(),
              }
            : undefined,
      },
      { status: 500 },
    )
  }
}
