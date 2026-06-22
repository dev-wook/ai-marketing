import { NextResponse, type NextRequest } from 'next/server'
import { getAuthUserFromRequest } from '@/features/auth/server/session'
import { listAiPlaceBenchmarkRefreshStatuses } from '../server/repository'

export const runtime = 'nodejs'

const staleAfterMs = 24 * 60 * 60 * 1000

export async function GET(request: NextRequest) {
  if (!getAuthUserFromRequest(request)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rows = await listAiPlaceBenchmarkRefreshStatuses()
    const now = Date.now()
    const keywords = rows.map((row) => {
      const isQueued = row.job_status === 'PENDING' || row.job_status === 'RETRY_WAIT'
      const isRunning = row.job_status === 'RUNNING'
      const profileCreatedAt = row.profile_created_at
      const profileAgeMs = profileCreatedAt ? now - new Date(profileCreatedAt).getTime() : null
      const isStale = profileAgeMs === null || profileAgeMs > staleAfterMs
      const status = isQueued
        ? 'QUEUED'
        : isRunning
        ? 'UPDATING'
        : row.job_status === 'FAILED'
          ? 'FAILED'
          : row.job_status === 'PARTIAL'
            ? 'PARTIAL'
            : isStale
              ? 'NEEDS_REFRESH'
              : 'FRESH'
      const statusReason = createStatusReason({
        jobErrorMessage: row.job_error_message,
        jobNextAttemptAt: row.job_next_attempt_at,
        jobStatus: row.job_status,
        now,
        status,
      })

      return {
        keyword: row.keyword,
        normalizedKeyword: row.normalized_keyword,
        status,
        statusReason,
        latestProfile: row.profile_created_at
          ? {
              status: row.profile_status,
              createdAt: row.profile_created_at,
              sampleCount: row.profile_sample_count ?? 0,
              dataConfidence: Number(row.profile_data_confidence) || 0,
            }
          : null,
        latestRun: row.job_id
          ? {
              id: row.job_id,
              status: row.job_status,
              createdAt: row.job_created_at,
              completedAt: row.job_completed_at,
              evaluatedCount: row.job_evaluated_count ?? 0,
              totalCount: row.job_total_count ?? 0,
              nextRankStart: row.job_next_rank_start ?? 0,
              errorMessage: row.job_error_message,
              retryCount: row.job_retry_count ?? 0,
              nextAttemptAt: row.job_next_attempt_at,
            }
          : null,
      }
    })

    return NextResponse.json({
      checkedAt: new Date(now).toISOString(),
      hasUpdatingKeyword: keywords.some(
        (keyword) => keyword.status === 'QUEUED' || keyword.status === 'UPDATING',
      ),
      keywords,
    })
  } catch (error) {
    if (error instanceof Error) {
      console.error('AI place benchmark status error', {
        message: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      {
        message: 'AI 진단 기준 데이터 상태 조회 중 문제가 발생했습니다.',
        debug:
          error instanceof Error
            ? {
                provider: 'ai-place-benchmark-status',
                message: error.message,
                createdAt: new Date().toISOString(),
              }
            : undefined,
      },
      { status: 500 },
    )
  }
}

function createStatusReason({
  jobErrorMessage,
  jobNextAttemptAt,
  jobStatus,
  now,
  status,
}: {
  status: string
  jobStatus: string | null
  jobErrorMessage: string | null
  jobNextAttemptAt: string | null
  now: number
}) {
  if (jobErrorMessage) {
    return jobErrorMessage
  }

  if (jobStatus === 'RETRY_WAIT' && jobNextAttemptAt) {
    const waitMs = new Date(jobNextAttemptAt).getTime() - now
    const waitSeconds = Math.max(0, Math.ceil(waitMs / 1000))

    return waitSeconds > 0
      ? `Gemini 사용량 제한 또는 일시 오류로 ${waitSeconds}초 후 재시도합니다.`
      : 'Gemini 재시도 대기 시간이 지나 다음 워커 실행을 기다리고 있습니다.'
  }

  if (status === 'QUEUED') {
    return '플레이스 수집은 완료됐고 서버 백그라운드 워커 실행을 기다리고 있습니다.'
  }

  if (status === 'UPDATING') {
    return '6개 단위로 AI 평가를 진행하고 있습니다. 다음 배치는 약 75초 간격으로 실행됩니다.'
  }

  if (status === 'FAILED') {
    return '작업이 실패했습니다. 상세 원인이 저장되지 않은 경우 서버 로그 확인이 필요합니다.'
  }

  return null
}
