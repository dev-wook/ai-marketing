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

      return {
        keyword: row.keyword,
        normalizedKeyword: row.normalized_keyword,
        status,
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
