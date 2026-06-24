'use client'

import { FormEvent, useEffect, useState } from 'react'
import type {
  PlaceRankingBatchKeyword,
  PlaceRankingBatchKeywordResponse,
} from '@/features/place-ranking/types'

type DiagnosisErrorBody = {
  message?: string
  debug?: unknown
}

type AiDiagnosisBenchmarkKeyword = {
  id: string
  keyword: string
  normalized_keyword: string
  active_profile_id: string | null
  region_term: string | null
  service_term: string | null
  need_term: string | null
  intent_cluster_key: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type AiDiagnosisDataRefreshStatus = {
  checkedAt: string
  hasUpdatingKeyword: boolean
  keywords: Array<{
    keyword: string
    normalizedKeyword: string
    status: 'FRESH' | 'NEEDS_REFRESH' | 'QUEUED' | 'UPDATING' | 'PARTIAL' | 'FAILED'
    latestProfile: {
      status: string | null
      createdAt: string
      sampleCount: number
      dataConfidence: number
    } | null
    latestRun: {
      id: string
      status: string | null
      createdAt: string | null
      completedAt: string | null
      evaluatedCount: number
      totalCount: number
      nextRankStart: number
      errorMessage: string | null
      retryCount?: number
      nextAttemptAt?: string | null
    } | null
    statusReason?: string | null
  }>
}

type AiDiagnosisDataMessage = {
  type: 'success' | 'warning' | 'error' | 'info'
  message: string
}

type SchedulingTab = 'ranking' | 'diagnosis'

type RefreshTarget =
  | {
      type: 'all'
      label: string
      keywordIds?: undefined
    }
  | {
      type: 'keyword'
      label: string
      keywordIds: string[]
    }

export function AiDiagnosisDataManager({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const [keywords, setKeywords] = useState<AiDiagnosisBenchmarkKeyword[]>([])
  const [keywordInput, setKeywordInput] = useState('')
  const [message, setMessage] = useState<AiDiagnosisDataMessage | null>(null)
  const [status, setStatus] = useState<AiDiagnosisDataRefreshStatus | null>(null)
  const [isKeywordLoading, setIsKeywordLoading] = useState(false)
  const [isStatusLoading, setIsStatusLoading] = useState(false)
  const [isRefreshLoading, setIsRefreshLoading] = useState(false)
  const [refreshTarget, setRefreshTarget] = useState<RefreshTarget | null>(null)
  const [rankingKeywords, setRankingKeywords] = useState<PlaceRankingBatchKeyword[]>([])
  const [rankingKeywordInput, setRankingKeywordInput] = useState('')
  const [isRankingKeywordLoading, setIsRankingKeywordLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<SchedulingTab>('ranking')

  useEffect(() => {
    if (!isOpen) {
      return
    }

    loadKeywords()
    loadRankingKeywords()
    loadStatus({ silent: true })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const intervalId = window.setInterval(() => {
      loadStatus({ silent: true })
    }, 3000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isOpen])

  useEffect(() => {
    if (!message) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setMessage(null)
    }, 3200)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [message])

  const loadKeywords = async () => {
    setIsKeywordLoading(true)

    try {
      setKeywords(await requestAiDiagnosisBenchmarkKeywords())
    } catch (error) {
      setMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'AI 진단 기준 키워드 조회에 실패했습니다.',
      })
    } finally {
      setIsKeywordLoading(false)
    }
  }

  const loadRankingKeywords = async () => {
    setIsRankingKeywordLoading(true)

    try {
      setRankingKeywords(await requestPlaceRankingBatchKeywords())
    } catch (error) {
      setMessage({
        type: 'error',
        message:
          error instanceof Error ? error.message : '플레이스 순위 자동 기록 키워드 조회에 실패했습니다.',
      })
    } finally {
      setIsRankingKeywordLoading(false)
    }
  }

  const loadStatus = async ({ silent = false }: { silent?: boolean } = {}) => {
    setIsStatusLoading(true)

    try {
      setStatus(await requestAiDiagnosisDataRefreshStatus())
    } catch (error) {
      if (!silent) {
        setMessage({
          type: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'AI 진단 데이터 상태를 확인하지 못했습니다.',
        })
      }
    } finally {
      setIsStatusLoading(false)
    }
  }

  const submitKeyword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextKeyword = keywordInput.trim()

    if (!nextKeyword || isKeywordLoading) {
      return
    }

    setIsKeywordLoading(true)

    try {
      const created = await requestAddAiDiagnosisBenchmarkKeyword(nextKeyword)

      setKeywords((current) => [
        created,
        ...current.filter(
          (item) => item.id !== created.id && item.normalized_keyword !== created.normalized_keyword,
        ),
      ])
      setKeywordInput('')
      setMessage({
        type: 'success',
        message: 'AI 진단 기준 키워드를 추가했습니다.',
      })
      await loadStatus({ silent: true })
    } catch (error) {
      setMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'AI 진단 기준 키워드 추가에 실패했습니다.',
      })
    } finally {
      setIsKeywordLoading(false)
    }
  }

  const submitRankingKeyword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextKeyword = rankingKeywordInput.trim()

    if (!nextKeyword || isRankingKeywordLoading) {
      return
    }

    setIsRankingKeywordLoading(true)

    try {
      const created = await requestAddPlaceRankingBatchKeyword(nextKeyword)

      setRankingKeywords((current) => [
        created,
        ...current.filter((item) => item.id !== created.id && item.keyword !== created.keyword),
      ])
      setRankingKeywordInput('')
      setMessage({
        type: 'success',
        message: '플레이스 순위 자동 기록 키워드를 추가했습니다.',
      })
    } catch (error) {
      setMessage({
        type: 'error',
        message:
          error instanceof Error ? error.message : '플레이스 순위 자동 기록 키워드 추가에 실패했습니다.',
      })
    } finally {
      setIsRankingKeywordLoading(false)
    }
  }

  const removeKeyword = async (id: string) => {
    if (isKeywordLoading) {
      return
    }

    setIsKeywordLoading(true)

    try {
      await requestDeleteAiDiagnosisBenchmarkKeyword(id)
      setKeywords((current) => current.filter((item) => item.id !== id))
      setMessage({
        type: 'success',
        message: 'AI 진단 기준 키워드를 삭제했습니다.',
      })
      await loadStatus({ silent: true })
    } catch (error) {
      setMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'AI 진단 기준 키워드 삭제에 실패했습니다.',
      })
    } finally {
      setIsKeywordLoading(false)
    }
  }

  const removeRankingKeyword = async (id: number) => {
    if (isRankingKeywordLoading) {
      return
    }

    setIsRankingKeywordLoading(true)

    try {
      await requestDeletePlaceRankingBatchKeyword(id)
      setRankingKeywords((current) => current.filter((item) => item.id !== id))
      setMessage({
        type: 'success',
        message: '플레이스 순위 자동 기록 키워드를 삭제했습니다.',
      })
    } catch (error) {
      setMessage({
        type: 'error',
        message:
          error instanceof Error ? error.message : '플레이스 순위 자동 기록 키워드 삭제에 실패했습니다.',
      })
    } finally {
      setIsRankingKeywordLoading(false)
    }
  }

  const runRefresh = async (target: RefreshTarget) => {
    if (isRefreshLoading) {
      return
    }

    setIsRefreshLoading(true)
    setMessage({
      type: 'info',
      message:
        target.type === 'all'
          ? '등록된 키워드의 플레이스 데이터를 수집합니다.'
          : `${target.label} 기준 플레이스 데이터를 수집합니다.`,
    })

    try {
      const refreshResult = await requestAiPlaceBenchmarkDailyRun(target.keywordIds)
      const successCount = refreshResult.successCount ?? 0
      const totalKeywords = refreshResult.totalKeywords ?? 0
      const failureCount = refreshResult.failureCount ?? 0
      const message =
        failureCount > 0
          ? `일부 키워드는 접수되지 않았습니다. 작업 알림에서 상세 상태를 확인해 주세요.`
          : refreshResult.backgroundWorkerScheduled === false
            ? '데이터 수집은 시작됐지만 백그라운드 작업 예약에 실패했습니다. 운영 설정을 확인해 주세요.'
            : target.type === 'all'
              ? `등록 키워드 ${successCount || totalKeywords}개의 데이터 수집을 접수했습니다.`
              : `${target.label} 데이터 수집이 시작되었습니다.`

      setMessage({
        type: failureCount > 0 || refreshResult.backgroundWorkerScheduled === false ? 'warning' : 'success',
        message,
      })
      await loadStatus()
    } catch (error) {
      setMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'AI 진단 데이터 수집에 실패했습니다.',
      })
    } finally {
      setIsRefreshLoading(false)
    }
  }

  const cancelRefresh = async (jobId?: string) => {
    try {
      const result = await requestCancelAiDiagnosisHarnessJob(jobId)

      setMessage({
        type: result.cancelledCount > 0 ? 'warning' : 'info',
        message: result.message ?? 'AI 진단 데이터 수집 작업을 중도취소했습니다.',
      })
      await loadStatus()
    } catch (error) {
      setMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'AI 진단 데이터 수집 취소에 실패했습니다.',
      })
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[9998] grid place-items-center bg-black/70 p-3 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="스케줄링 관리"
        onClick={onClose}
      >
        {message ? (
          <div
            className={[
              'pointer-events-none fixed left-1/2 top-4 z-[10000] w-[min(calc(100vw-2rem),32rem)] -translate-x-1/2 rounded-md border px-4 py-3 text-sm font-black leading-5 shadow-[0_18px_46px_rgba(0,0,0,0.38)] backdrop-blur-xl',
              message.type === 'error'
                ? 'border-rose-300/25 bg-rose-400/16 text-rose-50'
                : message.type === 'warning'
                  ? 'border-amber-300/25 bg-amber-300/16 text-amber-50'
                  : message.type === 'success'
                    ? 'border-lime-300/25 bg-lime-300/16 text-lime-50'
                    : 'border-cyan-300/25 bg-cyan-300/16 text-cyan-50',
            ].join(' ')}
          >
            {message.message}
          </div>
        ) : null}

        <section
          className="flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-cyan-300/20 bg-[#070b15] shadow-[0_24px_80px_rgba(0,0,0,0.52)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-200/75">
                Scheduling
              </p>
              <h2 className="mt-1 break-keep text-xl font-black text-white sm:text-2xl">
                스케줄링 관리
              </h2>
              <p className="mt-2 break-keep text-xs font-bold leading-5 text-slate-400 sm:text-sm sm:leading-6">
                플레이스 순위 자동 기록과 AI 진단 데이터 수집 작업을 한곳에서 관리합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-md border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-100 transition hover:bg-white/[0.1]"
            >
              닫기
            </button>
          </div>

          <div className="min-h-0 overflow-y-auto p-3 sm:p-5">
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setActiveTab('ranking')}
                className={[
                  'min-h-20 rounded-md border p-3 text-left transition',
                  activeTab === 'ranking'
                    ? 'border-cyan-300/45 bg-cyan-300/12 text-cyan-50'
                    : 'border-white/10 bg-white/[0.035] text-slate-300 hover:border-cyan-300/25 hover:bg-white/[0.055]',
                ].join(' ')}
              >
                <span className="text-xs font-black uppercase tracking-[0.14em] text-cyan-200/75">
                  Place Ranking
                </span>
                <span className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-base font-black text-white">순위 자동 기록</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-[11px] font-black">
                    {rankingKeywords.length}개
                  </span>
                </span>
                <span className="mt-1 block break-keep text-xs font-bold leading-5 text-slate-400">
                  등록 키워드의 플레이스 순위를 자동으로 기록합니다.
                </span>
                <span className="mt-2 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-2.5 py-1 text-[11px] font-black text-cyan-100">
                  매일 22:00 이후 실행
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('diagnosis')}
                className={[
                  'min-h-20 rounded-md border p-3 text-left transition',
                  activeTab === 'diagnosis'
                    ? 'border-cyan-300/45 bg-cyan-300/12 text-cyan-50'
                    : 'border-white/10 bg-white/[0.035] text-slate-300 hover:border-cyan-300/25 hover:bg-white/[0.055]',
                ].join(' ')}
              >
                <span className="text-xs font-black uppercase tracking-[0.14em] text-cyan-200/75">
                  AI Diagnosis
                </span>
                <span className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-base font-black text-white">AI 진단 데이터</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-[11px] font-black">
                    {keywords.length}개
                  </span>
                </span>
                <span className="mt-1 block break-keep text-xs font-bold leading-5 text-slate-400">
                  등록 키워드의 AI 진단 기준 데이터를 자동으로 수집합니다.
                </span>
                <span className="mt-2 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-2.5 py-1 text-[11px] font-black text-cyan-100">
                  매일 23:00 이후 실행
                </span>
              </button>
            </div>

            {activeTab === 'ranking' ? (
              <section className="mt-3 rounded-md border border-white/10 bg-white/[0.035] p-3 sm:p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-black text-white">플레이스 순위 자동 기록</h3>
                    <p className="mt-1 break-keep text-xs font-bold leading-5 text-slate-400">
                      등록 키워드의 플레이스 순위를 매일 기록합니다.
                    </p>
                  </div>
                </div>

                <form onSubmit={submitRankingKeyword} className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px]">
                  <input
                    value={rankingKeywordInput}
                    onChange={(event) => setRankingKeywordInput(event.target.value)}
                    placeholder="예: 노원 속눈썹펌"
                    disabled={isRankingKeywordLoading}
                    className="min-h-11 rounded-md border border-white/10 bg-[#090d18] px-3 text-sm font-black text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={!rankingKeywordInput.trim() || isRankingKeywordLoading}
                    className="min-h-11 rounded-md border border-cyan-300/35 bg-cyan-300/12 px-4 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    추가
                  </button>
                </form>

                <div className="mt-3 overflow-hidden rounded-md border border-white/10">
                  {rankingKeywords.length ? (
                    rankingKeywords.map((item) => (
                      <div
                        key={item.id}
                        className="grid min-h-12 gap-2 border-b border-white/10 bg-[#090d18]/70 px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-cyan-50">{item.keyword}</p>
                          <p className="mt-1 truncate text-[11px] font-bold text-slate-500">
                            {item.lastRunAt
                              ? `최근 기록: ${formatDateTime(item.lastRunAt)}`
                              : '아직 자동 기록 전입니다.'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRankingKeyword(item.id)}
                          disabled={isRankingKeywordLoading}
                          className="min-h-8 rounded-md border border-white/10 bg-white/[0.05] px-3 text-xs font-black text-slate-200 transition hover:bg-rose-400/15 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          삭제
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm font-bold leading-6 text-slate-400">
                      자동 기록할 키워드를 추가하면 매일 순위 이력이 쌓입니다.
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <section className="mt-3 rounded-md border border-cyan-300/16 bg-cyan-300/[0.035] p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-black text-white">AI 진단 데이터 수집</h3>
                    <p className="mt-1 break-keep text-xs font-bold leading-5 text-slate-400">
                      등록 키워드의 플레이스 데이터를 매일 수집해 AI 진단 기준에 반영합니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRefreshTarget({ type: 'all', label: '전체 키워드' })}
                    disabled={isRefreshLoading || keywords.length === 0}
                    className="min-h-9 shrink-0 rounded-md border border-cyan-300/35 bg-cyan-300/14 px-3 text-xs font-black text-cyan-50 transition hover:bg-cyan-300/22 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isRefreshLoading ? '수집 중...' : '전체 수집'}
                  </button>
                </div>

                <form onSubmit={submitKeyword} className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px]">
                  <input
                    value={keywordInput}
                    onChange={(event) => setKeywordInput(event.target.value)}
                    placeholder="예: 노원 속눈썹펌"
                    disabled={isKeywordLoading}
                    className="min-h-12 rounded-md border border-white/10 bg-[#090d18] px-3 text-sm font-black text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={!keywordInput.trim() || isKeywordLoading}
                    className="min-h-12 rounded-md border border-cyan-300/35 bg-cyan-300/12 px-4 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    추가
                  </button>
                </form>

                <div className="mt-3 grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200/65">
                      등록 키워드 {keywords.length}개
                    </p>
                    {isStatusLoading ? (
                      <span className="text-[11px] font-black text-slate-500">상태 확인 중</span>
                    ) : null}
                  </div>

                  <div className="overflow-hidden rounded-md border border-white/10">
                    {keywords.length ? (
                      keywords.map((keyword) => (
                        <KeywordRow
                          key={keyword.id}
                          isKeywordLoading={isKeywordLoading}
                          keyword={keyword}
                          onCancelRefresh={cancelRefresh}
                          onRefresh={(targetKeyword) =>
                            setRefreshTarget({
                              type: 'keyword',
                              label: targetKeyword.keyword,
                              keywordIds: [targetKeyword.id],
                            })
                          }
                          onRemoveKeyword={removeKeyword}
                          status={
                            status?.keywords.find(
                              (item) => item.normalizedKeyword === keyword.normalized_keyword,
                            ) ?? null
                          }
                        />
                      ))
                    ) : (
                      <div className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm font-bold leading-6 text-slate-400">
                        AI 진단 기준 키워드를 추가하면 해당 키워드의 플레이스 데이터를 수집하고
                        진단 기준에 반영할 수 있습니다.
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>
        </section>
      </div>

      {refreshTarget ? (
        <ConfirmRefreshModal
          isLoading={isRefreshLoading}
          target={refreshTarget}
          onCancel={() => setRefreshTarget(null)}
          onConfirm={() => {
            const target = refreshTarget
            setRefreshTarget(null)
            void runRefresh(target)
          }}
        />
      ) : null}
    </>
  )
}

function KeywordRow({
  isKeywordLoading,
  keyword,
  onCancelRefresh,
  onRefresh,
  onRemoveKeyword,
  status,
}: {
  keyword: AiDiagnosisBenchmarkKeyword
  status: AiDiagnosisDataRefreshStatus['keywords'][number] | null
  isKeywordLoading: boolean
  onCancelRefresh: (jobId?: string) => void
  onRefresh: (keyword: AiDiagnosisBenchmarkKeyword) => void
  onRemoveKeyword: (id: string) => void
}) {
  const canCancel = Boolean(
    status?.latestRun?.id && (status.status === 'QUEUED' || status.status === 'UPDATING'),
  )
  const isActive = status?.status === 'QUEUED' || status?.status === 'UPDATING'
  const isUpdating = status?.status === 'UPDATING'
  const displayStatus = status?.status ?? 'NEEDS_REFRESH'
  const lastCollectedAt = getKeywordLastCollectedAt(status)
  const progress = status?.latestRun
    ? Math.round(
        (Math.min(status.latestRun.evaluatedCount, status.latestRun.totalCount) /
          Math.max(status.latestRun.totalCount, 1)) *
          100,
      )
    : 0

  return (
    <div className="border-b border-white/10 bg-[#090d18]/75 px-3 py-2 last:border-b-0">
      <div className="grid min-h-10 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <StatusDot status={displayStatus} />
            <p className="min-w-0 flex-1 truncate text-sm font-black text-cyan-50">
              {keyword.keyword}
            </p>
          </div>
          <p className="mt-1 truncate text-[11px] font-bold text-slate-500">
            상태: <span className={getStatusTextClassName(displayStatus)}>{formatAiDiagnosisDataStatusLabel(displayStatus)}</span>
            <span className="mx-1 text-slate-700">·</span>
            최근 수집: <span className="text-slate-300">{lastCollectedAt ? formatDateTime(lastCollectedAt) : '아직 없음'}</span>
            {status?.latestRun && isUpdating ? (
              <span className="text-slate-400"> · {Math.min(status.latestRun.evaluatedCount, status.latestRun.totalCount)}/{status.latestRun.totalCount}개</span>
            ) : null}
          </p>
        </div>

        <div
          className={`grid gap-2 ${
            canCancel
              ? 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4.75rem] sm:grid-cols-[7.5rem_7.5rem_auto]'
              : 'grid-cols-[minmax(0,1fr)_4.75rem] sm:grid-cols-[7.5rem_auto]'
          }`}
        >
          <button
            type="button"
            onClick={() => onRefresh(keyword)}
            disabled={isActive || isKeywordLoading}
            className="min-h-8 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/18 disabled:cursor-not-allowed disabled:opacity-50"
          >
            데이터 수집
          </button>
          {canCancel ? (
            <button
              type="button"
              onClick={() => onCancelRefresh(status?.latestRun?.id)}
              className="min-h-8 rounded-md border border-rose-300/25 bg-rose-400/10 px-3 text-xs font-black text-rose-100 transition hover:bg-rose-400/18"
            >
              중도취소
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onRemoveKeyword(keyword.id)}
            disabled={isKeywordLoading || isActive}
            className="min-h-8 rounded-md border border-white/10 bg-white/[0.05] px-3 text-xs font-black text-slate-200 transition hover:bg-rose-400/15 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            삭제
          </button>
        </div>
      </div>

      {status?.latestRun && isUpdating ? (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-orange-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}

function ConfirmRefreshModal({
  isLoading,
  onCancel,
  onConfirm,
  target,
}: {
  target: RefreshTarget
  isLoading: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[9999] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="AI 진단 데이터 수집 확인"
      onClick={onCancel}
    >
      <section
        className="w-full max-w-lg rounded-xl border border-cyan-300/20 bg-[#070b15] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.56)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-200/75">
          AI Diagnosis Data
        </p>
        <h3 className="mt-2 break-keep text-2xl font-black text-white">
          AI 진단 데이터를 수집할까요?
        </h3>
        <div className="mt-4 grid gap-3 text-sm font-bold leading-6 text-slate-300">
          <p>
            {target.type === 'all'
              ? '등록된 전체 키워드의 플레이스 데이터를 다시 수집합니다.'
              : `${target.label} 키워드의 플레이스 데이터를 다시 수집합니다.`}
          </p>
          <p>
            수집이 완료되면 이후 실행되는 AI 플레이스 진단에 최신 기준 데이터가 반영됩니다.
            작업 중에는 기존 기준 데이터가 계속 사용됩니다.
          </p>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="min-h-11 rounded-md border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-slate-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="min-h-11 rounded-md border border-cyan-300/35 bg-cyan-300/14 px-4 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/22 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? '데이터 수집 중...' : '수집 시작'}
          </button>
        </div>
      </section>
    </div>
  )
}

function StatusDot({
  status,
}: {
  status: AiDiagnosisDataRefreshStatus['keywords'][number]['status']
}) {
  const displayStatus = getDisplaySchedulingStatus(status)
  const className =
    displayStatus === 'UPDATING'
      ? 'bg-orange-400 shadow-[0_0_16px_rgba(251,146,60,0.34)]'
      : displayStatus === 'QUEUED'
        ? 'bg-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.32)]'
        : 'bg-slate-400 shadow-[0_0_14px_rgba(148,163,184,0.24)]'

  return <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${className}`} />
}

function getStatusTextClassName(status: AiDiagnosisDataRefreshStatus['keywords'][number]['status']) {
  const displayStatus = getDisplaySchedulingStatus(status)

  if (displayStatus === 'UPDATING') {
    return 'text-orange-100'
  }

  if (displayStatus === 'QUEUED') {
    return 'text-amber-100'
  }

  return 'text-slate-300'
}

async function requestAiDiagnosisBenchmarkKeywords() {
  const response = await fetch('/api/ai-place-diagnosis/benchmark/keywords')
  const body = (await response.json()) as
    | { keywords: AiDiagnosisBenchmarkKeyword[] }
    | DiagnosisErrorBody

  if (!response.ok) {
    const errorBody = body as DiagnosisErrorBody
    throw new Error(errorBody.message ?? 'AI 진단 기준 키워드 조회에 실패했습니다.')
  }

  return (body as { keywords: AiDiagnosisBenchmarkKeyword[] }).keywords
}

async function requestPlaceRankingBatchKeywords() {
  const response = await fetch('/api/place-ranking/batch-keywords')
  const body = (await response.json()) as PlaceRankingBatchKeywordResponse | DiagnosisErrorBody

  if (!response.ok) {
    const errorBody = body as DiagnosisErrorBody
    throw new Error(errorBody.message ?? '플레이스 순위 자동 기록 키워드 조회에 실패했습니다.')
  }

  return (body as PlaceRankingBatchKeywordResponse).keywords
}

async function requestAddPlaceRankingBatchKeyword(keyword: string) {
  const response = await fetch('/api/place-ranking/batch-keywords', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword }),
  })
  const body = (await response.json()) as
    | { keyword: PlaceRankingBatchKeyword }
    | DiagnosisErrorBody

  if (!response.ok) {
    const errorBody = body as DiagnosisErrorBody
    throw new Error(errorBody.message ?? '플레이스 순위 자동 기록 키워드 추가에 실패했습니다.')
  }

  return (body as { keyword: PlaceRankingBatchKeyword }).keyword
}

async function requestDeletePlaceRankingBatchKeyword(id: number) {
  const response = await fetch('/api/place-ranking/batch-keywords', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  const body = (await response.json()) as { ok: boolean } | DiagnosisErrorBody

  if (!response.ok) {
    const errorBody = body as DiagnosisErrorBody
    throw new Error(errorBody.message ?? '플레이스 순위 자동 기록 키워드 삭제에 실패했습니다.')
  }

  return body as { ok: boolean }
}

async function requestAddAiDiagnosisBenchmarkKeyword(keyword: string) {
  const response = await fetch('/api/ai-place-diagnosis/benchmark/keywords', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword }),
  })
  const body = (await response.json()) as
    | { keyword: AiDiagnosisBenchmarkKeyword }
    | DiagnosisErrorBody

  if (!response.ok) {
    const errorBody = body as DiagnosisErrorBody
    throw new Error(errorBody.message ?? 'AI 진단 기준 키워드 추가에 실패했습니다.')
  }

  return (body as { keyword: AiDiagnosisBenchmarkKeyword }).keyword
}

async function requestDeleteAiDiagnosisBenchmarkKeyword(id: string) {
  const response = await fetch('/api/ai-place-diagnosis/benchmark/keywords', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  const body = (await response.json()) as { ok: boolean } | DiagnosisErrorBody

  if (!response.ok) {
    const errorBody = body as DiagnosisErrorBody
    throw new Error(errorBody.message ?? 'AI 진단 기준 키워드 삭제에 실패했습니다.')
  }

  return body as { ok: boolean }
}

async function requestAiPlaceBenchmarkDailyRun(keywordIds?: string[]) {
  const response = await fetch('/api/ai-place-diagnosis/benchmark/daily', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(keywordIds?.length ? { keywordIds } : {}),
  })
  const body = (await response.json()) as
    | {
        totalKeywords?: number
        successCount?: number
        failureCount?: number
        backgroundWorkerScheduled?: boolean
      }
    | DiagnosisErrorBody

  if (!response.ok) {
    const errorBody = body as DiagnosisErrorBody
    throw new Error(errorBody.message ?? 'AI 진단 데이터 수집에 실패했습니다.')
  }

  return body as {
    totalKeywords?: number
    successCount?: number
    failureCount?: number
    backgroundWorkerScheduled?: boolean
  }
}

async function requestAiDiagnosisDataRefreshStatus() {
  const response = await fetch('/api/ai-place-diagnosis/benchmark/status')
  const body = (await response.json()) as AiDiagnosisDataRefreshStatus | DiagnosisErrorBody

  if (!response.ok) {
    const errorBody = body as DiagnosisErrorBody
    throw new Error(errorBody.message ?? 'AI 진단 데이터 상태 조회에 실패했습니다.')
  }

  return body as AiDiagnosisDataRefreshStatus
}

async function requestCancelAiDiagnosisHarnessJob(jobId?: string) {
  const response = await fetch('/api/ai-place-diagnosis/harness/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  })
  const body = (await response.json()) as
    | { ok: boolean; cancelledCount: number; message?: string }
    | DiagnosisErrorBody

  if (!response.ok) {
    const errorBody = body as DiagnosisErrorBody
    throw new Error(errorBody.message ?? 'AI 진단 데이터 수집 취소에 실패했습니다.')
  }

  return body as { ok: boolean; cancelledCount: number; message?: string }
}

function getKeywordLastCollectedAt(status: AiDiagnosisDataRefreshStatus['keywords'][number] | null) {
  if (!status) {
    return null
  }

  return (
    status.latestRun?.completedAt ??
    status.latestProfile?.createdAt ??
    status.latestRun?.createdAt ??
    null
  )
}

function formatAiDiagnosisDataStatusLabel(
  status: AiDiagnosisDataRefreshStatus['keywords'][number]['status'],
) {
  switch (getDisplaySchedulingStatus(status)) {
    case 'QUEUED':
      return '준비 중'
    case 'UPDATING':
      return '진행 중'
    default:
      return '대기 중'
  }
}

function getDisplaySchedulingStatus(status: AiDiagnosisDataRefreshStatus['keywords'][number]['status']) {
  if (status === 'UPDATING') {
    return 'UPDATING'
  }

  if (status === 'QUEUED') {
    return 'QUEUED'
  }

  return 'NEEDS_REFRESH'
}

function formatDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  try {
    return new Intl.DateTimeFormat('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  } catch {
    return date.toLocaleString('ko-KR')
  }
}
