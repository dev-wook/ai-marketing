'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  RecentSearchList,
  ToolLoadingPanel,
} from '@/features/platform/components/tool-ui'
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

const loadingSteps = [
  '키워드 기준 플레이스 신호를 수집하고 있습니다.',
  '소개글과 예약상품 상세 데이터를 자동 보강하고 있습니다.',
  'AIVA 진단 기준에 맞춰 정보 구조를 평가하고 있습니다.',
  'AI 관점의 점수와 개선 피드백을 작성하고 있습니다.',
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
  const [errorMessage, setErrorMessage] = useState('')
  const [errorRetryNotice, setErrorRetryNotice] = useState('')
  const [errorLog, setErrorLog] = useState('')
  const resultRef = useRef<HTMLDivElement | null>(null)

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
  }, [])

  useEffect(() => {
    if (isLoading || !result) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [isLoading, result])

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
        <div className="grid gap-4">
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

        </div>

        <form onSubmit={handlePlaceSearch} className="grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={placeSearchQuery}
              onChange={(event) => {
                setPlaceSearchQuery(event.target.value)
                setSelectedPlace(null)
                setResult(null)
              }}
              placeholder="예: 라솝뷰티"
              disabled={isSearching || isLoading}
              className="min-h-13 w-full rounded-md border border-white/10 bg-[#090d18] px-4 text-base font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!canSearch}
              className="inline-flex min-h-13 items-center justify-center gap-2 rounded-md bg-white px-6 text-sm font-black text-[#070a12] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isSearching ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#070a12]/20 border-t-[#070a12]" />
                  검색중...
                </>
              ) : (
                '플레이스 검색'
              )}
            </button>
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
            <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-200/75">
              Search Results
            </p>
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

        <form
          className="grid gap-3 rounded-md border border-white/10 bg-white/[0.035] p-3 md:grid-cols-[1fr_auto]"
          onSubmit={handleSubmit}
        >
          <label className="grid gap-2 md:block">
            <span className="sr-only">분석 키워드</span>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="예: 노원 속눈썹펌"
              disabled={isSearching || isLoading}
              className="min-h-13 w-full rounded-md border border-white/10 bg-[#090d18] px-4 text-base font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          <button
            type="submit"
            disabled={!canSubmit}
            className="min-h-13 rounded-md bg-white px-6 text-sm font-black text-[#070a12] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
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

      {result ? (
        <div ref={resultRef} className="scroll-mt-28">
          <DiagnosisResult result={result} />
        </div>
      ) : null}

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
          <Metric label="이미지" value={`${result.target.metrics.imageCount.toLocaleString()}개`} />
          <Metric label="예약상품" value={`${result.target.bookingProducts.length.toLocaleString()}개`} />
        </div>
      </div>

      <ClinicalReportPanel result={result} />

      <AeoGeoExpressionGuide result={result} />

      <ImprovementRoadmap result={result} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ScoreBreakdownPanel result={result} />
        <DiagnosisEvidencePanel result={result} />
      </div>

      {result.target.bookingProducts.length ? (
        <Panel title="예약상품 수집 요약">
          <BookingProductInsightSummary products={result.target.bookingProducts} />
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

function ClinicalReportPanel({ result }: { result: AiPlaceDiagnosisResponse }) {
  const report = result.clinicalReport

  return (
    <Panel title="AEO/GEO 플레이스 개선 리포트">
      <div className="grid gap-5">
        <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-md border border-cyan-300/20 bg-cyan-300/[0.07] p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100/80">
              종합 평가
            </p>
            <p className="mt-2 break-keep text-base font-black leading-7 text-white">
              {report.verdict}
            </p>
            <p className="mt-3 break-keep text-sm font-semibold leading-6 text-slate-300">
              {report.scoreInterpretation}
            </p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
              평가 기준
            </p>
            <p className="mt-2 break-keep text-sm font-semibold leading-6 text-slate-300">
              {report.diagnosisPrinciple}
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ClinicalSignalList title="잘하고 있는 점" items={report.strongSignals} tone="good" />
          <ClinicalSignalList title="부족한 점" items={report.weakSignals} tone="bad" />
        </div>

        <div className="grid gap-3">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100/80">
            100점 접근 개선 우선순위
          </p>
          {report.treatmentPlan.map((item, index) => (
            <div key={`${item.area}-${index}`} className="rounded-md border border-white/10 bg-white/[0.035] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-cyan-200/25 bg-cyan-300/12 px-2 py-1 text-[11px] font-black text-cyan-100">
                  P{item.priority}
                </span>
                <p className="text-sm font-black text-white">{item.area}</p>
              </div>
              <div className="mt-3 grid gap-2 text-sm font-semibold leading-6 text-slate-300">
                <p className="break-keep">
                  <span className="font-black text-fuchsia-100">문제: </span>
                  {item.problem}
                </p>
                <p className="break-keep">
                  <span className="font-black text-cyan-100">판단 근거: </span>
                  {item.evidence}
                </p>
                <p className="break-keep">
                  <span className="font-black text-cyan-100">개선 방향: </span>
                  {item.direction}
                </p>
                <p className="break-keep">
                  <span className="font-black text-cyan-100">기대 효과: </span>
                  {item.expectedImpact}
                </p>
              </div>
              <p className="mt-3 break-keep rounded-md border border-white/10 bg-[#080d18] p-3 text-sm font-semibold leading-6 text-white">
                {item.sampleCopy}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <CopyPrescription title="소개글 개선 문구" text={report.copyPrescriptions.introduction} />
          <CopyPrescription title="예약상품 개선 문구" text={report.copyPrescriptions.bookingProduct} />
        </div>
      </div>
    </Panel>
  )
}

function ClinicalSignalList({
  items,
  title,
  tone,
}: {
  items: AiPlaceDiagnosisResponse['clinicalReport']['strongSignals']
  title: string
  tone: 'good' | 'bad'
}) {
  const titleClassName = tone === 'good' ? 'text-cyan-100/80' : 'text-fuchsia-100/80'

  return (
    <div className="grid gap-3">
      <p className={`text-xs font-black uppercase tracking-[0.14em] ${titleClassName}`}>
        {title}
      </p>
      {items.map((item, index) => (
        <div key={`${item.area}-${index}`} className="rounded-md border border-white/10 bg-white/[0.035] p-4">
          <p className="text-sm font-black text-white">{item.area}</p>
          <p className="mt-2 break-keep text-sm font-semibold leading-6 text-slate-300">
            {item.finding}
          </p>
          <p className="mt-2 break-keep text-xs font-semibold leading-5 text-slate-400">
            근거: {item.evidence}
          </p>
          <p className="mt-1 break-keep text-xs font-semibold leading-5 text-slate-400">
            영향: {item.impact}
          </p>
        </div>
      ))}
    </div>
  )
}

function CopyPrescription({ text, title }: { text: string; title: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
      <p className="text-sm font-black text-white">{title}</p>
      <p className="mt-3 break-keep text-sm font-semibold leading-6 text-slate-300">{text}</p>
    </div>
  )
}

function AeoGeoExpressionGuide({ result }: { result: AiPlaceDiagnosisResponse }) {
  const guides = createAeoGeoExpressionGuides(result)

  return (
    <Panel title="AEO/GEO 표현 가이드">
      <div className="grid gap-4">
        <div className="rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
          <p className="break-keep text-sm font-black leading-6 text-cyan-50">
            AI가 매장을 이해하려면 “지역 + 서비스 + 대상 + 결과 + 조건”이 한 문장 안에서
            연결되어야 합니다.
          </p>
          <p className="mt-2 break-keep text-xs font-semibold leading-5 text-slate-300">
            막연한 수식어보다 실제 고객이 검색하는 표현, 예약 전 확인할 정보, 선택 이유를
            분리해 쓰는 쪽이 AEO/GEO 관점에서 해석 가능성이 높습니다.
          </p>
        </div>

        <div className="grid gap-3">
          {guides.map((guide) => (
            <div key={guide.area} className="rounded-md border border-white/10 bg-white/[0.035] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-black text-white">{guide.area}</p>
                <span className="rounded-md border border-cyan-300/20 bg-cyan-300/[0.08] px-2 py-1 text-[11px] font-black text-cyan-100">
                  {guide.goal}
                </span>
              </div>
              <p className="mt-3 break-keep text-xs font-bold leading-5 text-slate-400">
                근거: {guide.evidence}
              </p>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <ExpressionExample
                  label="권장 표현"
                  text={guide.goodExample}
                  tone="good"
                  reason={guide.whyGood}
                />
                <ExpressionExample
                  label="피해야 할 표현"
                  text={guide.badExample}
                  tone="bad"
                  reason={guide.whyBad}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}

function ExpressionExample({
  label,
  reason,
  text,
  tone,
}: {
  label: string
  reason: string
  text: string
  tone: 'good' | 'bad'
}) {
  const toneClassName =
    tone === 'good'
      ? 'border-cyan-300/20 bg-cyan-300/[0.055] text-cyan-50'
      : 'border-fuchsia-300/20 bg-fuchsia-300/[0.055] text-fuchsia-50'

  return (
    <div className={`rounded-md border p-4 ${toneClassName}`}>
      <p className="text-xs font-black uppercase tracking-[0.14em] opacity-80">{label}</p>
      <p className="mt-3 break-keep text-sm font-black leading-6 text-white">{text}</p>
      <p className="mt-3 break-keep text-xs font-semibold leading-5 text-slate-300">
        {reason}
      </p>
    </div>
  )
}

function ImprovementRoadmap({ result }: { result: AiPlaceDiagnosisResponse }) {
  const report = result.clinicalReport

  return (
    <Panel title="개선 실행 순서">
      <div className="grid gap-4">
        {report.treatmentPlan.map((item, index) => (
          <div key={`${item.area}-${index}`} className="rounded-md border border-white/10 bg-white/[0.035] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-cyan-200/25 bg-cyan-300/12 px-2 py-1 text-[11px] font-black text-cyan-100">
                Step {index + 1}
              </span>
              <span className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-[11px] font-black text-slate-300">
                P{item.priority}
              </span>
              <p className="text-sm font-black text-white">{item.area}</p>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="grid gap-2">
                <ReasonBlock label="왜 안 좋은가" text={item.problem} tone="bad" />
                <ReasonBlock label="판단 근거" text={item.evidence} tone="neutral" />
              </div>
              <div className="grid gap-2">
                <ReasonBlock label="어떻게 고칠까" text={item.direction} tone="good" />
                <ReasonBlock label="왜 좋아지는가" text={item.expectedImpact} tone="good" />
              </div>
            </div>
            <div className="mt-3 rounded-md border border-cyan-300/18 bg-[#07111f] p-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100/75">
                바로 쓸 문구
              </p>
              <p className="mt-2 break-keep text-sm font-semibold leading-6 text-white">
                {item.sampleCopy}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function ReasonBlock({
  label,
  text,
  tone,
}: {
  label: string
  text: string
  tone: 'good' | 'bad' | 'neutral'
}) {
  const labelClassName =
    tone === 'good' ? 'text-cyan-100' : tone === 'bad' ? 'text-fuchsia-100' : 'text-slate-300'

  return (
    <div className="rounded-md border border-white/10 bg-[#080d18]/75 p-3">
      <p className={`text-xs font-black uppercase tracking-[0.12em] ${labelClassName}`}>{label}</p>
      <p className="mt-2 break-keep text-sm font-semibold leading-6 text-slate-300">{text}</p>
    </div>
  )
}

function ScoreBreakdownPanel({ result }: { result: AiPlaceDiagnosisResponse }) {
  return (
    <Panel title="항목별 점수와 이유">
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
  )
}

function DiagnosisEvidencePanel({ result }: { result: AiPlaceDiagnosisResponse }) {
  return (
    <Panel title="진단 근거 데이터">
      <div className="grid gap-4">
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

        <details className="rounded-md border border-white/10 bg-white/[0.03]">
          <summary className="cursor-pointer px-4 py-3 text-sm font-black text-cyan-100">
            자동 수집 현황 보기
          </summary>
          <div className="grid gap-3 border-t border-white/10 p-4">
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
        </details>
      </div>
    </Panel>
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
      className={`grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-md border p-3 text-left transition ${
        selected
          ? 'border-cyan-200/70 bg-cyan-300/14 shadow-[0_0_0_3px_rgba(103,232,249,0.10)]'
          : 'border-white/10 bg-white/[0.035] hover:border-cyan-200/35 hover:bg-cyan-300/8'
      }`}
      aria-pressed={selected}
    >
      <div className="h-16 w-16 overflow-hidden rounded-md border border-white/10 bg-[#090d18]">
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

      <span className="grid min-w-0 content-center gap-1">
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

function BookingProductInsightSummary({
  products,
}: {
  products: AiPlaceDiagnosisResponse['target']['bookingProducts']
}) {
  const summary = summarizeBookingProductSignals(products)

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SignalMetric label="예약상품" value={`${summary.productCount}개`} />
        <SignalMetric label="시술 메뉴" value={`${summary.treatmentMenuCount}개`} />
        <SignalMetric label="가격 확인" value={`${summary.pricedItemCount}개`} />
        <SignalMetric label="설명 등록" value={`${summary.describedItemCount}개`} />
      </div>

      <div className="grid gap-3 rounded-md border border-cyan-300/18 bg-cyan-300/[0.06] p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          <p className="text-sm font-black text-cyan-50">예약상품은 진단 점수 계산에 반영됩니다.</p>
          <p className="mt-2 break-keep text-xs font-semibold leading-5 text-slate-300">
            상품명, 설명, 가격, 소요시간, 예약금/취소 안내, 시술 메뉴 구조를 요약해 서비스 정보와 전환 신뢰도 평가에 사용합니다.
          </p>
        </div>
        <span className="w-fit rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-black text-slate-200">
          필수 안내 {summary.policyNoticeCount}개
        </span>
      </div>

      <details className="rounded-md border border-white/10 bg-white/[0.03]">
        <summary className="cursor-pointer px-4 py-3 text-sm font-black text-cyan-100">
          수집된 예약상품 상세 보기
        </summary>
        <div className="grid gap-3 border-t border-white/10 p-4">
          {products.map((product) => (
            <div key={product.id} className="rounded-md border border-white/10 bg-[#080f1d]/75 p-4">
              <p className="text-sm font-black text-white">{product.name}</p>
              <p className="mt-3 break-keep text-sm font-semibold leading-6 text-slate-300">
                {product.description || '상품 설명 없음'}
              </p>
              <TreatmentMenuPreview product={product} />
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

function SignalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
      <p className="text-xs font-black text-cyan-100/70">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  )
}

function summarizeBookingProductSignals(
  products: AiPlaceDiagnosisResponse['target']['bookingProducts'],
) {
  const treatmentMenus = products.flatMap((product) =>
    product.treatmentMenuCategories
      .filter((category) => category.categoryTypeCode !== 'REQUIRED')
      .flatMap((category) => category.menus),
  )
  const policyNoticeCount = products.reduce(
    (count, product) =>
      count +
      product.precautions.length +
      product.treatmentMenuCategories.filter(
        (category) => category.categoryTypeCode === 'REQUIRED',
      ).length,
    0,
  )
  const pricedItemCount =
    products.filter(
      (product) =>
        product.price !== null || product.minPrice !== null || product.maxPrice !== null,
    ).length +
    treatmentMenus.filter((menu) => menu.price !== null || menu.normalPrice !== null).length
  const describedItemCount =
    products.filter((product) => product.description.trim().length > 0).length +
    treatmentMenus.filter((menu) => menu.description.trim().length > 0).length

  return {
    productCount: products.length,
    treatmentMenuCount: treatmentMenus.length,
    pricedItemCount,
    describedItemCount,
    policyNoticeCount,
  }
}

function TreatmentMenuPreview({
  product,
}: {
  product: AiPlaceDiagnosisResponse['target']['bookingProducts'][number]
}) {
  const categories = (product.treatmentMenuCategories ?? [])
    .filter((category) => category.categoryTypeCode !== 'REQUIRED' && category.menus.length > 0)
    .slice(0, 3)

  if (!categories.length) {
    return null
  }

  return (
    <div className="mt-4 grid gap-3 border-t border-white/10 pt-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100/75">
        수집된 시술 메뉴
      </p>
      {categories.map((category) => (
        <div key={category.id} className="grid gap-2">
          <p className="text-sm font-black text-cyan-50">{category.name}</p>
          <div className="grid gap-2 md:grid-cols-2">
            {category.menus.slice(0, 4).map((menu) => (
              <div key={menu.id} className="rounded-md border border-white/8 bg-black/15 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="break-keep text-sm font-black leading-5 text-white">{menu.name}</p>
                  {formatTreatmentMenuPrice(menu) ? (
                    <span className="shrink-0 text-xs font-black text-cyan-100">
                      {formatTreatmentMenuPrice(menu)}
                    </span>
                  ) : null}
                </div>
                {menu.description ? (
                  <p className="mt-2 break-keep text-xs font-semibold leading-5 text-slate-400">
                    {menu.description}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function formatTreatmentMenuPrice(
  menu: AiPlaceDiagnosisResponse['target']['bookingProducts'][number]['treatmentMenuCategories'][number]['menus'][number],
) {
  if (menu.price !== null) {
    return `${menu.price.toLocaleString()}원`
  }

  if (menu.normalPrice !== null) {
    return `${menu.normalPrice.toLocaleString()}원`
  }

  return ''
}

function createAeoGeoExpressionGuides(result: AiPlaceDiagnosisResponse) {
  const target = result.target
  const keyword = result.keyword
  const region = extractRegionKeyword(keyword, target.address)
  const service = extractServiceKeyword(keyword, target.category)
  const productSample = getRepresentativeProductName(result)
  const locationHint = createLocationHint(target.address)

  return [
    {
      area: '소개글 첫 문장',
      goal: '지역·서비스·대상 연결',
      evidence: target.profile.introduction
        ? `현재 소개글 ${target.profile.introduction.length.toLocaleString()}자 수집`
        : '소개글 수집값이 없어 AI가 대표 서비스와 추천 대상을 직접 판단하기 어렵습니다.',
      goodExample:
        result.clinicalReport.copyPrescriptions.introduction ||
        `${target.name}은 ${region}에서 ${service}을 찾는 고객에게 상담, 시술 과정, 유지 관리까지 안내하는 ${target.category} 매장입니다.`,
      badExample: `${target.name}은 꼼꼼하고 예쁘게 시술하는 뷰티샵입니다.`,
      whyGood:
        '지역명, 서비스명, 고객 의도, 매장 성격이 한 문장에 들어가 AI가 어떤 검색 질문에 답으로 연결할지 판단하기 쉽습니다.',
      whyBad:
        '예쁘다, 꼼꼼하다 같은 표현만 있으면 어떤 지역과 어떤 서비스에 강한 매장인지 구분하기 어렵습니다.',
    },
    {
      area: '예약상품명',
      goal: '검색 의도와 상품 구조 연결',
      evidence: target.bookingProducts.length
        ? `예약상품 ${target.bookingProducts.length.toLocaleString()}개, 대표 상품 "${productSample}" 확인`
        : '예약상품 수집값이 없어 서비스별 선택 기준을 판단하기 어렵습니다.',
      goodExample: `${region} ${service} | ${productSample} 상담 포함`,
      badExample: '기본 관리 / 프리미엄 관리 / 이벤트 상품',
      whyGood:
        '상품명에 지역, 서비스, 시술 유형이 들어가면 AI와 고객 모두 상품이 어떤 검색 의도를 해결하는지 바로 이해합니다.',
      whyBad:
        '내부 운영용 상품명만 있으면 실제 고객이 찾는 서비스명과 연결되지 않아 진단상 서비스 정보 완성도가 낮아집니다.',
    },
    {
      area: '예약상품 설명',
      goal: '대상·결과·시간·주의사항 명시',
      evidence: createBookingDescriptionEvidence(result),
      goodExample:
        result.clinicalReport.copyPrescriptions.bookingProduct ||
        `${service}이 처음인 고객에게 추천합니다. 상담 후 눈매와 모질에 맞춰 디자인하고, 예상 소요시간과 유지 관리 방법을 예약 전 안내합니다.`,
      badExample: '고객님께 잘 어울리게 예쁘게 해드립니다.',
      whyGood:
        '추천 대상, 결과 특징, 소요시간, 예약 전 확인사항이 들어가면 AI가 고객 질문에 답할 수 있는 구체 정보로 인식합니다.',
      whyBad:
        '추상적인 장점만 쓰면 가격, 시간, 대상, 결과 차이를 비교할 근거가 없어 경쟁 매장 대비 약하게 평가됩니다.',
    },
    {
      area: '오시는 길·지역 엔티티',
      goal: '위치 신뢰도 강화',
      evidence: target.profile.locationGuide
        ? '오시는 길 정보가 수집되어 지역 엔티티 근거로 사용할 수 있습니다.'
        : '오시는 길 수집값이 없어 역명, 출구, 건물, 층수 같은 방문 근거가 부족합니다.',
      goodExample: `${locationHint} 기준으로 ${target.name} 위치, 건물명, 층수, 주차 가능 여부를 함께 안내합니다.`,
      badExample: '자세한 위치는 지도 참고 부탁드립니다.',
      whyGood:
        '역명, 출구, 건물, 층수, 주차 정보는 로컬 검색과 AI 답변에서 매장을 실제 장소로 식별하는 데 도움이 됩니다.',
      whyBad:
        '지도 참고만 쓰면 지역·방문 맥락이 텍스트 데이터로 남지 않아 AI가 위치 편의성을 설명하기 어렵습니다.',
    },
  ]
}

function extractRegionKeyword(keyword: string, address: string) {
  const keywordRegion = keyword
    .split(/\s+/)
    .find((part) => /(동|구|역|로|길)$/.test(part) && part.length >= 2)

  if (keywordRegion) {
    return keywordRegion
  }

  const addressRegion = address.split(/\s+/).find((part) => /(동|구|역)$/.test(part))

  return addressRegion || '지역 고객'
}

function extractServiceKeyword(keyword: string, category: string) {
  const serviceTerms = keyword
    .split(/\s+/)
    .filter((part) => /속눈썹|펌|연장|왁싱|눈썹|브로우|네일|피부|뷰티/.test(part))

  if (serviceTerms.length) {
    return serviceTerms.join(' ')
  }

  return category || '대표 서비스'
}

function getRepresentativeProductName(result: AiPlaceDiagnosisResponse) {
  const product = result.target.bookingProducts.find((item) => item.name.trim())

  if (product) {
    return product.name
  }

  return `${extractServiceKeyword(result.keyword, result.target.category)} 상품`
}

function createBookingDescriptionEvidence(result: AiPlaceDiagnosisResponse) {
  const products = result.target.bookingProducts
  const treatmentMenus = products.flatMap((product) =>
    product.treatmentMenuCategories.flatMap((category) => category.menus),
  )
  const describedCount =
    products.filter((product) => product.description.trim()).length +
    treatmentMenus.filter((menu) => menu.description.trim()).length

  if (!products.length) {
    return '예약상품 상세 수집값이 없어 상품 설명의 구체성을 평가하기 어렵습니다.'
  }

  return `예약상품/시술 메뉴 ${products.length + treatmentMenus.length}개 중 설명이 있는 항목 ${describedCount}개 확인`
}

function createLocationHint(address: string) {
  const parts = address.split(/\s+/).filter(Boolean)

  return parts.slice(0, 3).join(' ') || '매장 주소'
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

function formatNullableCount(value: number | null) {
  return typeof value === 'number' ? `${value.toLocaleString()}개` : '미수집'
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

  try {
    return new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date)
  } catch {
    return date.toLocaleTimeString('ko-KR')
  }
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
