'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { RecentSearchList, ToolLoadingPanel } from '@/features/platform/components/tool-ui'
import type {
  AiPlaceDiagnosisPlaceSearchItem,
  AiPlaceDiagnosisPlaceSearchResponse,
  AiPlaceDiagnosisResponse,
} from '../types'

type DiagnosisErrorBody = {
  message?: string
  retryAfterMs?: number
  availableAt?: string
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

type AiDiagnosisDataRefreshStatus = {
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
  }>
}

type AiDiagnosisDataMessage = {
  type: 'success' | 'warning' | 'error' | 'info'
  message: string
}

const loadingSteps = [
  '키워드 기준 플레이스 신호를 수집하고 있습니다.',
  '소개글과 예약상품 상세 데이터를 자동 보강하고 있습니다.',
  'AIVA 진단 기준에 맞춰 정보 구조를 평가하고 있습니다.',
  'AI 관점의 점수와 개선 피드백을 작성하고 있습니다.',
]
const placeSearchLoadingSteps = [
  '네이버 플레이스에서 상호명을 검색하고 있습니다.',
  '대표 이미지와 주소 정보를 정리하고 있습니다.',
  '선택 가능한 플레이스 목록을 구성하고 있습니다.',
]
const recentPlaceSearchStorageKey = 'aiva:recent-ai-place-diagnosis-places'
const maxRecentPlaceSearches = 5

async function requestPlaceSearch(query: string) {
  const response = await fetch('/api/ai-place-diagnosis/places', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const body = (await response.json()) as AiPlaceDiagnosisPlaceSearchResponse | DiagnosisErrorBody

  if (!response.ok) {
    const errorBody = body as DiagnosisErrorBody
    const error = new Error(errorBody.message ?? '플레이스 검색에 실패했습니다.')

    Object.assign(error, {
      availableAt: errorBody.availableAt,
      debug: errorBody.debug,
      retryAfterMs: errorBody.retryAfterMs,
    })

    throw error
  }

  return body as AiPlaceDiagnosisPlaceSearchResponse
}

async function requestDiagnosis({
  placeId,
  keyword,
}: {
  placeId: string
  keyword: string
}) {
  const response = await fetch('/api/ai-place-diagnosis/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      placeId,
      keyword,
    }),
  })
  const body = (await response.json()) as AiPlaceDiagnosisResponse | DiagnosisErrorBody

  if (!response.ok) {
    const errorBody = body as DiagnosisErrorBody
    const error = new Error(errorBody.message ?? 'AI 플레이스 진단에 실패했습니다.')

    Object.assign(error, {
      availableAt: errorBody.availableAt,
      debug: errorBody.debug,
      retryAfterMs: errorBody.retryAfterMs,
    })

    throw error
  }

  return body as AiPlaceDiagnosisResponse
}

async function requestAiDiagnosisBenchmarkKeywords() {
  const response = await fetch('/api/ai-place-diagnosis/benchmark/keywords')
  const body = (await response.json()) as
    | { keywords: AiDiagnosisBenchmarkKeyword[] }
    | DiagnosisErrorBody

  if (!response.ok) {
    const errorBody = body as DiagnosisErrorBody
    const error = new Error(errorBody.message ?? 'AI 진단 기준 키워드 조회에 실패했습니다.')

    Object.assign(error, {
      debug: errorBody.debug,
    })

    throw error
  }

  return (body as { keywords: AiDiagnosisBenchmarkKeyword[] }).keywords
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
    const error = new Error(errorBody.message ?? 'AI 진단 기준 키워드 추가에 실패했습니다.')

    Object.assign(error, {
      debug: errorBody.debug,
    })

    throw error
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
    const error = new Error(errorBody.message ?? 'AI 진단 기준 키워드 삭제에 실패했습니다.')

    Object.assign(error, {
      debug: errorBody.debug,
    })

    throw error
  }

  return body as { ok: boolean }
}

async function requestAiPlaceBenchmarkDailyRun() {
  const response = await fetch('/api/ai-place-diagnosis/benchmark/daily', {
    method: 'POST',
  })
  const body = (await response.json()) as
    | {
        totalKeywords?: number
        successCount?: number
        failureCount?: number
        results?: Array<{ keyword?: string; ok?: boolean; result?: unknown; message?: string }>
      }
    | DiagnosisErrorBody

  if (!response.ok) {
    const errorBody = body as DiagnosisErrorBody
    const error = new Error(errorBody.message ?? 'AI 진단 데이터 최신화에 실패했습니다.')

    Object.assign(error, {
      debug: errorBody.debug,
    })

    throw error
  }

  return body as {
    totalKeywords?: number
    successCount?: number
    failureCount?: number
    results?: Array<{ keyword?: string; ok?: boolean; result?: unknown; message?: string }>
  }
}

async function requestAiDiagnosisDataRefreshStatus() {
  const response = await fetch('/api/ai-place-diagnosis/benchmark/status')
  const body = (await response.json()) as AiDiagnosisDataRefreshStatus | DiagnosisErrorBody

  if (!response.ok) {
    const errorBody = body as DiagnosisErrorBody
    const error = new Error(errorBody.message ?? 'AI 진단 기준 데이터 상태 조회에 실패했습니다.')

    Object.assign(error, {
      debug: errorBody.debug,
    })

    throw error
  }

  return body as AiDiagnosisDataRefreshStatus
}

export function AiPlaceDiagnosisTool() {
  const [placeSearchQuery, setPlaceSearchQuery] = useState('')
  const [recentPlaceSearches, setRecentPlaceSearches] = useState<string[]>([])
  const [placeSearchItems, setPlaceSearchItems] = useState<AiPlaceDiagnosisPlaceSearchItem[]>([])
  const [selectedPlace, setSelectedPlace] = useState<AiPlaceDiagnosisPlaceSearchItem | null>(null)
  const [keyword, setKeyword] = useState('')
  const [result, setResult] = useState<AiPlaceDiagnosisResponse | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [searchLoadingStep, setSearchLoadingStep] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [errorRetryNotice, setErrorRetryNotice] = useState('')
  const [errorLog, setErrorLog] = useState('')
  const [benchmarkKeywords, setBenchmarkKeywords] = useState<AiDiagnosisBenchmarkKeyword[]>([])
  const [benchmarkKeywordInput, setBenchmarkKeywordInput] = useState('')
  const [isBenchmarkKeywordLoading, setIsBenchmarkKeywordLoading] = useState(false)
  const [aiDiagnosisDataStatus, setAiDiagnosisDataStatus] =
    useState<AiDiagnosisDataRefreshStatus | null>(null)
  const [isAiDiagnosisDataStatusLoading, setIsAiDiagnosisDataStatusLoading] = useState(false)
  const [isAiDiagnosisDataRefreshLoading, setIsAiDiagnosisDataRefreshLoading] = useState(false)
  const [aiDiagnosisDataMessage, setAiDiagnosisDataMessage] =
    useState<AiDiagnosisDataMessage | null>(null)
  const [isAiDiagnosisDataModalOpen, setIsAiDiagnosisDataModalOpen] = useState(false)
  const [isAiDiagnosisRefreshConfirmOpen, setIsAiDiagnosisRefreshConfirmOpen] = useState(false)

  const canSubmit = useMemo(
    () => Boolean(selectedPlace && keyword.trim() && !isLoading && !isSearching),
    [isLoading, isSearching, keyword, selectedPlace],
  )

  const canSearch = useMemo(
    () => Boolean(placeSearchQuery.trim() && !isSearching && !isLoading),
    [isLoading, isSearching, placeSearchQuery],
  )

  useEffect(() => {
    setRecentPlaceSearches(readRecentPlaceSearches())
    loadBenchmarkKeywords()
    loadAiDiagnosisDataStatus({ silent: true })
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadAiDiagnosisDataStatus({ silent: true })
    }, 10000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    if (!isAiDiagnosisDataModalOpen && !isAiDiagnosisRefreshConfirmOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isAiDiagnosisDataModalOpen, isAiDiagnosisRefreshConfirmOpen])

  const loadBenchmarkKeywords = async () => {
    setIsBenchmarkKeywordLoading(true)

    try {
      setBenchmarkKeywords(await requestAiDiagnosisBenchmarkKeywords())
    } catch (error) {
      setAiDiagnosisDataMessage({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'AI 진단 기준 키워드 조회에 실패했습니다.',
      })
    } finally {
      setIsBenchmarkKeywordLoading(false)
    }
  }

  const loadAiDiagnosisDataStatus = async ({ silent = false }: { silent?: boolean } = {}) => {
    setIsAiDiagnosisDataStatusLoading(true)

    try {
      setAiDiagnosisDataStatus(await requestAiDiagnosisDataRefreshStatus())
    } catch (error) {
      if (!silent) {
        setAiDiagnosisDataMessage({
          type: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'AI 진단 기준 데이터 상태 조회에 실패했습니다.',
        })
      }
    } finally {
      setIsAiDiagnosisDataStatusLoading(false)
    }
  }

  const submitBenchmarkKeyword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextKeyword = benchmarkKeywordInput.trim()

    if (!nextKeyword || isBenchmarkKeywordLoading) {
      return
    }

    setIsBenchmarkKeywordLoading(true)

    try {
      const created = await requestAddAiDiagnosisBenchmarkKeyword(nextKeyword)

      setBenchmarkKeywords((current) => [
        created,
        ...current.filter(
          (item) => item.id !== created.id && item.normalized_keyword !== created.normalized_keyword,
        ),
      ])
      setBenchmarkKeywordInput('')
      setAiDiagnosisDataMessage({
        type: 'success',
        message: 'AI 진단 기준 키워드를 추가했습니다.',
      })
      await loadAiDiagnosisDataStatus({ silent: true })
    } catch (error) {
      setAiDiagnosisDataMessage({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'AI 진단 기준 키워드 추가에 실패했습니다.',
      })
    } finally {
      setIsBenchmarkKeywordLoading(false)
    }
  }

  const removeBenchmarkKeyword = async (id: string) => {
    if (isBenchmarkKeywordLoading) {
      return
    }

    setIsBenchmarkKeywordLoading(true)

    try {
      await requestDeleteAiDiagnosisBenchmarkKeyword(id)
      setBenchmarkKeywords((current) => current.filter((item) => item.id !== id))
      setAiDiagnosisDataMessage({
        type: 'success',
        message: 'AI 진단 기준 키워드를 삭제했습니다.',
      })
      await loadAiDiagnosisDataStatus({ silent: true })
    } catch (error) {
      setAiDiagnosisDataMessage({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'AI 진단 기준 키워드 삭제에 실패했습니다.',
      })
    } finally {
      setIsBenchmarkKeywordLoading(false)
    }
  }

  const runAiDiagnosisDataRefresh = async () => {
    if (isAiDiagnosisDataRefreshLoading || aiDiagnosisDataStatus?.hasUpdatingKeyword) {
      return
    }

    setIsAiDiagnosisDataRefreshLoading(true)
    setAiDiagnosisDataMessage({
      type: 'info',
      message: '등록된 AI 진단 기준 키워드의 플레이스 관찰 데이터를 최신화합니다.',
    })

    try {
      const refreshResult = await requestAiPlaceBenchmarkDailyRun()
      const successCount = refreshResult.successCount ?? 0
      const totalKeywords = refreshResult.totalKeywords ?? 0
      const failureCount = refreshResult.failureCount ?? 0
      const message =
        failureCount > 0
          ? `AI 진단 데이터 최신화가 일부 시작되었습니다. ${successCount}/${totalKeywords}개 성공, ${failureCount}개 실패`
          : `AI 진단 데이터 최신화가 시작되었습니다. 등록 키워드 ${successCount}개를 수집하고 분석합니다.`

      setAiDiagnosisDataMessage({
        type: failureCount > 0 ? 'warning' : 'success',
        message,
      })
      await loadAiDiagnosisDataStatus()
    } catch (error) {
      setAiDiagnosisDataMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'AI 진단 데이터 최신화에 실패했습니다.',
      })
    } finally {
      setIsAiDiagnosisDataRefreshLoading(false)
    }
  }

  const searchPlaces = async (query: string) => {
    const trimmedQuery = query.trim()

    if (!trimmedQuery || isSearching || isLoading) {
      return
    }

    setIsSearching(true)
    setResult(null)
    setSelectedPlace(null)
    setPlaceSearchItems([])
    setErrorMessage('')
    setErrorRetryNotice('')
    setErrorLog('')

    const timer = window.setInterval(() => {
      setSearchLoadingStep((current) => (current + 1) % placeSearchLoadingSteps.length)
    }, 1200)

    try {
      const response = await requestPlaceSearch(trimmedQuery)

      setPlaceSearchItems(response.items)
      setRecentPlaceSearches(saveRecentPlaceSearch(trimmedQuery))
      if (!response.items.length) {
        setErrorMessage('검색 결과가 없습니다. 플레이스명을 조금 더 정확히 입력해주세요.')
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '플레이스 검색에 실패했습니다.')
      setErrorRetryNotice(createRetryNotice(error))
      setErrorLog(JSON.stringify((error as { debug?: unknown }).debug ?? {}, null, 2))
    } finally {
      window.clearInterval(timer)
      setSearchLoadingStep(0)
      setIsSearching(false)
    }
  }

  const handlePlaceSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await searchPlaces(placeSearchQuery)
  }

  const applyRecentPlaceSearch = async (query: string) => {
    setPlaceSearchQuery(query)
    await searchPlaces(query)
  }

  const removeRecentPlaceSearch = (query: string) => {
    setRecentPlaceSearches(deleteRecentPlaceSearch(query))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!canSubmit) {
      return
    }

    setIsLoading(true)
    setResult(null)
    setErrorMessage('')
    setErrorRetryNotice('')
    setErrorLog('')

    const timer = window.setInterval(() => {
      setLoadingStep((current) => (current + 1) % loadingSteps.length)
    }, 1400)

    try {
      setResult(
        await requestDiagnosis({
          placeId: selectedPlace?.id ?? '',
          keyword,
        }),
      )
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'AI 플레이스 진단에 실패했습니다.')
      setErrorRetryNotice(createRetryNotice(error))
      setErrorLog(JSON.stringify((error as { debug?: unknown }).debug ?? {}, null, 2))
    } finally {
      window.clearInterval(timer)
      setLoadingStep(0)
      setIsLoading(false)
    }
  }

  return (
    <div className="grid min-w-0 gap-6">
      <section className="grid gap-5 rounded-md border border-cyan-300/20 bg-[#0b1727]/82 p-5 shadow-[0_0_34px_rgba(34,211,238,0.08)] md:p-6">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="grid gap-2">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200/75">
              AI Place Diagnosis
            </p>
            <h1 className="break-keep text-2xl font-black text-white md:text-3xl">
              AI 플레이스 진단
            </h1>
            <p className="break-keep text-sm font-semibold leading-7 text-slate-300">
              플레이스명을 검색해 매장을 선택하고, 분석 키워드를 입력하면 소개글, 예약상품,
              리뷰, 이미지, 전환 기능을 자동 수집해 AI 관점의 진단 점수와 개선 피드백을
              생성합니다.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsAiDiagnosisDataModalOpen(true)
              loadBenchmarkKeywords()
              loadAiDiagnosisDataStatus({ silent: true })
            }}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.045] px-4 text-xs font-black text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.08] hover:text-cyan-50"
          >
            <span className="text-cyan-200/75">운영 설정</span>
            <span className="h-3 w-px bg-white/15" aria-hidden="true" />
            AI 진단 데이터 관리
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-2 py-0.5 text-[11px] text-cyan-100/80">
              {benchmarkKeywords.length}
            </span>
          </button>
        </div>

        <form
          className="rounded-md border border-white/10 bg-white/[0.06] p-3 shadow-[0_22px_50px_rgba(0,0,0,0.18)]"
          onSubmit={handlePlaceSearch}
        >
          <label className="mb-2 block text-sm font-black text-slate-200">플레이스명 검색</label>
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={placeSearchQuery}
              onChange={(event) => {
                setPlaceSearchQuery(event.target.value)
                setSelectedPlace(null)
                setResult(null)
              }}
              placeholder="예: 라솝뷰티"
              disabled={isSearching || isLoading}
              className="min-h-14 flex-1 rounded-md border border-white/10 bg-[#090d18] px-4 text-lg font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!canSearch}
              className="min-h-14 rounded-md bg-white px-6 text-base font-black text-[#070a12] shadow-[0_0_26px_rgba(34,211,238,0.2)] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isSearching ? '검색 중' : '플레이스 검색'}
            </button>
          </div>
        </form>

        <RecentSearchList
          disabled={isSearching || isLoading}
          keywords={recentPlaceSearches}
          label="최근 플레이스 검색"
          onRemove={removeRecentPlaceSearch}
          onSelect={applyRecentPlaceSearch}
        />

        {placeSearchItems.length ? (
          <div className="grid gap-3">
            <p className="text-sm font-black text-slate-200">검색 결과에서 진단할 플레이스를 선택하세요</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {placeSearchItems.map((place) => (
                <PlaceSearchCard
                  key={place.id}
                  place={place}
                  selected={selectedPlace?.id === place.id}
                  onSelect={() => {
                    setSelectedPlace(place)
                    setResult(null)
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}

        {isSearching ? (
          <ToolLoadingPanel
            eyebrow="Searching"
            step={searchLoadingStep}
            steps={placeSearchLoadingSteps}
            subtitle="플레이스명과 일치하는 네이버 플레이스 후보를 찾고 있습니다."
            title="진단할 플레이스를 검색하는 중입니다"
          />
        ) : null}

        {selectedPlace ? (
          <div className="rounded-md border border-cyan-200/25 bg-cyan-300/10 p-4">
            <p className="text-xs font-black text-cyan-100/80">선택된 플레이스</p>
            <p className="mt-1 break-keep text-sm font-black text-white">
              {selectedPlace.name} · {selectedPlace.category}
            </p>
            <p className="mt-1 break-keep text-xs font-semibold leading-5 text-slate-300">
              {selectedPlace.address || '주소 정보 없음'}
            </p>
          </div>
        ) : null}

        <form
          className="rounded-md border border-white/10 bg-white/[0.06] p-3 shadow-[0_22px_50px_rgba(0,0,0,0.18)]"
          onSubmit={handleSubmit}
        >
          <label className="grid gap-2">
            <span className="text-sm font-black text-slate-200">분석 키워드</span>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="예: 노원 속눈썹펌"
              disabled={isSearching || isLoading}
              className="min-h-14 rounded-md border border-white/10 bg-[#090d18] px-4 text-lg font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-3 min-h-14 rounded-md bg-white px-6 text-base font-black text-[#070a12] shadow-[0_0_26px_rgba(34,211,238,0.2)] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45 md:w-fit"
          >
            {isLoading ? '진단 중' : 'AI 진단 시작'}
          </button>
        </form>

        {isLoading ? (
          <ToolLoadingPanel
            eyebrow="Diagnosing"
            step={loadingStep}
            steps={loadingSteps}
            subtitle="수집된 플레이스 신호를 바탕으로 AIVA 진단 점수와 개선 피드백을 생성합니다."
            title="AI 플레이스 진단을 진행하는 중입니다"
          />
        ) : null}

        {errorMessage ? (
          <div className="grid gap-3 rounded-md border border-rose-300/25 bg-rose-400/10 p-4">
            <p className="text-sm font-black text-rose-100">{errorMessage}</p>
            {errorRetryNotice ? (
              <p className="break-keep rounded-md border border-amber-200/25 bg-amber-300/10 p-3 text-xs font-black leading-5 text-amber-100">
                {errorRetryNotice}
              </p>
            ) : null}
            {errorLog && errorLog !== '{}' ? (
              <pre className="max-h-48 overflow-auto rounded-md bg-black/30 p-3 text-xs text-rose-100/80">
                {errorLog}
              </pre>
            ) : null}
          </div>
        ) : null}
      </section>

      {result ? <DiagnosisResult result={result} /> : null}

      {isAiDiagnosisDataModalOpen ? (
        <AiDiagnosisDataManagementModal
          keywordInput={benchmarkKeywordInput}
          keywords={benchmarkKeywords}
          message={aiDiagnosisDataMessage}
          status={aiDiagnosisDataStatus}
          isKeywordLoading={isBenchmarkKeywordLoading}
          isStatusLoading={isAiDiagnosisDataStatusLoading}
          isRefreshLoading={isAiDiagnosisDataRefreshLoading}
          onKeywordInputChange={setBenchmarkKeywordInput}
          onSubmitKeyword={submitBenchmarkKeyword}
          onRemoveKeyword={removeBenchmarkKeyword}
          onRequestDataRefresh={() => setIsAiDiagnosisRefreshConfirmOpen(true)}
          onClose={() => setIsAiDiagnosisDataModalOpen(false)}
        />
      ) : null}

      {isAiDiagnosisRefreshConfirmOpen ? (
        <AiDiagnosisDataRefreshConfirmModal
          isLoading={isAiDiagnosisDataRefreshLoading}
          onCancel={() => setIsAiDiagnosisRefreshConfirmOpen(false)}
          onConfirm={() => {
            setIsAiDiagnosisRefreshConfirmOpen(false)
            runAiDiagnosisDataRefresh()
          }}
        />
      ) : null}
    </div>
  )
}

type AiDiagnosisDataManagementModalProps = {
  keywordInput: string
  keywords: AiDiagnosisBenchmarkKeyword[]
  message: AiDiagnosisDataMessage | null
  status: AiDiagnosisDataRefreshStatus | null
  isKeywordLoading: boolean
  isStatusLoading: boolean
  isRefreshLoading: boolean
  onKeywordInputChange: (value: string) => void
  onSubmitKeyword: (event: FormEvent<HTMLFormElement>) => void
  onRemoveKeyword: (id: string) => void
  onRequestDataRefresh: () => void
  onClose: () => void
}

function AiDiagnosisDataManagementModal({
  keywordInput,
  keywords,
  message,
  status,
  isKeywordLoading,
  isStatusLoading,
  isRefreshLoading,
  onKeywordInputChange,
  onSubmitKeyword,
  onRemoveKeyword,
  onRequestDataRefresh,
  onClose,
}: AiDiagnosisDataManagementModalProps) {
  const latestStatus = getRepresentativeAiDiagnosisDataStatus(status)
  const isDataUpdating = isRefreshLoading || Boolean(status?.hasUpdatingKeyword)
  const statusLabel = latestStatus
    ? formatAiDiagnosisDataStatusLabel(latestStatus.status)
    : keywords.length > 0
      ? '갱신 필요'
      : '키워드 없음'

  return (
    <div
      className="fixed inset-0 z-[9998] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="AI 진단 데이터 관리"
      onClick={onClose}
    >
      <section
        className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#070b15] shadow-[0_24px_80px_rgba(0,0,0,0.52)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200/75">
              AI Diagnosis Data
            </p>
            <h2 className="mt-1 break-keep text-2xl font-black text-white">
              AI 진단 데이터 관리
            </h2>
            <p className="mt-2 break-keep text-sm font-bold leading-6 text-slate-400">
              AI 플레이스 진단 기준으로 사용할 키워드와 최신화 상태를 관리합니다.
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

        <div className="min-h-0 overflow-y-auto p-5">
          <div className="grid gap-2 rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs font-bold text-slate-300 sm:grid-cols-2">
            <p>
              최근 최신화:{' '}
              <span className="text-slate-100">
                {latestStatus?.latestProfile?.createdAt
                  ? formatDateTime(latestStatus.latestProfile.createdAt)
                  : '아직 없음'}
              </span>
            </p>
            <p>
              등록 키워드: <span className="text-slate-100">{keywords.length}개</span>
            </p>
            <p>
              분석 범위: <span className="text-slate-100">플레이스 1~50위</span>
            </p>
            <p>
              상태: <span className="text-slate-100">{statusLabel}</span>
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
            <button
              type="button"
              onClick={onRequestDataRefresh}
              disabled={isDataUpdating || isKeywordLoading || keywords.length === 0}
              className="min-h-12 rounded-md border border-cyan-300/35 bg-cyan-300/14 px-4 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/22 disabled:cursor-not-allowed disabled:opacity-50 sm:order-2"
            >
              {isDataUpdating ? 'AI 진단 데이터 최신화 중...' : 'AI 진단 데이터 최신화'}
            </button>
            <p className="break-keep text-xs font-bold leading-5 text-slate-400 sm:order-1">
              {isStatusLoading ? '현재 상태 확인 중...' : '실행 상태는 자동으로 반영됩니다.'}
            </p>
          </div>

          <form
            onSubmit={onSubmitKeyword}
            className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px]"
          >
            <input
              value={keywordInput}
              onChange={(event) => onKeywordInputChange(event.target.value)}
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

          <div className="mt-3 grid gap-2 rounded-md border border-white/10 bg-white/[0.035] p-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200/65">
                AI 진단 기준 키워드 {keywords.length}개
              </p>
            </div>

            <div className="grid max-h-52 gap-2 overflow-y-auto pr-1">
              {keywords.length ? (
                keywords.map((keyword) => (
                  <div
                    key={keyword.id}
                    className="grid gap-2 rounded-md border border-white/10 bg-[#090d18]/75 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-cyan-50">
                        {keyword.keyword}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveKeyword(keyword.id)}
                      disabled={isKeywordLoading}
                      className="min-h-9 rounded-md border border-white/10 bg-white/[0.05] px-3 text-xs font-black text-slate-200 transition hover:bg-rose-400/15 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm font-bold text-slate-400">
                  AI 진단 기준 키워드를 추가하면 배치가 해당 키워드의 플레이스 관찰 데이터를
                  관리합니다.
                </div>
              )}
            </div>
          </div>

          {latestStatus?.status === 'NEEDS_REFRESH' ? (
            <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/[0.08] px-3 py-2 text-xs font-bold leading-5 text-amber-100">
              마지막 최신화 이후 24시간이 지났습니다.
            </p>
          ) : null}
          {message ? (
            <p
              className={[
                'mt-3 rounded-md border px-3 py-2 text-xs font-bold leading-5',
                message.type === 'error'
                  ? 'border-rose-300/20 bg-rose-300/[0.08] text-rose-100'
                  : message.type === 'warning'
                    ? 'border-amber-300/20 bg-amber-300/[0.08] text-amber-100'
                  : message.type === 'success'
                    ? 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100'
                    : 'border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-100',
              ].join(' ')}
            >
              {message.message}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )
}

type AiDiagnosisDataRefreshConfirmModalProps = {
  isLoading: boolean
  onCancel: () => void
  onConfirm: () => void
}

function AiDiagnosisDataRefreshConfirmModal({
  isLoading,
  onCancel,
  onConfirm,
}: AiDiagnosisDataRefreshConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-[9999] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="AI 진단 데이터 최신화 확인"
      onClick={onCancel}
    >
      <section
        className="w-full max-w-lg rounded-2xl border border-cyan-300/20 bg-[#070b15] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.56)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200/75">
          AI Diagnosis Data
        </p>
        <h3 className="mt-2 break-keep text-2xl font-black text-white">
          AI 진단 데이터를 최신화할까요?
        </h3>
        <div className="mt-4 grid gap-3 text-sm font-bold leading-6 text-slate-300">
          <p>
            등록된 AI 진단 기준 키워드의 플레이스 1~50위 데이터를 다시 수집하고
            분석합니다.
          </p>
          <p>
            최신화가 완료되면 이후 실행되는 AI 플레이스 진단에 새로운 기준 데이터가
            반영됩니다. 작업 중에는 기존 활성 진단 데이터를 계속 사용합니다.
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
            {isLoading ? '데이터 최신화 중...' : '최신화 시작'}
          </button>
        </div>
      </section>
    </div>
  )
}

function DiagnosisResult({ result }: { result: AiPlaceDiagnosisResponse }) {
  return (
    <section className="grid gap-5">
      <div className="grid gap-4 rounded-md border border-white/10 bg-[#0b1220]/88 p-5 md:p-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div>
            <p className="text-sm font-black text-cyan-100">{result.keyword}</p>
            <h2 className="mt-1 break-keep text-2xl font-black text-white">
              {result.target.name}
            </h2>
            <p className="mt-2 text-sm font-semibold text-slate-300">
              참고 순위 {result.target.rank}위 · {result.target.category} · {result.target.address}
            </p>
            <p className="mt-3 break-keep text-xs font-semibold leading-5 text-slate-400">
              {result.scoreNotice}
            </p>
          </div>
          <div className="grid gap-2 rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] p-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100/80">
              Diagnosis Status
            </p>
            <p className="text-sm font-black text-white">
              {result.aiAnalysisAvailable ? 'AI 상세 분석 완료' : '기본 진단 완료 · AI 상세 분석 일시 불가'}
            </p>
            <p className="break-keep text-xs font-semibold leading-5 text-slate-400">
              {result.benchmark.summary}
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <ScoreMetric label="AI 플레이스 준비도" value={`${result.score.absolute}점`} />
          <ScoreMetric label="데이터 신뢰도" value={`${result.score.dataConfidence}%`} />
          <ScoreMetric
            label="키워드 경쟁 벤치마크"
            value={
              typeof result.score.benchmarkPercentile === 'number'
                ? `상위 ${100 - result.score.benchmarkPercentile}%`
                : '기본 기준'
            }
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="참고 순위" value={`${result.target.rank}위`} />
          <Metric
            label="방문자 리뷰"
            value={`${result.target.metrics.totalReviewCount.toLocaleString()}개`}
          />
          <Metric label="블로그 리뷰" value={`${result.target.metrics.blogCafeReviewCount.toLocaleString()}개`} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="항목별 점수">
          <div className="grid gap-3">
            {result.scores.map((score) => (
              <div key={score.key} className="grid gap-2 rounded-md border border-white/10 bg-white/[0.035] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-white">{score.label}</p>
                  <p className="text-sm font-black text-cyan-100">
                    {score.score}/{score.maxScore}
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-cyan-200"
                    style={{ width: `${(score.score / score.maxScore) * 100}%` }}
                  />
                </div>
                <p className="break-keep text-xs font-semibold leading-5 text-slate-400">
                  {score.reason}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="부족한 항목 TOP 5">
          <NumberedList items={result.topGaps} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="자동 수집 현황">
          <div className="grid gap-3">
            {result.target.dataSources.map((source) => (
              <div
                key={source.key}
                className="rounded-md border border-white/10 bg-white/[0.035] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-black text-white">{source.label}</p>
                  <span className={getSourceStatusClassName(source.status)}>
                    {toSourceStatusLabel(source.status)}
                    {typeof source.count === 'number' ? ` · ${source.count}` : ''}
                  </span>
                </div>
                <p className="mt-2 break-keep text-xs font-semibold leading-5 text-slate-400">
                  {source.message}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="수집된 플레이스 신호">
          <div className="grid gap-3">
            <SignalRow label="소개글" value={summarizeText(result.target.profile.introduction)} />
            <SignalRow label="홍보 문구" value={result.target.profile.promotion || '수집값 없음'} />
            <SignalRow label="오시는 길" value={summarizeText(result.target.profile.locationGuide)} />
            <SignalRow
              label="편의/서비스"
              value={
                result.target.profile.amenities.length
                  ? result.target.profile.amenities.join(', ')
                  : '수집값 없음'
              }
            />
            <SignalRow
              label="이미지"
              value={`${result.target.profile.imageUrls.length || result.target.metrics.imageCount}개`}
            />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="개선 우선순위">
          <NumberedList items={result.priorities} />
        </Panel>
        <Panel title="잘하고 있는 항목">
          <BulletList items={result.strengths} />
        </Panel>
        <Panel title="리뷰 유도 키워드">
          <div className="flex flex-wrap gap-2">
            {result.reviewKeywords.map((keyword) => (
              <span
                key={keyword}
                className="rounded-md border border-fuchsia-200/20 bg-fuchsia-300/10 px-3 py-2 text-xs font-black text-fuchsia-100"
              >
                {keyword}
              </span>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TextPanel title="소개글 개선안" text={result.introductionExample} />
        <TextPanel title="메뉴 설명 개선안" text={result.menuDescriptionExample} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="이미지/콘텐츠 보완 포인트">
          <BulletList items={result.imageContentActions} />
        </Panel>
        <Panel title="예약상품 개선 포인트">
          <BulletList items={result.bookingProductActions} />
        </Panel>
      </div>

      {result.target.bookingProducts.length ? (
        <Panel title="자동 수집된 예약상품">
          <div className="grid gap-3">
            {result.target.bookingProducts.map((product) => (
              <div key={product.id} className="rounded-md border border-white/10 bg-white/[0.035] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-black text-white">{product.name}</p>
                  <span className="rounded-md border border-cyan-200/20 bg-cyan-300/10 px-2 py-1 text-[11px] font-black text-cyan-100">
                    {formatProductPrice(product)}
                  </span>
                </div>
                <p className="mt-3 break-keep text-sm font-semibold leading-6 text-slate-300">
                  {product.description || '상품 설명 없음'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <SmallBadge label={`예약 ${product.minBookingCount}-${product.maxBookingCount}명`} />
                  <SmallBadge
                    label={
                      product.inferredDurationMinutes
                        ? `소요 ${product.inferredDurationMinutes}분 추정`
                        : '소요시간 미등록'
                    }
                  />
                  <SmallBadge label={`주의사항 ${product.precautions.length}개`} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel title="사용된 기준 버전">
        <div className="grid gap-2 text-xs font-semibold leading-5 text-slate-300 md:grid-cols-2">
          <p>루브릭: {result.versions.rubricVersion}</p>
          <p>점수 계산기: {result.versions.scorerVersion}</p>
          <p>프롬프트: {result.versions.promptVersion}</p>
          <p>벤치마크: {result.versions.benchmarkProfileId ?? result.benchmark.profile.status}</p>
        </div>
      </Panel>
    </section>
  )
}

function ScoreMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-cyan-300/22 bg-cyan-300/10 p-4">
      <p className="break-keep text-xs font-black text-cyan-100/80">{label}</p>
      <p className="mt-2 break-keep text-3xl font-black text-white">{value}</p>
    </div>
  )
}

function PlaceSearchCard({
  onSelect,
  place,
  selected,
}: {
  onSelect: () => void
  place: AiPlaceDiagnosisPlaceSearchItem
  selected: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`grid min-h-[8.5rem] grid-cols-[5.5rem_minmax(0,1fr)] gap-3 rounded-md border p-3 text-left transition ${
        selected
          ? 'border-cyan-200/70 bg-cyan-300/14 shadow-[0_0_0_3px_rgba(103,232,249,0.10)]'
          : 'border-white/10 bg-white/[0.035] hover:border-cyan-200/35 hover:bg-cyan-300/8'
      }`}
      aria-pressed={selected}
    >
      <div className="h-24 w-full overflow-hidden rounded-md border border-white/10 bg-[#090d18]">
        {place.imageUrl ? (
          <img
            src={place.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full place-items-center px-2 text-center text-[11px] font-black text-slate-500">
            이미지 없음
          </div>
        )}
      </div>

      <span className="grid min-w-0 content-start gap-2">
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span className="min-w-0 break-keep text-sm font-black leading-5 text-white">
            {place.name}
          </span>
          {selected ? (
            <span className="shrink-0 rounded-md bg-cyan-100 px-2 py-1 text-[10px] font-black text-[#071018]">
              선택
            </span>
          ) : null}
        </span>
        <span className="break-keep text-xs font-black leading-5 text-cyan-100">
          {place.category || '업종 정보 없음'}
        </span>
        <span className="break-keep text-xs font-semibold leading-5 text-slate-400">
          {place.address || '주소 정보 없음'}
        </span>
      </span>
    </button>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
      <p className="text-xs font-black text-slate-400">{label}</p>
      <p className="mt-2 break-keep text-lg font-black text-white">{value}</p>
    </div>
  )
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <article className="rounded-md border border-white/10 bg-[#0b1220]/82 p-5">
      <h3 className="break-keep text-lg font-black text-white">{title}</h3>
      <div className="mt-4">{children}</div>
    </article>
  )
}

function TextPanel({ text, title }: { text: string; title: string }) {
  return (
    <Panel title={title}>
      <p className="break-keep rounded-md border border-cyan-300/18 bg-cyan-300/8 p-4 text-sm font-semibold leading-7 text-cyan-50">
        {text}
      </p>
    </Panel>
  )
}

function SignalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-md border border-white/10 bg-white/[0.035] p-3">
      <p className="text-xs font-black text-cyan-100/80">{label}</p>
      <p className="break-keep text-sm font-semibold leading-6 text-slate-300">{value}</p>
    </div>
  )
}

function SmallBadge({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-[11px] font-black text-slate-300">
      {label}
    </span>
  )
}

function NumberedList({ items }: { items: string[] }) {
  return (
    <ol className="grid gap-3">
      {items.map((item, index) => (
        <li key={`${index}-${item}`} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-cyan-100 text-xs font-black text-[#071018]">
            {index + 1}
          </span>
          <span className="break-keep pt-1 text-sm font-semibold leading-6 text-slate-300">
            {item}
          </span>
        </li>
      ))}
    </ol>
  )
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <li key={item} className="break-keep rounded-md border border-white/10 bg-white/[0.035] p-3 text-sm font-semibold leading-6 text-slate-300">
          {item}
        </li>
      ))}
    </ul>
  )
}

function summarizeText(value: string) {
  if (!value) {
    return '수집값 없음'
  }

  return value.length > 180 ? `${value.slice(0, 180)}...` : value
}

function readRecentPlaceSearches() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(recentPlaceSearchStorageKey) ?? '[]')

    return Array.isArray(parsed)
      ? parsed.filter((keyword): keyword is string => typeof keyword === 'string').slice(0, maxRecentPlaceSearches)
      : []
  } catch {
    return []
  }
}

function saveRecentPlaceSearch(query: string) {
  if (typeof window === 'undefined') {
    return []
  }

  const trimmedQuery = query.trim()

  if (!trimmedQuery) {
    return readRecentPlaceSearches()
  }

  const nextQueries = [
    trimmedQuery,
    ...readRecentPlaceSearches().filter((recentQuery) => recentQuery !== trimmedQuery),
  ].slice(0, maxRecentPlaceSearches)

  window.localStorage.setItem(recentPlaceSearchStorageKey, JSON.stringify(nextQueries))

  return nextQueries
}

function deleteRecentPlaceSearch(query: string) {
  if (typeof window === 'undefined') {
    return []
  }

  const nextQueries = readRecentPlaceSearches().filter((recentQuery) => recentQuery !== query)

  window.localStorage.setItem(recentPlaceSearchStorageKey, JSON.stringify(nextQueries))

  return nextQueries
}

function createRetryNotice(error: unknown) {
  const retryAfterMs = (error as { retryAfterMs?: unknown }).retryAfterMs
  const availableAt = (error as { availableAt?: unknown }).availableAt

  if (typeof retryAfterMs !== 'number' || retryAfterMs <= 0) {
    return ''
  }

  const retryText = formatRetryAfter(retryAfterMs)
  const availableText =
    typeof availableAt === 'string' && availableAt
      ? ` 예상 가능 시간: ${formatAvailableAt(availableAt)}`
      : ''

  return `요청 제한이 풀릴 때까지 ${retryText} 정도 기다려주세요.${availableText}`
}

function formatRetryAfter(value: number) {
  const seconds = Math.max(1, Math.ceil(value / 1000))

  if (seconds < 60) {
    return `${seconds}초`
  }

  return `${Math.ceil(seconds / 60)}분`
}

function formatAvailableAt(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function getRepresentativeAiDiagnosisDataStatus(status: AiDiagnosisDataRefreshStatus | null) {
  if (!status?.keywords.length) {
    return null
  }

  return (
    status.keywords.find((keyword) => keyword.status === 'UPDATING') ??
    status.keywords.find((keyword) => keyword.status === 'QUEUED') ??
    status.keywords.find((keyword) => keyword.status === 'FAILED') ??
    status.keywords.find((keyword) => keyword.status === 'PARTIAL') ??
    status.keywords[0]
  )
}

function formatAiDiagnosisDataStatusLabel(
  status: AiDiagnosisDataRefreshStatus['keywords'][number]['status'],
) {
  switch (status) {
    case 'FRESH':
      return '최신'
    case 'NEEDS_REFRESH':
      return '갱신 필요'
    case 'QUEUED':
      return '대기중'
    case 'UPDATING':
      return '최신화 중'
    case 'PARTIAL':
      return '일부 완료'
    case 'FAILED':
      return '실패'
    default:
      return '갱신 필요'
  }
}

function formatDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatProductPrice(product: AiPlaceDiagnosisResponse['target']['bookingProducts'][number]) {
  if (product.price !== null) {
    return `${product.price.toLocaleString()}원`
  }

  if (product.minPrice !== null || product.maxPrice !== null) {
    return `${product.minPrice?.toLocaleString() ?? '?'}-${product.maxPrice?.toLocaleString() ?? '?'}원`
  }

  return '가격 미등록'
}

function toSourceStatusLabel(status: AiPlaceDiagnosisResponse['target']['dataSources'][number]['status']) {
  if (status === 'collected') {
    return '수집 완료'
  }

  if (status === 'partial') {
    return '부분 수집'
  }

  if (status === 'missing') {
    return '미등록'
  }

  return '수집 실패'
}

function getSourceStatusClassName(status: AiPlaceDiagnosisResponse['target']['dataSources'][number]['status']) {
  const baseClassName = 'rounded-md border px-2 py-1 text-[11px] font-black'

  if (status === 'collected') {
    return `${baseClassName} border-cyan-200/25 bg-cyan-300/10 text-cyan-100`
  }

  if (status === 'partial') {
    return `${baseClassName} border-amber-200/25 bg-amber-300/10 text-amber-100`
  }

  if (status === 'missing') {
    return `${baseClassName} border-slate-200/15 bg-white/[0.04] text-slate-300`
  }

  return `${baseClassName} border-rose-200/25 bg-rose-300/10 text-rose-100`
}
