'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { RecentSearchList, ToolLoadingPanel } from '@/features/platform/components/tool-ui'
import type {
  AiPlaceDiagnosisPlaceSearchItem,
  AiPlaceDiagnosisPlaceSearchResponse,
  AiPlaceDiagnosisResponse,
  AiPlaceDiagnosisScore,
} from '../types'

type ComparisonSide = 'left' | 'right'

type ComparisonErrorBody = {
  message?: string
  retryAfterMs?: number
  availableAt?: string
  debug?: unknown
}

type PlaceSelectionState = {
  query: string
  items: AiPlaceDiagnosisPlaceSearchItem[]
  selected: AiPlaceDiagnosisPlaceSearchItem | null
  isSearching: boolean
  errorMessage: string
}

const initialSelectionState: PlaceSelectionState = {
  query: '',
  items: [],
  selected: null,
  isSearching: false,
  errorMessage: '',
}

const recentComparisonPlaceSearchStorageKey = 'aiva:recent-ai-place-comparison-places'
const maxRecentPlaceSearches = 5
const placeSearchLoadingSteps = [
  '네이버 플레이스에서 후보 매장을 찾고 있습니다.',
  '대표 이미지와 주소 정보를 정리하고 있습니다.',
  '비교할 플레이스 후보를 구성하고 있습니다.',
]
const comparisonLoadingSteps = [
  '좌측 플레이스의 AI 진단 데이터를 수집하고 있습니다.',
  '우측 플레이스의 AI 진단 데이터를 수집하고 있습니다.',
  '항목별 점수와 전환 신호를 비교하고 있습니다.',
  '강점과 보완 포인트를 정리하고 있습니다.',
]

async function requestPlaceSearch(query: string) {
  const response = await fetch('/api/ai-place-diagnosis/places', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const body = (await response.json()) as AiPlaceDiagnosisPlaceSearchResponse | ComparisonErrorBody

  if (!response.ok) {
    const errorBody = body as ComparisonErrorBody
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
  keyword,
  placeId,
}: {
  keyword: string
  placeId: string
}) {
  const response = await fetch('/api/ai-place-diagnosis/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword, placeId }),
  })
  const body = (await response.json()) as AiPlaceDiagnosisResponse | ComparisonErrorBody

  if (!response.ok) {
    const errorBody = body as ComparisonErrorBody
    const error = new Error(errorBody.message ?? 'AI 플레이스 비교 진단에 실패했습니다.')

    Object.assign(error, {
      availableAt: errorBody.availableAt,
      debug: errorBody.debug,
      retryAfterMs: errorBody.retryAfterMs,
    })

    throw error
  }

  return body as AiPlaceDiagnosisResponse
}

export function AiPlaceCompetitorComparisonTool() {
  const [keyword, setKeyword] = useState('')
  const [left, setLeft] = useState<PlaceSelectionState>(initialSelectionState)
  const [right, setRight] = useState<PlaceSelectionState>(initialSelectionState)
  const [recentPlaceSearches, setRecentPlaceSearches] = useState<string[]>([])
  const [leftResult, setLeftResult] = useState<AiPlaceDiagnosisResponse | null>(null)
  const [rightResult, setRightResult] = useState<AiPlaceDiagnosisResponse | null>(null)
  const [isComparing, setIsComparing] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [searchLoadingStep, setSearchLoadingStep] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [errorRetryNotice, setErrorRetryNotice] = useState('')

  const isSearching = left.isSearching || right.isSearching
  const canCompare = useMemo(
    () => Boolean(keyword.trim() && left.selected && right.selected && !isSearching && !isComparing),
    [isComparing, isSearching, keyword, left.selected, right.selected],
  )

  useEffect(() => {
    setRecentPlaceSearches(readRecentPlaceSearches())
  }, [])

  const updateSide = (side: ComparisonSide, updater: (current: PlaceSelectionState) => PlaceSelectionState) => {
    if (side === 'left') {
      setLeft(updater)
      return
    }

    setRight(updater)
  }

  const searchPlaces = async (side: ComparisonSide, query: string) => {
    const trimmedQuery = query.trim()

    if (!trimmedQuery || isComparing) {
      return
    }

    updateSide(side, (current) => ({
      ...current,
      errorMessage: '',
      isSearching: true,
      items: [],
      selected: null,
    }))
    setErrorMessage('')
    setErrorRetryNotice('')
    setLeftResult(null)
    setRightResult(null)

    const timer = window.setInterval(() => {
      setSearchLoadingStep((current) => (current + 1) % placeSearchLoadingSteps.length)
    }, 1200)

    try {
      const response = await requestPlaceSearch(trimmedQuery)

      updateSide(side, (current) => ({
        ...current,
        errorMessage: response.items.length ? '' : '검색 결과가 없습니다. 상호명을 조금 더 정확히 입력해주세요.',
        isSearching: false,
        items: response.items,
      }))
      setRecentPlaceSearches(saveRecentPlaceSearch(trimmedQuery))
    } catch (error) {
      updateSide(side, (current) => ({
        ...current,
        errorMessage: error instanceof Error ? error.message : '플레이스 검색에 실패했습니다.',
        isSearching: false,
      }))
    } finally {
      window.clearInterval(timer)
      setSearchLoadingStep(0)
    }
  }

  const handleSearch = async (side: ComparisonSide, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await searchPlaces(side, side === 'left' ? left.query : right.query)
  }

  const applyRecentSearch = async (side: ComparisonSide, query: string) => {
    updateSide(side, (current) => ({
      ...current,
      query,
    }))
    await searchPlaces(side, query)
  }

  const removeRecentPlaceSearch = (query: string) => {
    setRecentPlaceSearches(deleteRecentPlaceSearch(query))
  }

  const handleCompare = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!canCompare || !left.selected || !right.selected) {
      return
    }

    setIsComparing(true)
    setLeftResult(null)
    setRightResult(null)
    setErrorMessage('')
    setErrorRetryNotice('')

    const timer = window.setInterval(() => {
      setLoadingStep((current) => (current + 1) % comparisonLoadingSteps.length)
    }, 1400)

    try {
      const [leftDiagnosis, rightDiagnosis] = await Promise.all([
        requestDiagnosis({ keyword, placeId: left.selected.id }),
        requestDiagnosis({ keyword, placeId: right.selected.id }),
      ])

      setLeftResult(leftDiagnosis)
      setRightResult(rightDiagnosis)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'AI 플레이스 경쟁사 비교에 실패했습니다.')
      setErrorRetryNotice(createRetryNotice(error))
    } finally {
      window.clearInterval(timer)
      setLoadingStep(0)
      setIsComparing(false)
    }
  }

  return (
    <div className="grid min-w-0 gap-6">
      <section className="grid gap-5 rounded-md border border-cyan-300/20 bg-[#0b1727]/82 p-5 shadow-[0_0_34px_rgba(34,211,238,0.08)] md:p-6">
        <div className="grid gap-2">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200/75">
            AI Place Competitor
          </p>
          <h1 className="break-keep text-2xl font-black text-white md:text-3xl">
            AI 플레이스 경쟁사 비교
          </h1>
          <p className="break-keep text-sm font-semibold leading-7 text-slate-300">
            좌우 플레이스를 검색해 선택하고 분석 키워드를 입력하면, AI 플레이스 진단 데이터를
            기준으로 점수, 리뷰, 콘텐츠, 예약·전환 신호의 우위와 약점을 비교합니다.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <PlaceSearchColumn
            disabled={isComparing || right.isSearching}
            label="좌측 플레이스"
            onApplyRecentSearch={(query) => applyRecentSearch('left', query)}
            onChangeQuery={(query) => {
              setLeft((current) => ({ ...current, query, selected: null }))
              setLeftResult(null)
              setRightResult(null)
            }}
            onRemoveRecentSearch={removeRecentPlaceSearch}
            onSearch={(event) => handleSearch('left', event)}
            onSelect={(place) => {
              setLeft((current) => ({ ...current, selected: place }))
              setLeftResult(null)
              setRightResult(null)
            }}
            recentPlaceSearches={recentPlaceSearches}
            selection={left}
          />
          <PlaceSearchColumn
            disabled={isComparing || left.isSearching}
            label="우측 플레이스"
            onApplyRecentSearch={(query) => applyRecentSearch('right', query)}
            onChangeQuery={(query) => {
              setRight((current) => ({ ...current, query, selected: null }))
              setLeftResult(null)
              setRightResult(null)
            }}
            onRemoveRecentSearch={removeRecentPlaceSearch}
            onSearch={(event) => handleSearch('right', event)}
            onSelect={(place) => {
              setRight((current) => ({ ...current, selected: place }))
              setLeftResult(null)
              setRightResult(null)
            }}
            recentPlaceSearches={recentPlaceSearches}
            selection={right}
          />
        </div>

        {isSearching ? (
          <ToolLoadingPanel
            eyebrow="Searching"
            step={searchLoadingStep}
            steps={placeSearchLoadingSteps}
            subtitle="비교할 네이버 플레이스 후보를 찾고 있습니다."
            title="플레이스를 검색하는 중입니다"
          />
        ) : null}

        <form
          className="rounded-md border border-white/10 bg-white/[0.06] p-3 shadow-[0_22px_50px_rgba(0,0,0,0.18)]"
          onSubmit={handleCompare}
        >
          <label className="grid gap-2">
            <span className="text-sm font-black text-slate-200">분석 키워드</span>
            <input
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value)
                setLeftResult(null)
                setRightResult(null)
              }}
              placeholder="예: 노원 속눈썹펌"
              disabled={isSearching || isComparing}
              className="min-h-14 rounded-md border border-white/10 bg-[#090d18] px-4 text-lg font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
          <button
            type="submit"
            disabled={!canCompare}
            className="mt-3 min-h-14 w-full rounded-md bg-white px-6 text-base font-black text-[#070a12] shadow-[0_0_26px_rgba(34,211,238,0.2)] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isComparing ? '비교 분석 중' : 'AI 경쟁사 비교 시작'}
          </button>
        </form>

        {isComparing ? (
          <ToolLoadingPanel
            eyebrow="Comparing"
            step={loadingStep}
            steps={comparisonLoadingSteps}
            subtitle="두 플레이스를 같은 키워드와 같은 기준으로 진단한 뒤 차이를 비교합니다."
            title="AI 플레이스 경쟁사 비교를 진행하는 중입니다"
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
          </div>
        ) : null}
      </section>

      {leftResult && rightResult ? (
        <ComparisonResult leftResult={leftResult} rightResult={rightResult} />
      ) : null}
    </div>
  )
}

function PlaceSearchColumn({
  disabled,
  label,
  onApplyRecentSearch,
  onChangeQuery,
  onRemoveRecentSearch,
  onSearch,
  onSelect,
  recentPlaceSearches,
  selection,
}: {
  disabled: boolean
  label: string
  onApplyRecentSearch: (query: string) => void
  onChangeQuery: (query: string) => void
  onRemoveRecentSearch: (query: string) => void
  onSearch: (event: FormEvent<HTMLFormElement>) => void
  onSelect: (place: AiPlaceDiagnosisPlaceSearchItem) => void
  recentPlaceSearches: string[]
  selection: PlaceSelectionState
}) {
  const canSearch = Boolean(selection.query.trim() && !selection.isSearching && !disabled)

  return (
    <section className="grid content-start gap-4 rounded-md border border-white/10 bg-white/[0.045] p-4">
      <form onSubmit={onSearch}>
        <label className="mb-2 block text-sm font-black text-slate-200">{label}</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={selection.query}
            onChange={(event) => onChangeQuery(event.target.value)}
            placeholder="예: 라솝뷰티"
            disabled={selection.isSearching || disabled}
            className="min-h-12 flex-1 rounded-md border border-white/10 bg-[#090d18] px-4 text-base font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!canSearch}
            className="min-h-12 rounded-md border border-cyan-300/30 bg-cyan-300/12 px-5 text-sm font-black text-cyan-50 transition hover:border-cyan-200/60 hover:bg-cyan-300/18 disabled:cursor-not-allowed disabled:opacity-45"
          >
            검색
          </button>
        </div>
      </form>

      <RecentSearchList
        disabled={selection.isSearching || disabled}
        keywords={recentPlaceSearches}
        label="최근 플레이스 검색"
        max={3}
        onRemove={onRemoveRecentSearch}
        onSelect={onApplyRecentSearch}
      />

      {selection.errorMessage ? (
        <p className="break-keep rounded-md border border-rose-300/25 bg-rose-400/10 p-3 text-xs font-black leading-5 text-rose-100">
          {selection.errorMessage}
        </p>
      ) : null}

      {selection.selected ? (
        <SelectedPlaceSummary place={selection.selected} />
      ) : null}

      {selection.items.length ? (
        <div className="grid gap-2">
          {selection.items.map((place) => (
            <PlaceSearchCard
              key={place.id}
              onSelect={() => onSelect(place)}
              place={place}
              selected={selection.selected?.id === place.id}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function ComparisonResult({
  leftResult,
  rightResult,
}: {
  leftResult: AiPlaceDiagnosisResponse
  rightResult: AiPlaceDiagnosisResponse
}) {
  const scoreDiff = leftResult.score.absolute - rightResult.score.absolute
  const overallWinner = scoreDiff > 0 ? 'left' : scoreDiff < 0 ? 'right' : 'tie'
  const categoryRows = createCategoryComparisonRows(leftResult.scores, rightResult.scores)
  const metricRows = createMetricComparisonRows(leftResult, rightResult)
  const leftWins = [...categoryRows, ...metricRows].filter((row) => row.winner === 'left').length
  const rightWins = [...categoryRows, ...metricRows].filter((row) => row.winner === 'right').length

  return (
    <section className="grid gap-5">
      <div className="rounded-md border border-white/10 bg-[#0b1220]/88 p-5 md:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ComparisonHeaderCard result={leftResult} sideLabel="좌측" />
          <ComparisonHeaderCard result={rightResult} sideLabel="우측" />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <ScoreMetric
            label="종합 우위"
            value={
              overallWinner === 'tie'
                ? '동률'
                : overallWinner === 'left'
                  ? leftResult.target.name
                  : rightResult.target.name
            }
          />
          <ScoreMetric
            label="점수 차이"
            value={scoreDiff === 0 ? '0점' : `${Math.abs(scoreDiff)}점`}
          />
          <ScoreMetric
            label="우위 항목"
            value={`${leftWins}:${rightWins}`}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="항목별 AI 점수 비교">
          <div className="grid gap-3">
            {categoryRows.map((row) => (
              <ComparisonRow key={row.label} row={row} />
            ))}
          </div>
        </Panel>

        <Panel title="운영 지표 비교">
          <div className="grid gap-3">
            {metricRows.map((row) => (
              <ComparisonRow key={row.label} row={row} />
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`${leftResult.target.name} 강세·약세`}>
          <InsightBlock
            strengths={leftResult.strengths}
            weaknesses={leftResult.topGaps}
          />
        </Panel>
        <Panel title={`${rightResult.target.name} 강세·약세`}>
          <InsightBlock
            strengths={rightResult.strengths}
            weaknesses={rightResult.topGaps}
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="좌측 플레이스 개선 우선순위">
          <NumberedList items={leftResult.priorities.slice(0, 5)} />
        </Panel>
        <Panel title="우측 플레이스 개선 우선순위">
          <NumberedList items={rightResult.priorities.slice(0, 5)} />
        </Panel>
      </div>

      <Panel title="비교 기준 안내">
        <p className="break-keep text-sm font-semibold leading-7 text-slate-300">
          이 비교는 같은 키워드로 두 플레이스를 각각 AI 플레이스 진단한 결과를 나란히 보여주는
          분석입니다. 네이버 공식 점수나 순위 상승 보장이 아니며, 실제 순위는 기준 보강과
          참고용으로만 활용됩니다.
        </p>
      </Panel>
    </section>
  )
}

function ComparisonHeaderCard({
  result,
  sideLabel,
}: {
  result: AiPlaceDiagnosisResponse
  sideLabel: string
}) {
  return (
    <article className="grid gap-4 rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100/75">
          {sideLabel}
        </p>
        <h2 className="mt-1 break-keep text-2xl font-black text-white">
          {result.target.name}
        </h2>
        <p className="mt-2 break-keep text-sm font-semibold leading-6 text-slate-300">
          참고 순위 {result.target.rank}위 · {result.target.category}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <MiniMetric label="준비도" value={`${result.score.absolute}점`} />
        <MiniMetric label="신뢰도" value={`${result.score.dataConfidence}%`} />
        <MiniMetric label="등급" value={result.grade} />
      </div>
    </article>
  )
}

type ComparisonRowModel = {
  label: string
  leftValue: string
  rightValue: string
  leftScore: number
  rightScore: number
  winner: 'left' | 'right' | 'tie'
}

function ComparisonRow({ row }: { row: ComparisonRowModel }) {
  const maxValue = Math.max(row.leftScore, row.rightScore, 1)

  return (
    <div className="grid gap-3 rounded-md border border-white/10 bg-white/[0.035] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="break-keep text-sm font-black text-white">{row.label}</p>
        <span className={getWinnerBadgeClassName(row.winner)}>
          {row.winner === 'tie' ? '비슷함' : row.winner === 'left' ? '좌측 우위' : '우측 우위'}
        </span>
      </div>
      <div className="grid gap-2">
        <BarLine label="좌측" value={row.leftValue} width={(row.leftScore / maxValue) * 100} />
        <BarLine label="우측" value={row.rightValue} width={(row.rightScore / maxValue) * 100} />
      </div>
    </div>
  )
}

function BarLine({
  label,
  value,
  width,
}: {
  label: string
  value: string
  width: number
}) {
  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem] items-center gap-3">
      <p className="text-xs font-black text-slate-400">{label}</p>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-cyan-200"
          style={{ width: `${Math.max(4, Math.min(100, width))}%` }}
        />
      </div>
      <p className="text-right text-xs font-black text-slate-200">{value}</p>
    </div>
  )
}

function InsightBlock({
  strengths,
  weaknesses,
}: {
  strengths: string[]
  weaknesses: string[]
}) {
  return (
    <div className="grid gap-4">
      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-200/80">
          강세
        </p>
        <BulletList items={strengths.slice(0, 3)} />
      </div>
      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-amber-200/80">
          보완
        </p>
        <BulletList items={weaknesses.slice(0, 3)} />
      </div>
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
      className={`grid min-h-[7.5rem] grid-cols-[4.75rem_minmax(0,1fr)] gap-3 rounded-md border p-3 text-left transition ${
        selected
          ? 'border-cyan-200/70 bg-cyan-300/14 shadow-[0_0_0_3px_rgba(103,232,249,0.10)]'
          : 'border-white/10 bg-white/[0.035] hover:border-cyan-200/35 hover:bg-cyan-300/8'
      }`}
      aria-pressed={selected}
    >
      <div className="h-20 w-full overflow-hidden rounded-md border border-white/10 bg-[#090d18]">
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

      <span className="grid min-w-0 content-start gap-1.5">
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

function SelectedPlaceSummary({ place }: { place: AiPlaceDiagnosisPlaceSearchItem }) {
  return (
    <div className="rounded-md border border-cyan-200/25 bg-cyan-300/10 p-3">
      <p className="text-xs font-black text-cyan-100/80">선택된 플레이스</p>
      <p className="mt-1 break-keep text-sm font-black text-white">
        {place.name} · {place.category || '업종 정보 없음'}
      </p>
      <p className="mt-1 break-keep text-xs font-semibold leading-5 text-slate-300">
        {place.address || '주소 정보 없음'}
      </p>
    </div>
  )
}

function ScoreMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-cyan-300/22 bg-cyan-300/10 p-4">
      <p className="break-keep text-xs font-black text-cyan-100/80">{label}</p>
      <p className="mt-2 break-keep text-2xl font-black text-white md:text-3xl">{value}</p>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
      <p className="text-[11px] font-black text-slate-400">{label}</p>
      <p className="mt-1 break-keep text-lg font-black text-white">{value}</p>
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
        <li
          key={item}
          className="break-keep rounded-md border border-white/10 bg-white/[0.035] p-3 text-sm font-semibold leading-6 text-slate-300"
        >
          {item}
        </li>
      ))}
    </ul>
  )
}

function createCategoryComparisonRows(
  leftScores: AiPlaceDiagnosisScore[],
  rightScores: AiPlaceDiagnosisScore[],
) {
  return leftScores.map((leftScore) => {
    const rightScore = rightScores.find((score) => score.key === leftScore.key)
    const rightValue = rightScore?.score ?? 0

    return {
      label: leftScore.label,
      leftScore: leftScore.score,
      rightScore: rightValue,
      leftValue: `${leftScore.score}/${leftScore.maxScore}`,
      rightValue: `${rightValue}/${rightScore?.maxScore ?? leftScore.maxScore}`,
      winner: toWinner(leftScore.score, rightValue),
    } satisfies ComparisonRowModel
  })
}

function createMetricComparisonRows(
  leftResult: AiPlaceDiagnosisResponse,
  rightResult: AiPlaceDiagnosisResponse,
) {
  const left = leftResult.target
  const right = rightResult.target

  return [
    {
      label: '참고 순위',
      leftScore: reverseRankScore(left.rank),
      rightScore: reverseRankScore(right.rank),
      leftValue: `${left.rank}위`,
      rightValue: `${right.rank}위`,
      winner: toWinner(reverseRankScore(left.rank), reverseRankScore(right.rank)),
    },
    {
      label: '방문자 리뷰',
      leftScore: left.metrics.totalReviewCount,
      rightScore: right.metrics.totalReviewCount,
      leftValue: `${left.metrics.totalReviewCount.toLocaleString()}개`,
      rightValue: `${right.metrics.totalReviewCount.toLocaleString()}개`,
      winner: toWinner(left.metrics.totalReviewCount, right.metrics.totalReviewCount),
    },
    {
      label: '블로그 리뷰',
      leftScore: left.metrics.blogCafeReviewCount,
      rightScore: right.metrics.blogCafeReviewCount,
      leftValue: `${left.metrics.blogCafeReviewCount.toLocaleString()}개`,
      rightValue: `${right.metrics.blogCafeReviewCount.toLocaleString()}개`,
      winner: toWinner(left.metrics.blogCafeReviewCount, right.metrics.blogCafeReviewCount),
    },
    {
      label: '이미지',
      leftScore: left.metrics.imageCount,
      rightScore: right.metrics.imageCount,
      leftValue: `${left.metrics.imageCount.toLocaleString()}개`,
      rightValue: `${right.metrics.imageCount.toLocaleString()}개`,
      winner: toWinner(left.metrics.imageCount, right.metrics.imageCount),
    },
    {
      label: '예약상품',
      leftScore: left.bookingProducts.length,
      rightScore: right.bookingProducts.length,
      leftValue: `${left.bookingProducts.length}개`,
      rightValue: `${right.bookingProducts.length}개`,
      winner: toWinner(left.bookingProducts.length, right.bookingProducts.length),
    },
  ] satisfies ComparisonRowModel[]
}

function reverseRankScore(rank: number) {
  return Math.max(0, 301 - rank)
}

function toWinner(leftScore: number, rightScore: number): ComparisonRowModel['winner'] {
  if (leftScore === rightScore) {
    return 'tie'
  }

  return leftScore > rightScore ? 'left' : 'right'
}

function getWinnerBadgeClassName(winner: ComparisonRowModel['winner']) {
  if (winner === 'tie') {
    return 'rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 text-[11px] font-black text-slate-300'
  }

  return 'rounded-md border border-cyan-200/25 bg-cyan-300/12 px-2 py-1 text-[11px] font-black text-cyan-100'
}

function readRecentPlaceSearches() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(recentComparisonPlaceSearchStorageKey) ?? '[]')

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

  window.localStorage.setItem(recentComparisonPlaceSearchStorageKey, JSON.stringify(nextQueries))

  return nextQueries
}

function deleteRecentPlaceSearch(query: string) {
  if (typeof window === 'undefined') {
    return []
  }

  const nextQueries = readRecentPlaceSearches().filter((recentQuery) => recentQuery !== query)

  window.localStorage.setItem(recentComparisonPlaceSearchStorageKey, JSON.stringify(nextQueries))

  return nextQueries
}

function createRetryNotice(error: unknown) {
  const retryAfterMs = (error as { retryAfterMs?: unknown }).retryAfterMs
  const availableAt = (error as { availableAt?: unknown }).availableAt

  if (typeof retryAfterMs === 'number' && retryAfterMs > 0) {
    return `Gemini API 호출이 일시적으로 제한되었습니다. 약 ${Math.ceil(retryAfterMs / 1000)}초 후 다시 이용할 수 있습니다.`
  }

  if (typeof availableAt === 'string') {
    return `Gemini API 호출량 제한으로 잠시 후 다시 이용할 수 있습니다. 가능 시각: ${availableAt}`
  }

  return ''
}
