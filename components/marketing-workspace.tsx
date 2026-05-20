'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'

type ViewKey = 'home' | 'keyword'

type KeywordRecommendation = {
  rank: number
  keyword: string
  intent: string
  reason: string
  aiScore: number
  blogSignal: string
  searchSignal: string
  placeSignal: string
  finalJudgement: string
}

type KeywordResponse = {
  keyword: string
  recommendations: KeywordRecommendation[]
}

const loadingSteps = [
  '검색 의도를 분석하고 있어요',
  'AI가 중요하게 보는 주제어를 추출하고 있어요',
  '상위 콘텐츠의 반복 신호를 검토하고 있어요',
  '노출에 도움이 되는 키워드 10개를 선별하고 있어요',
]

const recentKeywordStorageKey = 'aiva:recent-keywords'
const keywordCooldownStorageKey = 'aiva:keyword-analysis-last-success-at'
const maxRecentKeywordCount = 5
const keywordCooldownSeconds = 30

export function MarketingWorkspace() {
  const [view, setView] = useState<ViewKey>('home')
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const openView = (nextView: ViewKey) => {
    setView(nextView)
    setIsMenuOpen(false)
  }

  return (
    <main className="min-h-screen bg-[#070a12] text-white">
      <div className="min-h-screen bg-[radial-gradient(circle_at_28%_20%,rgba(0,200,255,0.22),transparent_32%),radial-gradient(circle_at_76%_28%,rgba(184,54,255,0.24),transparent_34%),linear-gradient(135deg,#080b14_0%,#0b1020_48%,#090713_100%)]">
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 md:px-8">
          <header className="relative z-20 flex items-center justify-between">
            <BrandHeader onClick={() => openView('home')} />
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMenuOpen((current) => !current)}
                aria-label="메뉴 열기"
                aria-expanded={isMenuOpen}
                className="grid h-11 w-11 place-items-center rounded-md border border-white/10 bg-white/[0.05] transition hover:border-cyan-300/50 hover:bg-white/[0.08]"
              >
                <span className="grid gap-1.5">
                  <span className="block h-0.5 w-5 rounded-full bg-white" />
                  <span className="block h-0.5 w-5 rounded-full bg-white" />
                  <span className="block h-0.5 w-5 rounded-full bg-white" />
                </span>
              </button>

              {isMenuOpen ? (
                <nav className="absolute right-0 top-14 grid w-[min(82vw,340px)] gap-2 rounded-md border border-white/10 bg-[#080b14]/95 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                  <MenuButton
                    active={view === 'home'}
                    eyebrow="Home"
                    label="메인 화면"
                    onClick={() => openView('home')}
                  />
                  <MenuButton
                    active={view === 'keyword'}
                    eyebrow="Live"
                    label="AI 검색 노출 키워드 분석"
                    onClick={() => openView('keyword')}
                  />
                  <MenuButton eyebrow="Soon" label="AI 블로그 포스팅" disabled />
                  <MenuButton eyebrow="Soon" label="AI 모델 이미지 생성" disabled />
                </nav>
              ) : null}
            </div>
          </header>

          <section className="min-w-0 flex-1 py-6 lg:py-8">
            {view === 'home' ? <HomeView onOpenKeyword={() => openView('keyword')} /> : null}
            {view === 'keyword' ? <KeywordTool /> : null}
          </section>
        </div>
      </div>
    </main>
  )
}

function BrandHeader({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-md text-left transition hover:opacity-85 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/20"
      aria-label="AIVA 메인 화면으로 이동"
    >
      <AivaLogoImage className="h-12 w-12" />
      <div>
        <h1 className="text-xl font-black tracking-[0.16em]">AIVA</h1>
        <p className="text-xs font-bold text-slate-400">AI Marketing Platform</p>
      </div>
    </button>
  )
}

function MenuButton({
  active = false,
  disabled = false,
  eyebrow,
  label,
  onClick,
}: {
  active?: boolean
  disabled?: boolean
  eyebrow: string
  label: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-4 py-3 text-left transition ${
        active
          ? 'border-cyan-300/45 bg-cyan-300/10 shadow-[0_0_24px_rgba(34,211,238,0.16)]'
          : 'border-white/8 bg-white/[0.03] hover:border-white/18 hover:bg-white/[0.06]'
      } ${disabled ? 'cursor-not-allowed opacity-45 hover:border-white/8 hover:bg-white/[0.03]' : ''}`}
    >
      <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200/70">
        {eyebrow}
      </span>
      <span className="mt-1 block font-black text-white">{label}</span>
    </button>
  )
}

function HomeView({ onOpenKeyword }: { onOpenKeyword: () => void }) {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] content-center gap-8">
      <section className="max-w-7xl">
        <AivaLogoImage className="mb-7 h-24 w-24" />
        <p className="text-sm font-black uppercase tracking-[0.22em] text-cyan-200/80">
          AIVA — AI Marketing Platform
        </p>
        <h2 className="mt-4 text-4xl font-black leading-tight md:text-6xl xl:text-[4.45rem]">
          브랜드 성장을 위한 AI 마케팅 플랫폼
        </h2>
        <p className="mt-5 max-w-2xl text-base font-semibold leading-8 text-slate-300">
          AIVA는 검색 의도 분석부터 콘텐츠 제작까지 마케팅 실무에 필요한 AI 도구를
          한곳에서 제공합니다.
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <button
          type="button"
          onClick={onOpenKeyword}
          className="group rounded-md border border-cyan-300/35 bg-cyan-300/10 p-5 text-left shadow-[0_0_34px_rgba(34,211,238,0.16)] transition hover:-translate-y-0.5 hover:border-cyan-200/70 hover:bg-cyan-300/14"
        >
          <span className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
            Available
          </span>
          <h3 className="mt-3 text-2xl font-black">AI 검색 노출 키워드 분석</h3>
          <p className="mt-3 min-h-16 text-sm font-semibold leading-7 text-slate-300">
            블로그와 플레이스 노출에 반영할 핵심 키워드와 활용 포인트를 분석합니다.
          </p>
          <span className="mt-5 inline-flex rounded-md bg-white px-4 py-3 text-sm font-black text-[#090b14] transition group-hover:bg-cyan-100">
            시작하기
          </span>
        </button>

        <PlannedFeature
          title="AI 블로그 포스팅"
          description="AI 검색 노출 키워드와 검색 의도, 질문형 키워드, FAQ 흐름을 반영한 블로그 콘텐츠를 작성합니다."
        />
        <PlannedFeature
          title="AI 모델 이미지 생성"
          description="브랜드, 상품, 캠페인에 어울리는 AI 모델 이미지를 제작합니다."
        />
      </section>
    </div>
  )
}

function PlannedFeature({ title, description }: { title: string; description: string }) {
  return (
    <article className="rounded-md border border-white/10 bg-white/[0.035] p-5 text-left">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-fuchsia-200/70">
        개발예정
      </span>
      <h3 className="mt-3 text-2xl font-black text-white/85">{title}</h3>
      <p className="mt-3 min-h-16 text-sm font-semibold leading-7 text-slate-400">{description}</p>
      <span className="mt-5 inline-flex rounded-md border border-white/10 px-4 py-3 text-sm font-black text-slate-400">
        준비 중
      </span>
    </article>
  )
}

function KeywordTool() {
  const [keyword, setKeyword] = useState('')
  const [recentKeywords, setRecentKeywords] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [result, setResult] = useState<KeywordResponse | null>(null)
  const [loadingStep, setLoadingStep] = useState(0)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)

  useEffect(() => {
    setRecentKeywords(readRecentKeywords())
    setCooldownRemaining(readKeywordCooldownRemaining())
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCooldownRemaining(readKeywordCooldownRemaining())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!isLoading) {
      setLoadingStep(0)
      return
    }

    const timer = window.setInterval(() => {
      setLoadingStep((current) => (current + 1) % loadingSteps.length)
    }, 1300)

    return () => window.clearInterval(timer)
  }, [isLoading])

  const canSubmit = useMemo(
    () => keyword.trim().length > 0 && !isLoading && cooldownRemaining === 0,
    [cooldownRemaining, isLoading, keyword],
  )

  const removeRecentKeyword = (keywordToRemove: string) => {
    setRecentKeywords(deleteRecentKeyword(keywordToRemove))
  }

  const submitKeyword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextKeyword = keyword.trim()
    if (!nextKeyword) {
      setErrorMessage('분석할 키워드를 입력해주세요.')
      return
    }

    if (cooldownRemaining > 0) {
      setErrorMessage(`AI 분석은 ${cooldownRemaining}초 후 다시 이용할 수 있습니다.`)
      return
    }

    setIsLoading(true)
    setErrorMessage('')
    setResult(null)

    try {
      const response = await fetch('/api/keywords/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keyword: nextKeyword }),
      })
      const body = await response.json()

      if (!response.ok) {
        throw new Error(body.message ?? '키워드 분석에 실패했습니다.')
      }

      setResult(body as KeywordResponse)
      setRecentKeywords(saveRecentKeyword(nextKeyword))
      setCooldownRemaining(saveKeywordCooldownStart())
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '키워드 분석에 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl content-center py-6">
      <section className="text-center">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200/80">
          AI Search Keyword Analysis
        </p>
        <h2 className="mt-3 text-3xl font-black tracking-normal md:text-5xl">
          AI 검색 노출에 중요한 키워드를 분석하세요
        </h2>
        <p className="mx-auto mt-4 max-w-6xl text-base font-semibold leading-7 text-slate-300 xl:whitespace-nowrap">
          입력한 키워드를 기준으로 AI가 중요하게 판단할 만한 주제어, 검색 의도, 블로그와
          플레이스 활용 포인트를 분석합니다.
        </p>

        <form
          onSubmit={submitKeyword}
          className="mx-auto mt-8 max-w-3xl rounded-md border border-white/10 bg-white/[0.06] p-3 shadow-[0_22px_50px_rgba(0,0,0,0.24)] backdrop-blur-xl"
        >
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value)
                setErrorMessage('')
              }}
              placeholder="예: 노원 속눈썹펌"
              className="min-h-14 flex-1 rounded-md border border-white/10 bg-[#090d18] px-4 text-lg font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!canSubmit}
              className="min-h-14 rounded-md bg-white px-6 text-base font-black text-[#070a12] shadow-[0_0_26px_rgba(34,211,238,0.2)] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isLoading
                ? '분석 중'
                : cooldownRemaining > 0
                  ? `${cooldownRemaining}초 후 가능`
                  : result
                    ? '다시 분석하기'
                    : '키워드 분석하기'}
            </button>
          </div>
        </form>

        {cooldownRemaining > 0 && !isLoading ? (
          <p className="mx-auto mt-3 max-w-3xl rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] px-4 py-3 text-sm font-bold text-cyan-100">
            AI 분석이 완료되었습니다. 다음 분석은 {cooldownRemaining}초 후 다시 이용할 수 있습니다.
          </p>
        ) : null}

        {recentKeywords.length > 0 ? (
          <div className="mx-auto mt-5 grid max-w-3xl gap-3 text-left">
            <KeywordChipGroup
              label="최근 검색"
              keywords={recentKeywords}
              disabled={isLoading}
              onSelect={(nextKeyword) => {
                setKeyword(nextKeyword)
                setErrorMessage('')
              }}
              onRemove={removeRecentKeyword}
            />
          </div>
        ) : null}

        {errorMessage ? (
          <p className="mx-auto mt-5 max-w-xl rounded-md border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">
            {errorMessage}
          </p>
        ) : null}
      </section>

      {isLoading ? <KeywordLoadingPanel step={loadingStep} /> : null}
      {!isLoading && result ? <KeywordResult result={result} /> : null}
    </div>
  )
}

function KeywordChipGroup({
  disabled,
  keywords,
  label,
  onRemove,
  onSelect,
}: {
  disabled: boolean
  keywords: string[]
  label: string
  onRemove?: (keyword: string) => void
  onSelect: (keyword: string) => void
}) {
  return (
    <div className="rounded-md border border-cyan-300/20 bg-cyan-300/[0.05] px-3 py-3">
      <div className="grid gap-2">
        <span className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200/80">
          {label}
        </span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {keywords.map((item) => (
            <span
              key={`${label}-${item}`}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_36px] overflow-hidden rounded-md border border-cyan-300/25 bg-cyan-300/10 text-sm font-black text-cyan-50"
            >
              <button
                type="button"
                onClick={() => onSelect(item)}
                disabled={disabled}
                className="min-w-0 truncate px-3 py-2 text-center transition hover:bg-cyan-300/12 disabled:opacity-50"
              >
                {item}
              </button>
              <button
                type="button"
                onClick={() => onRemove?.(item)}
                disabled={disabled}
                aria-label={`${item} 최근 검색 삭제`}
                className="grid w-8 place-items-center border-l border-cyan-300/20 text-cyan-100/70 transition hover:bg-cyan-300/15 hover:text-white disabled:opacity-50"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function KeywordLoadingPanel({ step }: { step: number }) {
  return (
    <section className="mx-auto mt-9 w-full max-w-3xl rounded-md border border-white/10 bg-white/[0.07] p-5 text-left shadow-[0_22px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">
            Analyzing
          </p>
          <h3 className="mt-2 text-2xl font-black">AI 검색 노출 키워드를 분석하는 중입니다</h3>
        </div>
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-cyan-300/30 bg-cyan-300/10">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-200/30 border-t-cyan-200" />
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-full bg-white/10">
        <div className="h-3 w-2/3 animate-[keyword-progress_1.7s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-300 via-blue-500 to-fuchsia-400" />
      </div>

      <div className="mt-5 grid gap-2">
        {loadingSteps.map((label, index) => (
          <div
            key={label}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-black transition ${
              index === step ? 'bg-cyan-300/10 text-cyan-100' : 'text-slate-400'
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                index === step ? 'bg-cyan-200 shadow-[0_0_14px_rgba(103,232,249,0.8)]' : 'bg-white/20'
              }`}
            />
            {label}
          </div>
        ))}
      </div>
    </section>
  )
}

function readRecentKeywords() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(recentKeywordStorageKey) ?? '[]')

    return normalizeRecentKeywords(parsed)
  } catch {
    return []
  }
}

function saveRecentKeyword(keyword: string) {
  const nextKeywords = normalizeRecentKeywords([keyword, ...readRecentKeywords()])

  window.localStorage.setItem(recentKeywordStorageKey, JSON.stringify(nextKeywords))

  return nextKeywords
}

function deleteRecentKeyword(keyword: string) {
  const keyToRemove = keyword.trim().toLowerCase()
  const nextKeywords = readRecentKeywords().filter((item) => item.toLowerCase() !== keyToRemove)

  window.localStorage.setItem(recentKeywordStorageKey, JSON.stringify(nextKeywords))

  return nextKeywords
}

function readKeywordCooldownRemaining() {
  if (typeof window === 'undefined') {
    return 0
  }

  const lastSuccessAt = Number(window.localStorage.getItem(keywordCooldownStorageKey) ?? 0)

  if (!Number.isFinite(lastSuccessAt) || lastSuccessAt <= 0) {
    return 0
  }

  const elapsedSeconds = Math.floor((Date.now() - lastSuccessAt) / 1000)

  return Math.max(keywordCooldownSeconds - elapsedSeconds, 0)
}

function saveKeywordCooldownStart() {
  window.localStorage.setItem(keywordCooldownStorageKey, String(Date.now()))

  return keywordCooldownSeconds
}

function normalizeRecentKeywords(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()
  const keywords: string[] = []

  for (const item of value) {
    if (typeof item !== 'string') {
      continue
    }

    const keyword = item.trim()
    const key = keyword.toLowerCase()

    if (!keyword || seen.has(key)) {
      continue
    }

    seen.add(key)
    keywords.push(keyword)

    if (keywords.length >= maxRecentKeywordCount) {
      break
    }
  }

  return keywords
}

function KeywordResult({ result }: { result: KeywordResponse }) {
  return (
    <section className="mx-auto mt-9 w-full max-w-6xl rounded-md border border-white/10 bg-white/[0.07] p-5 text-left shadow-[0_22px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">Result</p>
          <h3 className="mt-2 text-2xl font-black">AI 검색 노출 키워드 분석 결과</h3>
        </div>
        <span className="w-fit rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-black text-slate-300">
          기준 키워드: {result.keyword}
        </span>
      </div>

      <div className="mt-5 grid gap-3">
        {result.recommendations.map((item) => (
          <article
            key={`${item.rank}-${item.keyword}`}
            className="rounded-md border border-white/10 bg-[#080c17]/85 p-4"
          >
            <div className="grid gap-4 lg:grid-cols-[56px_minmax(180px,0.8fr)_minmax(120px,0.45fr)_minmax(0,1fr)_150px] lg:items-start">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-gradient-to-br from-cyan-300 to-fuchsia-500 text-sm font-black text-[#070a12]">
                {item.rank}
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                  Keyword
                </p>
                <h4 className="mt-1 text-lg font-black text-white">{item.keyword}</h4>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                  Intent
                </p>
                <p className="mt-1 font-black text-cyan-100">{item.intent}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Why</p>
                <p className="mt-1 font-semibold leading-7 text-slate-300">{item.reason}</p>
              </div>
              <div className="rounded-md border border-cyan-300/20 bg-cyan-300/8 p-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-200/75">
                  AI Score
                </p>
                <div className="mt-1 flex items-end gap-1">
                  <span className="text-3xl font-black text-cyan-100">{item.aiScore}</span>
                  <span className="pb-1 text-xs font-black text-slate-500">/ 100</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-fuchsia-400"
                    style={{ width: `${item.aiScore}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SignalPanel label="Search" tone="blue" text={item.searchSignal} />
              <SignalPanel label="Blog" tone="cyan" text={item.blogSignal} />
              <SignalPanel label="Place" tone="fuchsia" text={item.placeSignal} />
              <SignalPanel label="Final" tone="white" text={item.finalJudgement} />
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function SignalPanel({
  label,
  tone,
  text,
}: {
  label: string
  tone: 'cyan' | 'blue' | 'fuchsia' | 'white'
  text: string
}) {
  const toneClass = {
    cyan: 'border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-100',
    blue: 'border-blue-300/20 bg-blue-300/[0.06] text-blue-100',
    fuchsia: 'border-fuchsia-300/20 bg-fuchsia-300/[0.06] text-fuchsia-100',
    white: 'border-white/10 bg-white/[0.045] text-white',
  }[tone]

  return (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.16em] opacity-75">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">{text}</p>
    </div>
  )
}

function AivaLogoImage({ className }: { className?: string }) {
  return (
    <img
      src="/aiva-logo.png"
      alt="AIVA logo"
      className={`${className ?? ''} rounded-md object-cover shadow-[0_0_26px_rgba(34,211,238,0.18)]`}
    />
  )
}
