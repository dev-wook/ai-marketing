'use client'

import { useEffect, useRef, useState } from 'react'
import { AiPlaceCompetitorComparisonTool } from '@/features/ai-place-diagnosis/components/ai-place-competitor-comparison-tool'
import { AiDiagnosisDataManager } from '@/features/ai-place-diagnosis/components/ai-diagnosis-data-manager'
import { AiPlaceDiagnosisTool } from '@/features/ai-place-diagnosis/components/ai-place-diagnosis-tool'
import { BlogPostingTool } from '@/features/blog-posting/components/blog-posting-tool'
import type { AuthUser } from '@/features/auth/types'
import { KeywordTool } from '@/features/keyword-analysis/components/keyword-tool'
import { PlaceRankingTool } from '@/features/place-ranking/components/place-ranking-tool'
import type { PlaceRankingBatchKeyword } from '@/features/place-ranking/types'
import { PlaceTrackingDashboard } from '@/features/place-tracking/components/place-tracking-dashboard'
import { BrandHeader } from './brand-header'
import { HomeView } from './home-view'
import { MenuButton } from './menu-button'
import { useBodyScrollLock } from './use-body-scroll-lock'

type ViewKey = 'home' | 'keyword' | 'blog' | 'place' | 'diagnosis' | 'competitor' | 'tracking'
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
    statusReason?: string | null
  }>
}

const backgroundWorkNotificationReadStorageKey = 'aiva-background-work-notification-read-ids'
const terminalWorkNotificationRetentionMs = 24 * 60 * 60 * 1000
const viewTitles: Record<Exclude<ViewKey, 'home'>, string> = {
  keyword: '키워드 분석',
  blog: '블로그 원고 작성',
  place: '플레이스 순위 조회',
  diagnosis: 'AI 플레이스 진단',
  competitor: 'AI 플레이스 경쟁사 비교',
  tracking: '플레이스 관리',
}

export function MarketingWorkspace() {
  const [view, setView] = useState<ViewKey>('home')
  const [blogInitialKeyword, setBlogInitialKeyword] = useState('')
  const [blogInitialKeywordKey, setBlogInitialKeywordKey] = useState(0)
  const [blogAutoAnalyzeKey, setBlogAutoAnalyzeKey] = useState(0)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [isSessionChecking, setIsSessionChecking] = useState(true)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isWorkStatusOpen, setIsWorkStatusOpen] = useState(false)
  const [isAiDiagnosisDataManagerOpen, setIsAiDiagnosisDataManagerOpen] = useState(false)
  const [aiDiagnosisDataStatus, setAiDiagnosisDataStatus] =
    useState<AiDiagnosisDataRefreshStatus | null>(null)
  const [placeRankingBatchKeywords, setPlaceRankingBatchKeywords] = useState<PlaceRankingBatchKeyword[]>([])
  const [readBackgroundWorkNotificationIds, setReadBackgroundWorkNotificationIds] = useState<string[]>([])
  const [isAiDiagnosisDataStatusLoading, setIsAiDiagnosisDataStatusLoading] = useState(false)
  const hasLoadedWorkStatusRef = useRef(false)
  const isWorkStatusPollingRef = useRef(false)
  const aiDiagnosisStatusSnapshotRef = useRef('')
  const placeRankingBatchSnapshotRef = useRef('')

  useEffect(() => {
    try {
      const rawValue = window.localStorage.getItem(backgroundWorkNotificationReadStorageKey)
      const parsedValue = rawValue ? JSON.parse(rawValue) : []

      if (Array.isArray(parsedValue)) {
        setReadBackgroundWorkNotificationIds(parsedValue.filter((item): item is string => typeof item === 'string'))
      }
    } catch {
      setReadBackgroundWorkNotificationIds([])
    }
  }, [])

  const openView = (nextView: ViewKey) => {
    setView(nextView)
    setIsMenuOpen(false)
  }

  const openBlogDraftWithKeyword = (keyword: string) => {
    setBlogInitialKeyword(keyword)
    setBlogInitialKeywordKey((current) => current + 1)
    setBlogAutoAnalyzeKey((current) => current + 1)
    openView('blog')
    window.scrollTo({ top: 0 })
  }

  const openPlaceTrackingManager = () => {
    openView('tracking')
    window.scrollTo({ top: 0 })
  }

  useEffect(() => {
    let isMounted = true

    const checkSession = async () => {
      try {
        const response = await fetch('/api/auth/session', {
          cache: 'no-store',
        })
        const data = await response.json().catch(() => null) as {
          authenticated?: boolean
          user?: AuthUser | null
        } | null

        if (!isMounted) {
          return
        }

        if (!response.ok || !data?.authenticated || !data.user) {
          window.location.replace('/login')
          return
        }

        setAuthUser(data.user)
      } catch {
        if (isMounted) {
          window.location.replace('/login')
        }
      } finally {
        if (isMounted) {
          setIsSessionChecking(false)
        }
      }
    }

    checkSession()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!authUser) {
      return
    }

    let isMounted = true

    const loadStatus = async ({ showLoading = false }: { showLoading?: boolean } = {}) => {
      if (isWorkStatusPollingRef.current) {
        return
      }

      isWorkStatusPollingRef.current = true
      const shouldShowLoading = showLoading && !hasLoadedWorkStatusRef.current

      if (shouldShowLoading) {
        setIsAiDiagnosisDataStatusLoading(true)
      }

      try {
        const [aiDiagnosisResponse, placeRankingResponse] = await Promise.all([
          fetch('/api/ai-place-diagnosis/benchmark/status', {
            cache: 'no-store',
          }),
          fetch('/api/place-ranking/batch-keywords', {
            cache: 'no-store',
          }),
        ])
        const aiDiagnosisData = await aiDiagnosisResponse.json().catch(() => null) as
          | AiDiagnosisDataRefreshStatus
          | null
        const placeRankingData = await placeRankingResponse.json().catch(() => null) as
          | { keywords?: PlaceRankingBatchKeyword[] }
          | null

        if (isMounted && aiDiagnosisResponse.ok && aiDiagnosisData) {
          const nextSnapshot = JSON.stringify(aiDiagnosisData)

          if (aiDiagnosisStatusSnapshotRef.current !== nextSnapshot) {
            aiDiagnosisStatusSnapshotRef.current = nextSnapshot
            setAiDiagnosisDataStatus(aiDiagnosisData)
          }
        }

        if (isMounted && placeRankingResponse.ok && Array.isArray(placeRankingData?.keywords)) {
          const nextSnapshot = JSON.stringify(placeRankingData.keywords)

          if (placeRankingBatchSnapshotRef.current !== nextSnapshot) {
            placeRankingBatchSnapshotRef.current = nextSnapshot
            setPlaceRankingBatchKeywords(placeRankingData.keywords)
          }
        }
      } finally {
        hasLoadedWorkStatusRef.current = true
        isWorkStatusPollingRef.current = false

        if (isMounted) {
          setIsAiDiagnosisDataStatusLoading(false)
        }
      }
    }

    loadStatus({ showLoading: true })
    const intervalId = window.setInterval(() => {
      loadStatus()
    }, isWorkStatusOpen ? 2000 : 10000)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
    }
  }, [authUser, isWorkStatusOpen])

  const handleLogout = async () => {
    setIsLoggingOut(true)

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      })
    } finally {
      window.location.replace('/login')
    }
  }

  useBodyScrollLock(isWorkStatusOpen || isMenuOpen || isAiDiagnosisDataManagerOpen)

  const isHomeView = view === 'home'
  const backgroundWorkJobs = createBackgroundWorkJobCards({
    aiDiagnosisStatus: aiDiagnosisDataStatus,
    placeRankingKeywords: placeRankingBatchKeywords,
  })
  const hasRunningBackgroundWork = hasRunningBackgroundWorkJob({
    aiDiagnosisStatus: aiDiagnosisDataStatus,
    placeRankingKeywords: placeRankingBatchKeywords,
  })
  const unreadBackgroundWorkCount = countUnreadBackgroundWorkJobs({
    jobs: backgroundWorkJobs,
    readIds: readBackgroundWorkNotificationIds,
  })
  const markBackgroundWorkNotificationsAsRead = () => {
    const nextReadIds = mergeReadBackgroundWorkNotificationIds({
      jobs: backgroundWorkJobs,
      readIds: readBackgroundWorkNotificationIds,
    })

    setReadBackgroundWorkNotificationIds(nextReadIds)

    try {
      window.localStorage.setItem(backgroundWorkNotificationReadStorageKey, JSON.stringify(nextReadIds))
    } catch {
      // Ignore storage failures. The next poll will still show the current state.
    }
  }
  const backgroundWorkNotificationSignature = backgroundWorkJobs
    .map((job) => job.notificationId)
    .join('|')

  useEffect(() => {
    if (!isWorkStatusOpen || unreadBackgroundWorkCount === 0) {
      return
    }

    markBackgroundWorkNotificationsAsRead()
  }, [backgroundWorkNotificationSignature, isWorkStatusOpen, unreadBackgroundWorkCount])

  if (isSessionChecking) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#070a12] text-white">
        <div className="grid gap-4 text-center">
          <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-cyan-100/30 border-t-cyan-100" />
          <p className="text-sm font-black tracking-[0.14em] text-cyan-100/80">
            AIVA 확인 중
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#070a12] text-white">
      <div className="min-h-screen bg-[linear-gradient(135deg,#07111d_0%,#0b1020_52%,#120a1e_100%)]">
        <div className="mx-auto flex min-h-screen w-full max-w-7xl min-w-0 flex-col px-5 py-0 md:px-8 md:py-5">
          <header
            className={`fixed inset-x-0 top-0 z-50 min-h-[72px] items-center border-b border-white/10 bg-[#070a12]/92 px-5 py-3 shadow-[0_14px_34px_rgba(0,0,0,0.2)] backdrop-blur-xl md:relative md:inset-auto md:z-20 md:min-h-0 md:border-b-0 md:bg-transparent md:px-0 md:py-0 md:shadow-none md:backdrop-blur-0 ${
              isHomeView
                ? 'flex justify-between'
                : 'grid grid-cols-[44px_minmax(0,1fr)_140px] gap-3'
            }`}
          >
            {isHomeView ? (
              <BrandHeader onClick={() => openView('home')} />
            ) : (
              <button
                type="button"
                onClick={() => openView('home')}
                aria-label="메인으로 돌아가기"
                className="grid h-11 w-11 place-items-center rounded-md border border-white/10 bg-white/[0.045] text-slate-100 transition hover:border-cyan-300/45 hover:bg-cyan-300/10 focus:outline-none focus:ring-4 focus:ring-cyan-300/15"
              >
                <span
                  aria-hidden="true"
                  className="block h-3 w-3 rotate-45 border-b-2 border-l-2 border-current"
                />
              </button>
            )}

            {!isHomeView ? (
              <div className="min-w-0 self-center text-center">
                <p className="truncate text-base font-black tracking-[-0.01em] text-white md:text-lg">
                  {viewTitles[view]}
                </p>
              </div>
            ) : null}

            <div className="relative flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAiDiagnosisDataManagerOpen(true)}
                aria-label="스케줄링 관리 열기"
                className="relative grid h-11 w-11 place-items-center rounded-md border border-white/10 bg-white/[0.05] text-slate-100 transition hover:border-cyan-300/50 hover:bg-cyan-300/10 hover:text-cyan-50 focus:outline-none focus:ring-4 focus:ring-cyan-300/15"
              >
                <span className="relative block h-6 w-6" aria-hidden="true">
                  <span className="absolute left-1/2 top-0 h-1.5 w-0.5 -translate-x-1/2 rounded-full bg-current" />
                  <span className="absolute left-1/2 top-0.5 h-1.5 w-1.5 -translate-x-1/2 rounded-full border border-current bg-[#070a12]" />
                  <span className="absolute inset-x-0 bottom-0 h-[18px] rounded-md border-2 border-current" />
                  <span className="absolute left-[4px] top-[12px] h-1.5 w-1.5 rounded-full bg-current" />
                  <span className="absolute right-[4px] top-[12px] h-1.5 w-1.5 rounded-full bg-current" />
                  <span className="absolute left-1/2 bottom-[5px] h-0.5 w-3 -translate-x-1/2 rounded-full bg-current" />
                  <span className="absolute -left-1 top-3.5 h-2.5 w-1 rounded-l-full border border-r-0 border-current" />
                  <span className="absolute -right-1 top-3.5 h-2.5 w-1 rounded-r-full border border-l-0 border-current" />
                </span>
                {hasRunningBackgroundWork ? (
                  <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-60" />
                    <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-amber-300" />
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsWorkStatusOpen((current) => {
                    const nextOpen = !current

                    if (nextOpen) {
                      markBackgroundWorkNotificationsAsRead()
                    }

                    return nextOpen
                  })
                }}
                aria-label="작업 알림 열기"
                aria-expanded={isWorkStatusOpen}
                className={`relative grid h-11 w-11 place-items-center rounded-md border transition focus:outline-none focus:ring-4 focus:ring-cyan-300/15 ${
                  hasRunningBackgroundWork
                      ? 'border-cyan-300/45 bg-cyan-300/12 text-cyan-50 hover:bg-cyan-300/18'
                      : 'border-white/10 bg-white/[0.05] text-slate-100 hover:border-cyan-300/50 hover:bg-white/[0.08]'
                }`}
              >
                <span className="relative block h-6 w-6" aria-hidden="true">
                  <span className="absolute left-1/2 top-1 h-4 w-3.5 -translate-x-1/2 rounded-t-full border-2 border-current" />
                  <span className="absolute bottom-1 left-1/2 h-1.5 w-4.5 -translate-x-1/2 rounded-b-full border-b-2 border-l-2 border-r-2 border-current" />
                  <span className="absolute bottom-[-1px] left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-current" />
                </span>
                {unreadBackgroundWorkCount > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full border border-[#070a12] bg-red-500 px-1.5 text-[10px] font-black leading-none text-white shadow-[0_1px_5px_rgba(239,68,68,0.36)]">
                    {formatNotificationBadgeCount(unreadBackgroundWorkCount)}
                  </span>
                ) : hasRunningBackgroundWork ? (
                  <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-60" />
                    <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-cyan-300" />
                  </span>
                ) : null}
              </button>
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
            </div>
          </header>

          <WorkStatusPanel
            jobs={backgroundWorkJobs}
            isLoading={isAiDiagnosisDataStatusLoading}
            isOpen={isWorkStatusOpen}
            onCancelJob={async (jobId) => {
              await fetch('/api/ai-place-diagnosis/harness/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId }),
              })
              const response = await fetch('/api/ai-place-diagnosis/benchmark/status', {
                cache: 'no-store',
              })
              const data = await response.json().catch(() => null) as
                | AiDiagnosisDataRefreshStatus
                | null

              if (response.ok && data) {
                setAiDiagnosisDataStatus(data)
              }
            }}
            readNotificationIds={readBackgroundWorkNotificationIds}
            onClose={() => {
              setIsWorkStatusOpen(false)
            }}
          />

          <AiDiagnosisDataManager
            isOpen={isAiDiagnosisDataManagerOpen}
            onClose={() => setIsAiDiagnosisDataManagerOpen(false)}
          />

          <SideMenu
            activeView={view}
            isLoggingOut={isLoggingOut}
            isOpen={isMenuOpen}
            onClose={() => setIsMenuOpen(false)}
            onLogout={handleLogout}
            onOpenBlogPosting={() => openView('blog')}
            onOpenKeyword={() => openView('keyword')}
            onOpenPlaceCompetitor={() => openView('competitor')}
            onOpenPlaceDiagnosis={() => openView('diagnosis')}
            onOpenPlaceRanking={() => openView('place')}
            onOpenPlaceTracking={openPlaceTrackingManager}
            user={authUser}
          />

          <section
            className="min-w-0 flex-1 pt-[96px] pb-6 lg:py-8 md:pt-6"
          >
            {view === 'home' ? (
              <HomeView
                onOpenBlogPosting={() => openView('blog')}
                onOpenPlaceCompetitor={() => openView('competitor')}
                onOpenPlaceDiagnosis={() => openView('diagnosis')}
                onOpenKeyword={() => openView('keyword')}
                onOpenPlaceRanking={() => openView('place')}
                onOpenPlaceTracking={openPlaceTrackingManager}
              />
            ) : null}
            {view === 'keyword' ? (
              <KeywordTool onStartBlogDraft={openBlogDraftWithKeyword} />
            ) : null}
            {view === 'blog' ? (
              <BlogPostingTool
                autoAnalyzeKey={blogAutoAnalyzeKey}
                initialKeyword={blogInitialKeyword}
                initialKeywordKey={blogInitialKeywordKey}
                onAutoAnalyzeConsumed={() => setBlogAutoAnalyzeKey(0)}
              />
            ) : null}
            {view === 'place' ? <PlaceRankingTool /> : null}
            {view === 'diagnosis' ? <AiPlaceDiagnosisTool /> : null}
            {view === 'competitor' ? <AiPlaceCompetitorComparisonTool /> : null}
            {view === 'tracking' ? <PlaceTrackingDashboard mode="manager" /> : null}
          </section>
        </div>
      </div>
    </main>
  )
}

function WorkStatusPanel({
  jobs,
  isLoading,
  isOpen,
  onCancelJob,
  onClose,
  readNotificationIds,
}: {
  jobs: BackgroundWorkJobCardModel[]
  isLoading: boolean
  isOpen: boolean
  onCancelJob: (jobId: string) => Promise<void>
  onClose: () => void
  readNotificationIds: string[]
}) {
  const hasJobs = jobs.length > 0
  const readNotificationIdSet = new Set(readNotificationIds)

  return (
    <div
      className={`fixed inset-0 z-[75] overflow-hidden overscroll-none transition-opacity duration-200 ${
        isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      }`}
      aria-hidden={!isOpen}
    >
      <button
        type="button"
        aria-label="작업 알림 닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/45"
      />
      <aside
        className={`absolute right-0 top-0 flex h-[100dvh] w-[min(92vw,420px)] transform-gpu flex-col overflow-hidden overscroll-contain border-l border-cyan-300/18 bg-[#080b14]/98 shadow-[-28px_0_80px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-5">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/75">
              Work Status
            </p>
            <h2 className="mt-2 text-xl font-black text-white">작업 알림</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-400">
              백그라운드로 실행되는 수집, 기록, 진단 작업의 진행 상태를 확인합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-xl font-black text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-300/10"
            aria-label="작업 알림 닫기"
          >
            ×
          </button>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 [-webkit-overflow-scrolling:touch]"
          data-aiva-scroll-lock-allow="true"
        >
          {isLoading && !hasJobs ? (
            <div className="rounded-md border border-cyan-300/15 bg-cyan-300/[0.06] p-4">
              <span className="block h-2 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full w-1/3 animate-[aiva-loading_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-300 via-blue-300 to-fuchsia-400" />
              </span>
              <p className="mt-3 text-sm font-black text-cyan-100">작업 상태 확인 중</p>
            </div>
          ) : null}

          {hasJobs ? (
            <div className="grid gap-3">
              {jobs.map((job) => (
                <BackgroundWorkJobCard
                  key={job.notificationId}
                  isUnread={!readNotificationIdSet.has(job.notificationId)}
                  job={job}
                  onCancelJob={onCancelJob}
                />
              ))}
            </div>
          ) : !isLoading ? (
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-black text-slate-200">표시할 작업이 없습니다.</p>
              <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
                백그라운드 작업이 시작되면 진행 상태와 완료 결과가 여기에 표시됩니다.
              </p>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  )
}

type BackgroundWorkStep = {
  label: string
  state: 'done' | 'active' | 'pending' | 'failed'
}

type BackgroundWorkJobCardModel = {
  id: string
  notificationId: string
  title: string
  subtitle: string
  message: string
  keyword: string
  status: 'FRESH' | 'NEEDS_REFRESH' | 'QUEUED' | 'UPDATING' | 'PARTIAL' | 'FAILED'
  label: string
  tone: 'cyan' | 'emerald' | 'amber' | 'rose' | 'slate'
  progress: number
  progressText: string
  steps: BackgroundWorkStep[]
  startedAt: string | null
  updatedAt: string | null
  errorMessage: string | null
  statusReason: string | null
  canCancel: boolean
  isTerminal: boolean
}

function BackgroundWorkJobCard({
  isUnread,
  job,
  onCancelJob,
}: {
  isUnread: boolean
  job: BackgroundWorkJobCardModel
  onCancelJob: (jobId: string) => Promise<void>
}) {
  const [isCancelling, setIsCancelling] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const eventTime = job.updatedAt ?? job.startedAt
  const iconText = job.status === 'FAILED' ? '!' : job.status === 'UPDATING' ? '●' : job.status === 'QUEUED' ? '…' : '✓'

  return (
    <article className={`border-b border-white/10 px-1 py-4 last:border-b-0 ${isUnread ? 'bg-cyan-300/[0.025]' : ''}`}>
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3">
        <span
          className={[
            'grid h-11 w-11 shrink-0 place-items-center rounded-md border text-sm font-black',
            job.tone === 'rose'
              ? 'border-rose-300/25 bg-rose-400/14 text-rose-100'
              : job.tone === 'amber'
                ? 'border-amber-300/25 bg-amber-300/14 text-amber-100'
                : job.tone === 'emerald'
                  ? 'border-emerald-300/25 bg-emerald-300/14 text-emerald-100'
                  : job.tone === 'cyan'
                    ? 'border-cyan-300/25 bg-cyan-300/14 text-cyan-100'
                    : 'border-white/10 bg-white/[0.06] text-slate-200',
          ].join(' ')}
          aria-hidden="true"
        >
          {iconText}
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="min-w-0 truncate text-sm font-black text-white">{job.title}</h3>
            {isUnread ? (
              <span className="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-black text-white">
                새 알림
              </span>
            ) : null}
            <span
              className={[
                'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black',
                job.tone === 'rose'
                  ? 'border-rose-300/25 bg-rose-400/12 text-rose-100'
                  : job.tone === 'amber'
                    ? 'border-amber-300/25 bg-amber-300/12 text-amber-100'
                    : job.tone === 'emerald'
                      ? 'border-emerald-300/25 bg-emerald-300/12 text-emerald-100'
                      : job.tone === 'cyan'
                        ? 'border-cyan-300/25 bg-cyan-300/12 text-cyan-100'
                        : 'border-white/10 bg-white/[0.06] text-slate-200',
              ].join(' ')}
            >
              {job.label}
            </span>
          </div>
          <p className="mt-1 truncate text-xs font-bold text-cyan-100/75">{job.subtitle}</p>
          <p className="mt-2 break-keep text-sm font-bold leading-6 text-slate-300">{job.message}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {eventTime ? formatRelativeTime(eventTime) : '방금 전'} · {isUnread ? '안읽음' : '읽음'}
          </p>

          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            className="mt-3 text-xs font-black text-cyan-100 transition hover:text-white"
            aria-expanded={isExpanded}
          >
            {isExpanded ? '상세 접기' : '상세보기'}
          </button>

          {isExpanded ? (
            <div className="mt-3 rounded-md border border-white/10 bg-white/[0.035] p-3">
              <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-400">
                <span>{job.progressText}</span>
                <span className="text-slate-200">{Math.round(job.progress)}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${
                    job.tone === 'rose'
                      ? 'bg-rose-400'
                      : job.tone === 'amber'
                        ? 'bg-amber-300'
                        : job.tone === 'emerald'
                          ? 'bg-emerald-300'
                          : 'bg-gradient-to-r from-cyan-300 via-blue-300 to-fuchsia-400'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }}
                />
              </div>

              <ol className="mt-3 grid gap-2">
                {job.steps.map((step) => (
                  <li key={step.label} className="flex items-center gap-2 text-xs font-bold">
                    <span
                      className={[
                        'grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px]',
                        step.state === 'done'
                          ? 'border-emerald-300/35 bg-emerald-300/14 text-emerald-100'
                          : step.state === 'active'
                            ? 'border-cyan-300/45 bg-cyan-300/14 text-cyan-100'
                            : step.state === 'failed'
                              ? 'border-rose-300/35 bg-rose-400/14 text-rose-100'
                              : 'border-white/10 bg-white/[0.04] text-slate-500',
                      ].join(' ')}
                    >
                      {step.state === 'done' ? '✓' : step.state === 'active' ? '●' : step.state === 'failed' ? '!' : ''}
                    </span>
                    <span
                      className={
                        step.state === 'pending'
                          ? 'text-slate-500'
                          : step.state === 'failed'
                            ? 'text-rose-100'
                            : 'text-slate-200'
                      }
                    >
                      {step.label}
                    </span>
                  </li>
                ))}
              </ol>

              {job.errorMessage ? (
                <p className="mt-3 rounded-md border border-rose-300/20 bg-rose-400/[0.08] px-3 py-2 text-xs font-bold leading-5 text-rose-100">
                  {job.errorMessage}
                </p>
              ) : null}
              {!job.errorMessage && job.statusReason ? (
                <p className="mt-3 rounded-md border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-2 text-xs font-bold leading-5 text-cyan-100/85">
                  {job.statusReason}
                </p>
              ) : null}

              <div className="mt-3 grid gap-1 text-[11px] font-bold text-slate-500">
                <p>시작: {job.startedAt ? formatDateTime(job.startedAt) : '확인 중'}</p>
                <p>최근 갱신: {job.updatedAt ? formatDateTime(job.updatedAt) : '확인 중'}</p>
              </div>

              {job.canCancel ? (
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={async () => {
                    setIsCancelling(true)
                    try {
                      await onCancelJob(job.id)
                    } finally {
                      setIsCancelling(false)
                    }
                  }}
                  className="mt-3 min-h-9 w-full rounded-md border border-rose-300/25 bg-rose-400/10 px-3 text-xs font-black text-rose-100 transition hover:bg-rose-400/18 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCancelling ? '중도취소 중...' : '중도취소'}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function createBackgroundWorkJobCards({
  aiDiagnosisStatus,
  placeRankingKeywords,
}: {
  aiDiagnosisStatus: AiDiagnosisDataRefreshStatus | null
  placeRankingKeywords: PlaceRankingBatchKeyword[]
}): BackgroundWorkJobCardModel[] {
  const now = Date.now()

  return [
    ...createAiDiagnosisRefreshJobCards(aiDiagnosisStatus, now),
    ...createPlaceRankingBatchJobCards(placeRankingKeywords, now),
  ].sort((a, b) => getWorkJobSortTime(b) - getWorkJobSortTime(a))
}

function createAiDiagnosisRefreshJobCards(
  status: AiDiagnosisDataRefreshStatus | null,
  now: number,
): BackgroundWorkJobCardModel[] {
  if (!status) {
    return []
  }

  return status.keywords
    .filter((keyword) => shouldShowAiDiagnosisRefreshJob(keyword, now))
    .map((keyword) => {
      const run = keyword.latestRun
      const isTerminal = isTerminalAiDiagnosisRefreshStatus(keyword.status)
      const totalCount = Math.max(run?.totalCount ?? keyword.latestProfile?.sampleCount ?? 50, 1)
      const evaluatedCount = Math.min(run?.evaluatedCount ?? (keyword.latestProfile ? totalCount : 0), totalCount)
      const progress =
        keyword.status === 'FRESH' || keyword.status === 'PARTIAL' || keyword.status === 'FAILED'
          ? 100
          : keyword.status === 'QUEUED'
            ? 0
          : Math.round((evaluatedCount / totalCount) * 100)
      const tone =
        keyword.status === 'FAILED'
          ? 'rose'
          : keyword.status === 'PARTIAL' || keyword.status === 'NEEDS_REFRESH'
            ? 'amber'
            : keyword.status === 'FRESH'
              ? 'emerald'
              : keyword.status === 'QUEUED'
                ? 'slate'
                : 'cyan'

      return {
        id: run?.id ?? `ai-diagnosis:${keyword.normalizedKeyword}:${keyword.latestProfile?.createdAt ?? 'none'}`,
        notificationId: createAiDiagnosisRefreshNotificationId(keyword),
        title: 'AI 진단 데이터 수집',
        subtitle: keyword.keyword,
        message: createAiDiagnosisNotificationMessage({
          evaluatedCount,
          status: keyword.status,
          totalCount,
        }),
        keyword: keyword.keyword,
        status: keyword.status,
        label: formatAiDiagnosisRefreshStatusLabel(keyword.status),
        tone,
        progress,
        progressText:
          keyword.status === 'UPDATING'
            ? `${evaluatedCount}/${totalCount}개 분석 완료`
            : keyword.status === 'QUEUED'
              ? run?.status === 'RETRY_WAIT'
                ? `재시도 대기${run.retryCount ? ` ${run.retryCount}회` : ''}`
                : '큐 대기 중'
            : keyword.status === 'NEEDS_REFRESH'
              ? '수집 필요'
              : `${totalCount}개 플레이스 기준 데이터`,
        steps: createAiDiagnosisRefreshSteps({
          progress,
          status: keyword.status,
        }),
        startedAt: run?.createdAt ?? keyword.latestProfile?.createdAt ?? null,
        updatedAt: run?.completedAt ?? keyword.latestProfile?.createdAt ?? run?.createdAt ?? null,
        errorMessage:
          keyword.status === 'QUEUED' && run?.status === 'RETRY_WAIT'
            ? run.errorMessage
            : run?.errorMessage ?? null,
        statusReason: keyword.statusReason ?? null,
        canCancel: Boolean(run?.id && (keyword.status === 'QUEUED' || keyword.status === 'UPDATING')),
        isTerminal,
      } satisfies BackgroundWorkJobCardModel
    })
}

function createPlaceRankingBatchJobCards(
  keywords: PlaceRankingBatchKeyword[],
  now: number,
): BackgroundWorkJobCardModel[] {
  return keywords
    .filter((keyword) => shouldShowPlaceRankingBatchJob(keyword, now))
    .map((keyword) => {
      const status = normalizePlaceRankingBatchStatus(keyword.lastRunStatus)
      const isRunning = status === 'UPDATING'
      const isFailed = status === 'FAILED'
      const isTerminal = status === 'FRESH' || status === 'FAILED'
      const tone = isFailed ? 'rose' : isRunning ? 'cyan' : 'emerald'

      return {
        id: createPlaceRankingBatchJobId(keyword),
        notificationId: createPlaceRankingBatchJobId(keyword),
        title: '플레이스 순위 자동 기록',
        subtitle: keyword.keyword,
        message: createPlaceRankingNotificationMessage({
          message: keyword.lastRunMessage,
          status,
        }),
        keyword: keyword.keyword,
        status,
        label: formatPlaceRankingBatchWorkStatusLabel(status),
        tone,
        progress: isRunning ? 50 : 100,
        progressText: isRunning ? '순위 데이터 기록 중' : '순위 기록 처리 완료',
        steps: createPlaceRankingBatchSteps(status),
        startedAt: keyword.lastRunAt,
        updatedAt: keyword.lastRunAt,
        errorMessage: isFailed ? keyword.lastRunMessage : null,
        statusReason: !isFailed && keyword.lastRunMessage ? keyword.lastRunMessage : null,
        canCancel: false,
        isTerminal,
      } satisfies BackgroundWorkJobCardModel
    })
}

function shouldShowAiDiagnosisRefreshJob(
  keyword: AiDiagnosisDataRefreshStatus['keywords'][number],
  now: number,
) {
  if (keyword.status === 'QUEUED' || keyword.status === 'UPDATING') {
    return Boolean(keyword.latestRun)
  }

  if (!isTerminalAiDiagnosisRefreshStatus(keyword.status)) {
    return false
  }

  const updatedAt =
    keyword.latestRun?.completedAt ?? keyword.latestRun?.createdAt ?? keyword.latestProfile?.createdAt ?? null

  if (!updatedAt) {
    return false
  }

  const updatedTime = new Date(updatedAt).getTime()

  if (Number.isNaN(updatedTime)) {
    return false
  }

  return now - updatedTime <= terminalWorkNotificationRetentionMs
}

function shouldShowPlaceRankingBatchJob(
  keyword: PlaceRankingBatchKeyword,
  now: number,
) {
  const status = normalizePlaceRankingBatchStatus(keyword.lastRunStatus)

  if (status === 'UPDATING') {
    return true
  }

  if (status !== 'FRESH' && status !== 'FAILED') {
    return false
  }

  if (!keyword.lastRunAt) {
    return false
  }

  const updatedTime = new Date(keyword.lastRunAt).getTime()

  return !Number.isNaN(updatedTime) && now - updatedTime <= terminalWorkNotificationRetentionMs
}

function createAiDiagnosisNotificationMessage({
  evaluatedCount,
  status,
  totalCount,
}: {
  evaluatedCount: number
  status: AiDiagnosisDataRefreshStatus['keywords'][number]['status']
  totalCount: number
}) {
  switch (status) {
    case 'FAILED':
      return 'AI 진단 데이터 수집 중 오류가 발생했습니다.'
    case 'PARTIAL':
      return `${totalCount}개 플레이스 중 일부 데이터만 반영되었습니다.`
    case 'FRESH':
      return `${totalCount}개 플레이스의 AI 진단 기준 데이터가 반영되었습니다.`
    case 'UPDATING':
      return `${evaluatedCount}/${totalCount}개 플레이스 데이터를 분석 중입니다.`
    case 'QUEUED':
      return '작업 순서를 기다리고 있습니다.'
    default:
      return 'AI 진단 데이터 수집 상태를 확인할 수 있습니다.'
  }
}

function createPlaceRankingNotificationMessage({
  message,
  status,
}: {
  message: string | null
  status: BackgroundWorkJobCardModel['status']
}) {
  if (status === 'FAILED') {
    return message || '플레이스 순위 자동 기록 중 오류가 발생했습니다.'
  }

  if (status === 'UPDATING') {
    return '플레이스 순위 데이터를 기록 중입니다.'
  }

  return message || '플레이스 순위 자동 기록이 완료되었습니다.'
}

function createPlaceRankingBatchJobId(keyword: PlaceRankingBatchKeyword) {
  return `place-ranking:${keyword.id}:${keyword.lastRunAt ?? 'none'}:${keyword.lastRunStatus ?? 'none'}`
}

function createAiDiagnosisRefreshNotificationId(
  keyword: AiDiagnosisDataRefreshStatus['keywords'][number],
) {
  const run = keyword.latestRun
  const updatedAt = run?.completedAt ?? keyword.latestProfile?.createdAt ?? run?.createdAt ?? 'none'

  return `ai-diagnosis:${run?.id ?? keyword.normalizedKeyword}:${keyword.status}:${updatedAt}`
}

function normalizePlaceRankingBatchStatus(
  status: string | null,
): BackgroundWorkJobCardModel['status'] {
  if (status === 'running') {
    return 'UPDATING'
  }

  if (status === 'failed') {
    return 'FAILED'
  }

  if (status === 'success') {
    return 'FRESH'
  }

  return 'NEEDS_REFRESH'
}

function formatPlaceRankingBatchWorkStatusLabel(status: BackgroundWorkJobCardModel['status']) {
  if (status === 'UPDATING') {
    return '기록 중'
  }

  if (status === 'FAILED') {
    return '실패'
  }

  if (status === 'FRESH') {
    return '완료'
  }

  return '대기'
}

function createPlaceRankingBatchSteps(status: BackgroundWorkJobCardModel['status']) {
  const failed = status === 'FAILED'
  const completed = status === 'FRESH'
  const running = status === 'UPDATING'

  return [
    {
      label: '키워드 순위 조회',
      state: failed || completed ? 'done' : running ? 'active' : 'pending',
    },
    {
      label: '순위 이력 저장',
      state: failed ? 'failed' : completed ? 'done' : running ? 'pending' : 'pending',
    },
  ] satisfies BackgroundWorkStep[]
}

function getWorkJobSortTime(job: BackgroundWorkJobCardModel) {
  const value = job.updatedAt ?? job.startedAt

  if (!value) {
    return 0
  }

  const time = new Date(value).getTime()

  return Number.isNaN(time) ? 0 : time
}

function countUnreadBackgroundWorkJobs({
  jobs,
  readIds,
}: {
  jobs: BackgroundWorkJobCardModel[]
  readIds: string[]
}) {
  const readIdSet = new Set(readIds)

  return jobs.filter((job) => !readIdSet.has(job.notificationId)).length
}

function mergeReadBackgroundWorkNotificationIds({
  jobs,
  readIds,
}: {
  jobs: BackgroundWorkJobCardModel[]
  readIds: string[]
}) {
  const activeNotificationIds = new Set(jobs.map((job) => job.notificationId))
  const retainedReadIds = readIds.filter((id) => activeNotificationIds.has(id))

  return Array.from(new Set([...retainedReadIds, ...jobs.map((job) => job.notificationId)]))
}

function formatNotificationBadgeCount(count: number) {
  return count > 99 ? '99+' : String(count)
}

function isTerminalAiDiagnosisRefreshStatus(
  status: AiDiagnosisDataRefreshStatus['keywords'][number]['status'],
) {
  return status === 'FRESH' || status === 'PARTIAL' || status === 'FAILED'
}

function createAiDiagnosisRefreshSteps({
  progress,
  status,
}: {
  progress: number
  status: AiDiagnosisDataRefreshStatus['keywords'][number]['status']
}) {
  const failed = status === 'FAILED'
  const completed = status === 'FRESH' || status === 'PARTIAL'
  const evaluating = status === 'UPDATING'
  const queued = status === 'QUEUED'

  return [
    { label: '플레이스 데이터 수집', state: failed ? 'done' : 'done' },
    { label: '수집 데이터 정규화', state: failed ? 'done' : 'done' },
    {
      label: 'AI 평가',
      state: failed ? 'failed' : completed ? 'done' : evaluating ? 'active' : queued ? 'pending' : 'pending',
    },
    {
      label: '기준 프로필 생성',
      state: failed ? 'pending' : completed ? 'done' : evaluating && progress >= 100 ? 'active' : 'pending',
    },
    {
      label: '최신 데이터 반영',
      state: failed ? 'pending' : completed ? 'done' : 'pending',
    },
  ] satisfies BackgroundWorkStep[]
}

function formatAiDiagnosisRefreshStatusLabel(
  status: AiDiagnosisDataRefreshStatus['keywords'][number]['status'],
) {
  switch (status) {
    case 'FRESH':
      return '완료'
    case 'NEEDS_REFRESH':
      return '갱신 필요'
    case 'QUEUED':
      return '대기중'
    case 'UPDATING':
      return '데이터 수집 중'
    case 'PARTIAL':
      return '일부 완료'
    case 'FAILED':
      return '실패'
    default:
      return '대기'
  }
}

function hasRunningBackgroundWorkJob({
  aiDiagnosisStatus,
  placeRankingKeywords,
}: {
  aiDiagnosisStatus: AiDiagnosisDataRefreshStatus | null
  placeRankingKeywords: PlaceRankingBatchKeyword[]
}) {
  return Boolean(aiDiagnosisStatus?.hasUpdatingKeyword)
    || placeRankingKeywords.some((keyword) => normalizePlaceRankingBatchStatus(keyword.lastRunStatus) === 'UPDATING')
}

function formatRelativeTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '방금 전'
  }

  const diffMs = Math.max(0, Date.now() - date.getTime())
  const diffMinutes = Math.floor(diffMs / 60000)

  if (diffMinutes < 1) {
    return '방금 전'
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}분 전`
  }

  const diffHours = Math.floor(diffMinutes / 60)

  if (diffHours < 24) {
    return `${diffHours}시간 전`
  }

  return formatDateTime(value)
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
      timeZone: 'Asia/Seoul',
    }).format(date)
  } catch {
    return date.toLocaleString('ko-KR')
  }
}

function SideMenu({
  activeView,
  isLoggingOut,
  isOpen,
  onClose,
  onLogout,
  onOpenBlogPosting,
  onOpenKeyword,
  onOpenPlaceCompetitor,
  onOpenPlaceDiagnosis,
  onOpenPlaceRanking,
  onOpenPlaceTracking,
  user,
}: {
  activeView: ViewKey
  isLoggingOut: boolean
  isOpen: boolean
  onClose: () => void
  onLogout: () => void
  onOpenBlogPosting: () => void
  onOpenKeyword: () => void
  onOpenPlaceCompetitor: () => void
  onOpenPlaceDiagnosis: () => void
  onOpenPlaceRanking: () => void
  onOpenPlaceTracking: () => void
  user: AuthUser | null
}) {
  return (
    <div
      className={`fixed inset-0 z-[80] overflow-hidden overscroll-none transition-opacity duration-200 ${
        isOpen ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
      aria-hidden={!isOpen}
    >
      <button
        type="button"
        aria-label="메뉴 닫기"
        onClick={onClose}
        className={`absolute inset-0 bg-black/55 transition-opacity duration-200 ease-out ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <aside
        className={`absolute right-0 top-0 flex h-[100dvh] w-[min(88vw,380px)] transform-gpu flex-col overflow-hidden overscroll-contain border-l border-cyan-300/18 bg-[#080b14]/98 shadow-[-28px_0_80px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/75">
              Account
            </p>
            <p className="mt-2 truncate text-lg font-black text-white">
              {user ? `${user.nickname}(${user.username})` : '관리자'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-xl font-black text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-300/10"
            aria-label="메뉴 닫기"
          >
            ×
          </button>
        </div>

        <nav
          className="grid min-h-0 gap-3 overflow-y-auto overscroll-contain px-5 py-5 [-webkit-overflow-scrolling:touch]"
          data-aiva-scroll-lock-allow="true"
        >
          <MenuButton
            active={activeView === 'tracking'}
            label="플레이스 관리"
            onClick={onOpenPlaceTracking}
          />
          <MenuButton
            active={activeView === 'place'}
            label="플레이스 순위 조회"
            onClick={onOpenPlaceRanking}
          />
          <MenuButton
            active={activeView === 'diagnosis'}
            label="AI 플레이스 진단"
            onClick={onOpenPlaceDiagnosis}
          />
          <MenuButton
            active={activeView === 'competitor'}
            label="AI 플레이스 경쟁사 비교"
            onClick={onOpenPlaceCompetitor}
          />
          <MenuButton
            active={activeView === 'keyword'}
            label="AI 키워드 분석"
            onClick={onOpenKeyword}
          />
          <MenuButton
            active={activeView === 'blog'}
            label="AI 블로그 원고 작성"
            onClick={onOpenBlogPosting}
          />
          <MenuButton label="AI 모델 이미지 생성" disabled />
        </nav>

        <div className="mt-auto border-t border-white/10 p-5">
          <button
            type="button"
            onClick={onLogout}
            disabled={isLoggingOut}
            className="ml-auto flex h-11 items-center justify-center rounded-md border border-rose-300/20 bg-rose-400/10 px-4 text-sm font-black text-rose-100 transition hover:border-rose-200/40 hover:bg-rose-400/18 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoggingOut ? '로그아웃 중' : '로그아웃'}
          </button>
        </div>
      </aside>
    </div>
  )
}
