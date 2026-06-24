'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ToolLoadingPanel } from '@/features/platform/components/tool-ui'
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

const comparisonLoadingSteps = [
  '플레이스 1의 AI 진단 데이터를 수집하고 있습니다.',
  '플레이스 2의 AI 진단 데이터를 수집하고 있습니다.',
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
  fallbackPlace,
  keyword,
  placeId,
}: {
  fallbackPlace: AiPlaceDiagnosisPlaceSearchItem
  keyword: string
  placeId: string
}) {
  const response = await fetch('/api/ai-place-diagnosis/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fallbackPlace, keyword, placeId }),
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
  const [leftResult, setLeftResult] = useState<AiPlaceDiagnosisResponse | null>(null)
  const [rightResult, setRightResult] = useState<AiPlaceDiagnosisResponse | null>(null)
  const [isComparing, setIsComparing] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [errorRetryNotice, setErrorRetryNotice] = useState('')
  const resultRef = useRef<HTMLDivElement | null>(null)

  const isSearching = left.isSearching || right.isSearching
  const canCompare = useMemo(
    () => Boolean(keyword.trim() && left.selected && right.selected && !isSearching && !isComparing),
    [isComparing, isSearching, keyword, left.selected, right.selected],
  )

  useEffect(() => {
    if (isComparing || !leftResult || !rightResult) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [isComparing, leftResult, rightResult])

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

    try {
      const response = await requestPlaceSearch(trimmedQuery)

      updateSide(side, (current) => ({
        ...current,
        errorMessage: response.items.length ? '' : '검색 결과가 없습니다. 상호명을 조금 더 정확히 입력해주세요.',
        isSearching: false,
        items: response.items,
      }))
    } catch (error) {
      updateSide(side, (current) => ({
        ...current,
        errorMessage: error instanceof Error ? error.message : '플레이스 검색에 실패했습니다.',
        isSearching: false,
      }))
    }
  }

  const handleSearch = async (side: ComparisonSide, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await searchPlaces(side, side === 'left' ? left.query : right.query)
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
      const leftDiagnosis = await requestDiagnosis({
        fallbackPlace: left.selected,
        keyword,
        placeId: left.selected.id,
      })
      const rightDiagnosis = await requestDiagnosis({
        fallbackPlace: right.selected,
        keyword,
        placeId: right.selected.id,
      })

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
            플레이스 1과 플레이스 2를 검색해 선택하고 분석 키워드를 입력하면, AI 플레이스 진단 데이터를
            기준으로 점수, 리뷰, 콘텐츠, 예약·전환 신호의 우위와 약점을 비교합니다.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <PlaceSearchColumn
            disabled={isComparing}
            label="플레이스 1"
            onChangeQuery={(query) => {
              setLeft((current) => ({ ...current, query, selected: null }))
              setLeftResult(null)
              setRightResult(null)
            }}
            onSearch={(event) => handleSearch('left', event)}
            onSelect={(place) => {
              setLeft((current) => ({ ...current, selected: place }))
              setLeftResult(null)
              setRightResult(null)
            }}
            selection={left}
          />
          <PlaceSearchColumn
            disabled={isComparing}
            label="플레이스 2"
            onChangeQuery={(query) => {
              setRight((current) => ({ ...current, query, selected: null }))
              setLeftResult(null)
              setRightResult(null)
            }}
            onSearch={(event) => handleSearch('right', event)}
            onSelect={(place) => {
              setRight((current) => ({ ...current, selected: place }))
              setLeftResult(null)
              setRightResult(null)
            }}
            selection={right}
          />
        </div>

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
        <div ref={resultRef} className="scroll-mt-28">
          <ComparisonResult leftResult={leftResult} rightResult={rightResult} />
        </div>
      ) : null}
    </div>
  )
}

function PlaceSearchColumn({
  disabled,
  label,
  onChangeQuery,
  onSearch,
  onSelect,
  selection,
}: {
  disabled: boolean
  label: string
  onChangeQuery: (query: string) => void
  onSearch: (event: FormEvent<HTMLFormElement>) => void
  onSelect: (place: AiPlaceDiagnosisPlaceSearchItem) => void
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
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-cyan-300/30 bg-cyan-300/12 px-5 text-sm font-black text-cyan-50 transition hover:border-cyan-200/60 hover:bg-cyan-300/18 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {selection.isSearching ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-50/20 border-t-cyan-50" />
                검색중...
              </>
            ) : (
              '검색'
            )}
          </button>
        </div>
      </form>

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
  const categoryRows = createCategoryComparisonRows(leftResult, rightResult)
  const metricRows = createMetricComparisonRows(leftResult, rightResult)
  const leftWins = [...categoryRows, ...metricRows].filter((row) => row.winner === 'left').length
  const rightWins = [...categoryRows, ...metricRows].filter((row) => row.winner === 'right').length
  const leftName = leftResult.target.name
  const rightName = rightResult.target.name
  const dataNotice = createDiagnosisDataNotice(leftResult, rightResult)

  return (
    <section className="grid gap-5">
      <div className="rounded-md border border-white/10 bg-[#0b1220]/88 p-5 md:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ComparisonHeaderCard result={leftResult} sideLabel="플레이스 1" />
          <ComparisonHeaderCard result={rightResult} sideLabel="플레이스 2" />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <ScoreMetric
            label="종합 우위"
            value={
              overallWinner === 'tie'
                ? '동률'
                : overallWinner === 'left'
                  ? leftName
                  : rightName
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

        {dataNotice ? (
          <p className="mt-4 break-keep rounded-md border border-amber-200/25 bg-amber-300/10 p-3 text-xs font-black leading-5 text-amber-100">
            {dataNotice}
          </p>
        ) : null}
      </div>

      <Panel title="항목별 AI 점수 비교">
        <div className="grid gap-3">
          {categoryRows.map((row) => (
            <ComparisonRow
              key={row.label}
              leftName={leftName}
              rightName={rightName}
              row={row}
            />
          ))}
        </div>
      </Panel>

      <Panel title="운영 지표 비교">
        <div className="grid gap-3">
          {metricRows.map((row) => (
            <ComparisonRow
              key={row.label}
              leftName={leftName}
              rightName={rightName}
              row={row}
            />
          ))}
        </div>
      </Panel>

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
        <Panel title={`${leftName} 개선 우선순위`}>
          <NumberedList items={leftResult.priorities.slice(0, 5)} />
        </Panel>
        <Panel title={`${rightName} 개선 우선순위`}>
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
          참고 순위 {formatRankLabel(result.target.rank)} · {result.target.category}
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
  leftDetail: string
  rightDetail: string
  leftScore: number
  rightScore: number
  winner: 'left' | 'right' | 'tie'
}

function ComparisonRow({
  leftName,
  rightName,
  row,
}: {
  leftName: string
  rightName: string
  row: ComparisonRowModel
}) {
  return (
    <div className="grid gap-3 rounded-md border border-white/10 bg-white/[0.035] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="break-keep text-sm font-black text-white">{row.label}</p>
        <span className={getWinnerBadgeClassName(row.winner)}>
          {row.winner === 'tie' ? '비슷함' : row.winner === 'left' ? `${leftName} 우위` : `${rightName} 우위`}
        </span>
      </div>
      <div className="grid overflow-hidden rounded-md border border-white/10 md:grid-cols-2">
        <ComparisonSideCell
          active={row.winner === 'left'}
          detail={row.leftDetail}
          name={leftName}
          value={row.leftValue}
        />
        <ComparisonSideCell
          active={row.winner === 'right'}
          detail={row.rightDetail}
          name={rightName}
          value={row.rightValue}
        />
      </div>
    </div>
  )
}

function ComparisonSideCell({
  active,
  detail,
  name,
  value,
}: {
  active: boolean
  detail: string
  name: string
  value: string
}) {
  return (
    <div
      className={`grid min-h-32 content-start gap-3 border-white/10 p-4 md:border-l md:first:border-l-0 ${
        active ? 'bg-cyan-300/10' : 'bg-white/[0.025]'
      }`}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs font-black text-slate-300">{name}</p>
        {active ? (
          <span className="shrink-0 rounded-md bg-cyan-100 px-2 py-1 text-[10px] font-black text-[#071018]">
            우위
          </span>
        ) : null}
      </div>
      <p className="break-keep text-2xl font-black text-white">{value}</p>
      <p className="break-keep text-xs font-semibold leading-5 text-slate-400">{detail}</p>
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
  leftResult: AiPlaceDiagnosisResponse,
  rightResult: AiPlaceDiagnosisResponse,
) {
  const leftScores = leftResult.scores
  const rightScores = rightResult.scores

  return leftScores.map((leftScore) => {
    const rightScore = rightScores.find((score) => score.key === leftScore.key)
    const rightValue = rightScore?.score ?? 0

    return {
      label: leftScore.label,
      leftScore: leftScore.score,
      rightScore: rightValue,
      leftValue: `${leftScore.score}/${leftScore.maxScore}`,
      rightValue: `${rightValue}/${rightScore?.maxScore ?? leftScore.maxScore}`,
      leftDetail: createCategoryScoreRationale(leftResult, leftScore),
      rightDetail: createCategoryScoreRationale(rightResult, rightScore ?? leftScore),
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
      leftValue: formatRankLabel(left.rank),
      rightValue: formatRankLabel(right.rank),
      leftDetail: createRankRationale(left.name, left.rank, right.name, right.rank),
      rightDetail: createRankRationale(right.name, right.rank, left.name, left.rank),
      winner: toWinner(reverseRankScore(left.rank), reverseRankScore(right.rank)),
    },
    {
      label: '방문자 리뷰',
      leftScore: left.metrics.totalReviewCount,
      rightScore: right.metrics.totalReviewCount,
      leftValue: `${left.metrics.totalReviewCount.toLocaleString()}개`,
      rightValue: `${right.metrics.totalReviewCount.toLocaleString()}개`,
      leftDetail: createMetricRationale({
        label: '방문자 리뷰',
        name: left.name,
        peerName: right.name,
        value: left.metrics.totalReviewCount,
        peerValue: right.metrics.totalReviewCount,
        unit: '개',
        note: '리뷰 문구가 서비스 경험을 구체적으로 설명할수록 신뢰 근거로 더 강하게 해석됩니다.',
      }),
      rightDetail: createMetricRationale({
        label: '방문자 리뷰',
        name: right.name,
        peerName: left.name,
        value: right.metrics.totalReviewCount,
        peerValue: left.metrics.totalReviewCount,
        unit: '개',
        note: '리뷰 문구가 서비스 경험을 구체적으로 설명할수록 신뢰 근거로 더 강하게 해석됩니다.',
      }),
      winner: toWinner(left.metrics.totalReviewCount, right.metrics.totalReviewCount),
    },
    {
      label: '블로그 리뷰',
      leftScore: left.metrics.blogCafeReviewCount,
      rightScore: right.metrics.blogCafeReviewCount,
      leftValue: `${left.metrics.blogCafeReviewCount.toLocaleString()}개`,
      rightValue: `${right.metrics.blogCafeReviewCount.toLocaleString()}개`,
      leftDetail: createMetricRationale({
        label: '블로그 리뷰',
        name: left.name,
        peerName: right.name,
        value: left.metrics.blogCafeReviewCount,
        peerValue: right.metrics.blogCafeReviewCount,
        unit: '개',
        note: '외부 콘텐츠 노출을 보는 보조 신호이며, 본문 품질 분석은 현재 비교 범위에 포함하지 않습니다.',
      }),
      rightDetail: createMetricRationale({
        label: '블로그 리뷰',
        name: right.name,
        peerName: left.name,
        value: right.metrics.blogCafeReviewCount,
        peerValue: left.metrics.blogCafeReviewCount,
        unit: '개',
        note: '외부 콘텐츠 노출을 보는 보조 신호이며, 본문 품질 분석은 현재 비교 범위에 포함하지 않습니다.',
      }),
      winner: toWinner(left.metrics.blogCafeReviewCount, right.metrics.blogCafeReviewCount),
    },
    {
      label: '이미지',
      leftScore: left.metrics.imageCount,
      rightScore: right.metrics.imageCount,
      leftValue: `${left.metrics.imageCount.toLocaleString()}개`,
      rightValue: `${right.metrics.imageCount.toLocaleString()}개`,
      leftDetail: createMetricRationale({
        label: '이미지',
        name: left.name,
        peerName: right.name,
        value: left.metrics.imageCount,
        peerValue: right.metrics.imageCount,
        unit: '개',
        note: '단순 개수보다 시술 결과, 공간, 상담 장면이 균형 있게 드러나는지가 중요합니다.',
      }),
      rightDetail: createMetricRationale({
        label: '이미지',
        name: right.name,
        peerName: left.name,
        value: right.metrics.imageCount,
        peerValue: left.metrics.imageCount,
        unit: '개',
        note: '단순 개수보다 시술 결과, 공간, 상담 장면이 균형 있게 드러나는지가 중요합니다.',
      }),
      winner: toWinner(left.metrics.imageCount, right.metrics.imageCount),
    },
    {
      label: '예약/시술 메뉴',
      leftScore: countServiceMenus(leftResult),
      rightScore: countServiceMenus(rightResult),
      leftValue: formatServiceMenuValue(leftResult),
      rightValue: formatServiceMenuValue(rightResult),
      leftDetail: createBookingProductRationale(leftResult, rightResult),
      rightDetail: createBookingProductRationale(rightResult, leftResult),
      winner: toWinner(countServiceMenus(leftResult), countServiceMenus(rightResult)),
    },
  ] satisfies ComparisonRowModel[]
}

function createCategoryScoreRationale(
  result: AiPlaceDiagnosisResponse,
  score: AiPlaceDiagnosisScore,
) {
  const ratio = score.maxScore > 0 ? score.score / score.maxScore : 0
  const evidence = pickCategoryEvidence(result, score.label)
  const signal = createCategorySignalSummary(result, score.key)
  const level =
    ratio >= 0.8
      ? '강하게 충족'
      : ratio >= 0.55
        ? '일부 충족'
        : '보완 필요'

  return `${result.target.name}은 ${score.label} 항목에서 ${score.maxScore}점 만점 중 ${score.score}점으로 ${level}입니다. ${score.reason} ${signal}${evidence ? ` 근거: ${evidence}` : ''}`
}

function pickCategoryEvidence(result: AiPlaceDiagnosisResponse, label: string) {
  const source = [...result.topGaps, ...result.priorities, ...result.strengths]
  const matched = source.find((item) => item.includes(label.split(' ')[0]))

  return matched ?? source[0] ?? ''
}

function createCategorySignalSummary(
  result: AiPlaceDiagnosisResponse,
  key: AiPlaceDiagnosisScore['key'],
) {
  const { metrics, profile } = result.target

  switch (key) {
    case 'intentAndService':
      return `카테고리는 ${result.target.category || '미확인'}이며 예약상품 ${result.target.bookingProducts.length}개, 시술 메뉴 ${countTreatmentMenus(result)}개가 확인됩니다.`
    case 'serviceInformation':
      return `소개글은 ${profile.introduction ? '확인됨' : '부족'}이고 예약/시술 설명은 ${countDescribedProducts(result)}개 항목에서 확인됩니다.`
    case 'localEntity':
      return `주소는 ${result.target.address || '미확인'}이며 오시는 길 정보는 ${profile.locationGuide ? '확인됨' : '부족'}입니다.`
    case 'reviewTrust':
      return `방문자 리뷰 ${metrics.totalReviewCount.toLocaleString()}개, 블로그 리뷰 ${metrics.blogCafeReviewCount.toLocaleString()}개가 확인됩니다.`
    case 'contentRichness':
      return `이미지 ${metrics.imageCount.toLocaleString()}개와 해시태그 ${metrics.hashtagCount.toLocaleString()}개를 기준으로 정보량을 봅니다.`
    case 'conversion':
      return `예약 ${metrics.hasBooking ? '가능' : '미확인'}, 톡톡 ${metrics.hasTalktalk ? '확인' : '미확인'}, 쿠폰 ${metrics.hasCoupon ? '확인' : '미확인'} 상태입니다.`
    case 'differentiation':
      return `강점 문구와 차별화 근거는 ${result.strengths.length}개, 보완 포인트는 ${result.topGaps.length}개로 정리됐습니다.`
    default:
      return ''
  }
}

function countDescribedProducts(result: AiPlaceDiagnosisResponse) {
  return (
    result.target.bookingProducts.filter((product) => product.description.trim().length > 0).length +
    result.target.bookingProducts
      .flatMap((product) => product.treatmentMenuCategories ?? [])
      .filter((category) => category.categoryTypeCode !== 'REQUIRED')
      .flatMap((category) => category.menus)
      .filter((menu) => menu.description.trim().length > 0).length
  )
}

function countTreatmentMenus(result: AiPlaceDiagnosisResponse) {
  return result.target.bookingProducts
    .flatMap((product) => product.treatmentMenuCategories ?? [])
    .filter((category) => category.categoryTypeCode !== 'REQUIRED')
    .flatMap((category) => category.menus).length
}

function countServiceMenus(result: AiPlaceDiagnosisResponse) {
  return result.target.bookingProducts.length + countTreatmentMenus(result)
}

function countPricedTreatmentMenus(result: AiPlaceDiagnosisResponse) {
  return result.target.bookingProducts
    .flatMap((product) => product.treatmentMenuCategories ?? [])
    .filter((category) => category.categoryTypeCode !== 'REQUIRED')
    .flatMap((category) => category.menus)
    .filter((menu) => menu.price !== null || menu.normalPrice !== null).length
}

function countRequiredBookingNotices(result: AiPlaceDiagnosisResponse) {
  return result.target.bookingProducts
    .flatMap((product) => product.treatmentMenuCategories ?? [])
    .filter((category) => category.categoryTypeCode === 'REQUIRED')
    .flatMap((category) => category.menus)
    .filter((menu) => menu.description.trim().length > 0).length
}

function formatServiceMenuValue(result: AiPlaceDiagnosisResponse) {
  const productCount = result.target.bookingProducts.length
  const treatmentMenuCount = countTreatmentMenus(result)

  return treatmentMenuCount
    ? `상품 ${productCount}개 · 시술 ${treatmentMenuCount}개`
    : `상품 ${productCount}개`
}

function createRankRationale(name: string, rank: number, peerName: string, peerRank: number) {
  const rankLabel = formatRankLabel(rank)
  const peerRankLabel = formatRankLabel(peerRank)

  if (rank === peerRank) {
    return `${name}은 현재 키워드에서 ${rankLabel}로 확인됐고 ${peerName}과 같은 참고 순위입니다. 순위는 점수에 직접 더하지 않고 사후 검증 기준으로만 봅니다.`
  }

  return `${name}은 현재 키워드에서 ${rankLabel}, ${peerName}은 ${peerRankLabel}입니다. 이 값은 점수 산정에 직접 반영하지 않고 AI 진단 기준이 실제 노출 흐름과 맞는지 보는 참고 신호입니다.`
}

function createMetricRationale({
  label,
  name,
  note,
  peerName,
  peerValue,
  unit,
  value,
}: {
  label: string
  name: string
  note: string
  peerName: string
  peerValue: number
  unit: string
  value: number
}) {
  const diff = value - peerValue
  const comparison =
    diff === 0
      ? `${peerName}과 동일합니다`
      : diff > 0
        ? `${peerName}보다 ${Math.abs(diff).toLocaleString()}${unit} 많습니다`
        : `${peerName}보다 ${Math.abs(diff).toLocaleString()}${unit} 적습니다`

  return `${name}의 ${label}는 ${value.toLocaleString()}${unit}로 ${comparison}. ${note}`
}

function createBookingProductRationale(
  result: AiPlaceDiagnosisResponse,
  peerResult: AiPlaceDiagnosisResponse,
) {
  const productCount = result.target.bookingProducts.length
  const describedCount = countDescribedProducts(result)
  const treatmentMenuCount = countTreatmentMenus(result)
  const pricedMenuCount = countPricedTreatmentMenus(result)
  const categoryNames = result.target.bookingProducts
    .flatMap((product) => product.treatmentMenuCategories ?? [])
    .filter((category) => category.categoryTypeCode !== 'REQUIRED')
    .map((category) => category.name)
    .filter(Boolean)
    .slice(0, 4)
  const requiredNoticeCount = countRequiredBookingNotices(result)
  const peerProductCount = peerResult.target.bookingProducts.length
  const peerServiceMenuCount = countServiceMenus(peerResult)
  const diff = countServiceMenus(result) - peerServiceMenuCount
  const comparison =
    diff === 0
      ? `${peerResult.target.name}과 같은 수준`
      : diff > 0
        ? `${peerResult.target.name}보다 ${diff}개 많음`
        : `${peerResult.target.name}보다 ${Math.abs(diff)}개 적음`

  return `${result.target.name}은 예약상품 ${productCount}개와 시술 메뉴 ${treatmentMenuCount}개가 확인되어 ${comparison}입니다. 가격이 확인된 시술은 ${pricedMenuCount}개, 설명이 있는 예약/시술 항목은 ${describedCount}개입니다.${categoryNames.length ? ` 카테고리는 ${categoryNames.join(', ')} 중심입니다.` : ''}${requiredNoticeCount ? ` 예약금/변경/취소 같은 필수 안내도 ${requiredNoticeCount}개 확인되어 전환 신뢰 신호로 봅니다.` : ''} 상품명뿐 아니라 대상, 결과 특징, 가격, 시술시간 설명까지 보강됐는지가 점수 근거가 됩니다.`
}

function createDiagnosisDataNotice(
  leftResult: AiPlaceDiagnosisResponse,
  rightResult: AiPlaceDiagnosisResponse,
) {
  const defaultProfilePlaces = [leftResult, rightResult]
    .filter((result) => result.benchmark.profile.status !== 'ACTIVE')
    .map((result) => result.target.name)

  if (!defaultProfilePlaces.length) {
    return ''
  }

  return `${defaultProfilePlaces.join(', ')}은 현재 키워드의 활성 AI 진단 기준 데이터가 부족해 기본 진단 기준과 이번 진단에서 새로 수집한 데이터를 함께 사용했습니다. 이번 결과는 이후 기준 보강 데이터로 누적됩니다.`
}

function reverseRankScore(rank: number) {
  return Math.max(0, 301 - rank)
}

function formatRankLabel(rank: number) {
  return rank > 300 ? '300위 밖' : `${rank}위`
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
