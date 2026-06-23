'use client'

import { useEffect, useRef, useState } from 'react'
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

type ViewKey = 'home' | 'keyword' | 'blog' | 'place' | 'diagnosis' | 'tracking'
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

const refreshViewStorageKey = 'aiva-refresh-view'
const seenAiDiagnosisRefreshJobsStorageKey = 'aiva:seen-ai-diagnosis-refresh-job-ids'
const seenBackgroundWorkJobsStorageKey = 'aiva:seen-background-work-job-ids'
const terminalWorkNotificationRetentionMs = 24 * 60 * 60 * 1000
const pullRefreshThreshold = 84
const pullRefreshMaxDistance = 118
const mobileHeaderHeight = 72
const viewTitles: Record<Exclude<ViewKey, 'home'>, string> = {
  keyword: '키워드 분석',
  blog: '블로그 원고 작성',
  place: '플레이스 순위 조회',
  diagnosis: 'AI 플레이스 진단',
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
  const [isAiDiagnosisDataStatusLoading, setIsAiDiagnosisDataStatusLoading] = useState(false)
  const [seenBackgroundWorkJobIds, setSeenBackgroundWorkJobIds] = useState<string[]>([])
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const hasLoadedWorkStatusRef = useRef(false)
  const isWorkStatusPollingRef = useRef(false)
  const aiDiagnosisStatusSnapshotRef = useRef('')
  const placeRankingBatchSnapshotRef = useRef('')
  const touchStartYRef = useRef(0)
  const isPullingRef = useRef(false)

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
    try {
      const saved =
        window.localStorage.getItem(seenBackgroundWorkJobsStorageKey)
        ?? window.localStorage.getItem(seenAiDiagnosisRefreshJobsStorageKey)
      const parsed = saved ? JSON.parse(saved) : []

      if (Array.isArray(parsed)) {
        setSeenBackgroundWorkJobIds(
          parsed.filter((item): item is string => typeof item === 'string'),
        )
      }
    } catch {
      setSeenBackgroundWorkJobIds([])
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

  const markBackgroundWorkJobsSeen = () => {
    const terminalIds = getTerminalBackgroundWorkJobIds({
      aiDiagnosisStatus: aiDiagnosisDataStatus,
      placeRankingKeywords: placeRankingBatchKeywords,
    })

    if (terminalIds.length === 0) {
      return
    }

    setSeenBackgroundWorkJobIds((current) => {
      const next = Array.from(new Set([...current, ...terminalIds])).slice(-80)

      window.localStorage.setItem(seenBackgroundWorkJobsStorageKey, JSON.stringify(next))
      window.localStorage.setItem(seenAiDiagnosisRefreshJobsStorageKey, JSON.stringify(next))

      return next
    })
  }

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

  useEffect(() => {
    const savedView = window.sessionStorage.getItem(refreshViewStorageKey)

    if (
      savedView === 'keyword'
      || savedView === 'blog'
      || savedView === 'place'
      || savedView === 'diagnosis'
      || savedView === 'tracking'
    ) {
      setView(savedView)
      window.sessionStorage.removeItem(refreshViewStorageKey)
    }
  }, [])

  useEffect(() => {
    const isMobileViewport = () => window.matchMedia('(max-width: 767px)').matches

    const handleTouchStart = (event: TouchEvent) => {
      if (
        !isMobileViewport() ||
        isRefreshing ||
        isWorkStatusOpen ||
        isAiDiagnosisDataManagerOpen ||
        isMenuOpen ||
        window.scrollY > 0
      ) {
        isPullingRef.current = false
        return
      }

      touchStartYRef.current = event.touches[0]?.clientY ?? 0
      isPullingRef.current = true
    }

    const handleTouchMove = (event: TouchEvent) => {
      if (
        !isPullingRef.current ||
        !isMobileViewport() ||
        isRefreshing ||
        isWorkStatusOpen ||
        isAiDiagnosisDataManagerOpen ||
        isMenuOpen
      ) {
        return
      }

      const currentY = event.touches[0]?.clientY ?? 0
      const distance = currentY - touchStartYRef.current

      if (window.scrollY > 0 || distance <= 0) {
        setPullDistance(0)
        return
      }

      const dampedDistance = Math.min(distance * 0.62, pullRefreshMaxDistance)

      if (dampedDistance > 2) {
        event.preventDefault()
      }

      setPullDistance(dampedDistance)
    }

    const handleTouchEnd = () => {
      if (!isPullingRef.current) {
        return
      }

      isPullingRef.current = false

      setPullDistance((current) => {
        if (current >= pullRefreshThreshold) {
          setIsRefreshing(true)
          window.sessionStorage.setItem(refreshViewStorageKey, view)
          window.setTimeout(() => window.location.reload(), 280)

          return pullRefreshThreshold
        }

        return 0
      })
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd)
    window.addEventListener('touchcancel', handleTouchEnd)

    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [isAiDiagnosisDataManagerOpen, isMenuOpen, isRefreshing, isWorkStatusOpen, view])

  useBodyScrollLock(isWorkStatusOpen || isMenuOpen || isAiDiagnosisDataManagerOpen)

  const pullProgress = Math.min(pullDistance / pullRefreshThreshold, 1)
  const shouldShowPullRefresh = pullDistance > 0 || isRefreshing
  const pullIndicatorHeight = Math.min(pullDistance, pullRefreshMaxDistance)
  const activePullDistance = isRefreshing ? pullRefreshThreshold : pullIndicatorHeight
  const isHomeView = view === 'home'
  const hasRunningBackgroundWork = hasRunningBackgroundWorkJob({
    aiDiagnosisStatus: aiDiagnosisDataStatus,
    placeRankingKeywords: placeRankingBatchKeywords,
  })
  const hasUnreadBackgroundWorkResult = hasUnreadTerminalBackgroundWorkJob({
    aiDiagnosisStatus: aiDiagnosisDataStatus,
    placeRankingKeywords: placeRankingBatchKeywords,
    seenIds: seenBackgroundWorkJobIds,
  })

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
      <div
        aria-hidden={!shouldShowPullRefresh}
        className={`fixed inset-x-0 z-40 overflow-hidden border-b border-cyan-300/10 bg-[linear-gradient(180deg,rgba(7,10,18,0.98),rgba(10,16,32,0.88))] shadow-[0_18px_50px_rgba(0,0,0,0.28)] transition-opacity duration-150 md:hidden ${
          shouldShowPullRefresh ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{
          top: `${mobileHeaderHeight}px`,
          height: `${activePullDistance}px`,
        }}
      >
        <div className="flex h-full min-h-16 flex-col items-center justify-end gap-1 pb-3 text-cyan-100">
          <span
            className="grid h-9 w-9 place-items-center rounded-full border border-cyan-300/35 bg-cyan-300/10 shadow-[0_0_30px_rgba(34,211,238,0.18)]"
          >
            <span
              className="grid h-5 w-5 place-items-center transition-transform duration-150"
              style={{ transform: `scale(${Math.max(0.72, pullProgress)})` }}
            >
              <span className="block h-5 w-5 animate-spin rounded-full border-2 border-cyan-100/30 border-t-cyan-100" />
            </span>
          </span>
          <span className="text-[11px] font-black tracking-[0.12em] text-cyan-100/80">
            {isRefreshing
              ? '새로고침 중'
              : pullProgress >= 1
                ? '놓으면 새로고침'
                : '아래로 당겨 새로고침'}
          </span>
        </div>
      </div>
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
                  setIsWorkStatusOpen((current) => !current)
                }}
                aria-label="작업 알림 열기"
                aria-expanded={isWorkStatusOpen}
                className={`relative grid h-11 w-11 place-items-center rounded-md border transition focus:outline-none focus:ring-4 focus:ring-cyan-300/15 ${
                  hasUnreadBackgroundWorkResult
                    ? 'border-rose-300/45 bg-rose-400/14 text-rose-50 hover:bg-rose-400/22'
                    : hasRunningBackgroundWork
                      ? 'border-cyan-300/45 bg-cyan-300/12 text-cyan-50 hover:bg-cyan-300/18'
                      : 'border-white/10 bg-white/[0.05] text-slate-100 hover:border-cyan-300/50 hover:bg-white/[0.08]'
                }`}
              >
                <span className="relative block h-5 w-5" aria-hidden="true">
                  <span className="absolute left-1/2 top-1 h-3.5 w-3 -translate-x-1/2 rounded-t-full border-2 border-current" />
                  <span className="absolute bottom-0 left-1/2 h-1.5 w-3.5 -translate-x-1/2 rounded-b-full border-b-2 border-l-2 border-r-2 border-current" />
                  <span className="absolute bottom-[-2px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-current" />
                </span>
                {hasUnreadBackgroundWorkResult ? (
                  <span className="absolute -right-1 -top-1 rounded-full border border-[#070a12] bg-rose-400 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                    완료
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
            isLoading={isAiDiagnosisDataStatusLoading}
            isOpen={isWorkStatusOpen}
            onDismissCompleted={markBackgroundWorkJobsSeen}
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
            placeRankingKeywords={placeRankingBatchKeywords}
            seenIds={seenBackgroundWorkJobIds}
            status={aiDiagnosisDataStatus}
            onClose={() => {
              setIsWorkStatusOpen(false)
              markBackgroundWorkJobsSeen()
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
            onOpenPlaceDiagnosis={() => openView('diagnosis')}
            onOpenKeyword={() => openView('keyword')}
            onOpenPlaceRanking={() => openView('place')}
            onOpenPlaceTracking={openPlaceTrackingManager}
            user={authUser}
          />

          <section
            className="min-w-0 flex-1 pt-[96px] pb-6 transition-transform duration-150 ease-out lg:py-8 md:pt-6 md:translate-y-0"
            style={{
              transform: `translateY(${activePullDistance}px)`,
            }}
          >
            {view === 'home' ? (
              <HomeView
                onOpenBlogPosting={() => openView('blog')}
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
            {view === 'tracking' ? <PlaceTrackingDashboard mode="manager" /> : null}
          </section>
        </div>
      </div>
    </main>
  )
}

function WorkStatusPanel({
  isLoading,
  isOpen,
  onCancelJob,
  onClose,
  onDismissCompleted,
  placeRankingKeywords,
  seenIds,
  status,
}: {
  isLoading: boolean
  isOpen: boolean
  onCancelJob: (jobId: string) => Promise<void>
  onClose: () => void
  onDismissCompleted: () => void
  placeRankingKeywords: PlaceRankingBatchKeyword[]
  seenIds: string[]
  status: AiDiagnosisDataRefreshStatus | null
}) {
  const jobs = createBackgroundWorkJobCards({
    aiDiagnosisStatus: status,
    placeRankingKeywords,
    seenIds,
  })
  const hasJobs = jobs.length > 0
  const hasTerminalJobs = jobs.some((job) => job.isTerminal)

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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 [-webkit-overflow-scrolling:touch]">
          {hasTerminalJobs ? (
            <button
              type="button"
              onClick={onDismissCompleted}
              className="mb-3 min-h-10 w-full rounded-md border border-white/10 bg-white/[0.045] px-3 text-xs font-black text-slate-200 transition hover:border-cyan-300/35 hover:bg-cyan-300/10 hover:text-cyan-50"
            >
              완료 알림 지우기
            </button>
          ) : null}

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
                  key={job.id}
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
  title: string
  subtitle: string
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
  job,
  onCancelJob,
}: {
  job: BackgroundWorkJobCardModel
  onCancelJob: (jobId: string) => Promise<void>
}) {
  const [isCancelling, setIsCancelling] = useState(false)

  return (
    <article className="rounded-md border border-white/10 bg-white/[0.045] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-black text-white">{job.title}</h3>
          <p className="mt-1 truncate text-xs font-bold text-cyan-100/80">{job.subtitle}</p>
        </div>
        <span
          className={[
            'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black',
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

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-400">
          <span>{job.progressText}</span>
          <span className="text-slate-200">{Math.round(job.progress)}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
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
      </div>

      <ol className="mt-4 grid gap-2">
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

      <div className="mt-4 grid gap-1 text-[11px] font-bold text-slate-500">
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
          className="mt-3 min-h-10 w-full rounded-md border border-rose-300/25 bg-rose-400/10 px-3 text-xs font-black text-rose-100 transition hover:bg-rose-400/18 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isCancelling ? '중도취소 중...' : '중도취소'}
        </button>
      ) : null}
    </article>
  )
}

function createBackgroundWorkJobCards({
  aiDiagnosisStatus,
  placeRankingKeywords,
  seenIds = [],
}: {
  aiDiagnosisStatus: AiDiagnosisDataRefreshStatus | null
  placeRankingKeywords: PlaceRankingBatchKeyword[]
  seenIds?: string[]
}): BackgroundWorkJobCardModel[] {
  const seen = new Set(seenIds)
  const now = Date.now()

  return [
    ...createAiDiagnosisRefreshJobCards(aiDiagnosisStatus, seen, now),
    ...createPlaceRankingBatchJobCards(placeRankingKeywords, seen, now),
  ].sort((a, b) => getWorkJobSortTime(b) - getWorkJobSortTime(a))
}

function createAiDiagnosisRefreshJobCards(
  status: AiDiagnosisDataRefreshStatus | null,
  seenIds: Set<string>,
  now: number,
): BackgroundWorkJobCardModel[] {
  if (!status) {
    return []
  }

  return status.keywords
    .filter((keyword) => shouldShowAiDiagnosisRefreshJob(keyword, seenIds, now))
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
        title: 'AI 진단 데이터 수집',
        subtitle: keyword.keyword,
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
  seenIds: Set<string>,
  now: number,
): BackgroundWorkJobCardModel[] {
  return keywords
    .filter((keyword) => shouldShowPlaceRankingBatchJob(keyword, seenIds, now))
    .map((keyword) => {
      const status = normalizePlaceRankingBatchStatus(keyword.lastRunStatus)
      const isRunning = status === 'UPDATING'
      const isFailed = status === 'FAILED'
      const isTerminal = status === 'FRESH' || status === 'FAILED'
      const tone = isFailed ? 'rose' : isRunning ? 'cyan' : 'emerald'

      return {
        id: createPlaceRankingBatchJobId(keyword),
        title: '플레이스 순위 자동 기록',
        subtitle: keyword.keyword,
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
  seenIds: Set<string>,
  now: number,
) {
  if (keyword.status === 'QUEUED' || keyword.status === 'UPDATING') {
    return Boolean(keyword.latestRun)
  }

  if (!isTerminalAiDiagnosisRefreshStatus(keyword.status)) {
    return false
  }

  const runId = keyword.latestRun?.id

  if (!runId || seenIds.has(runId)) {
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
  seenIds: Set<string>,
  now: number,
) {
  const status = normalizePlaceRankingBatchStatus(keyword.lastRunStatus)

  if (status === 'UPDATING') {
    return true
  }

  if (status !== 'FRESH' && status !== 'FAILED') {
    return false
  }

  const jobId = createPlaceRankingBatchJobId(keyword)

  if (seenIds.has(jobId) || !keyword.lastRunAt) {
    return false
  }

  const updatedTime = new Date(keyword.lastRunAt).getTime()

  return !Number.isNaN(updatedTime) && now - updatedTime <= terminalWorkNotificationRetentionMs
}

function createPlaceRankingBatchJobId(keyword: PlaceRankingBatchKeyword) {
  return `place-ranking:${keyword.id}:${keyword.lastRunAt ?? 'none'}:${keyword.lastRunStatus ?? 'none'}`
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

function getTerminalBackgroundWorkJobIds({
  aiDiagnosisStatus,
  placeRankingKeywords,
}: {
  aiDiagnosisStatus: AiDiagnosisDataRefreshStatus | null
  placeRankingKeywords: PlaceRankingBatchKeyword[]
}) {
  const now = Date.now()
  const aiDiagnosisIds = aiDiagnosisStatus
    ? aiDiagnosisStatus.keywords
        .filter((keyword) => isTerminalAiDiagnosisRefreshStatus(keyword.status))
        .filter((keyword) => {
          const updatedAt =
            keyword.latestRun?.completedAt ?? keyword.latestRun?.createdAt ?? keyword.latestProfile?.createdAt ?? null

          if (!updatedAt) {
            return false
          }

          const updatedTime = new Date(updatedAt).getTime()

          return !Number.isNaN(updatedTime) && now - updatedTime <= terminalWorkNotificationRetentionMs
        })
        .map((keyword) => keyword.latestRun?.id)
        .filter((id): id is string => Boolean(id))
    : []
  const placeRankingIds = placeRankingKeywords
    .filter((keyword) => {
      const status = normalizePlaceRankingBatchStatus(keyword.lastRunStatus)

      return (status === 'FRESH' || status === 'FAILED') && Boolean(keyword.lastRunAt)
    })
    .filter((keyword) => {
      const updatedTime = new Date(keyword.lastRunAt ?? '').getTime()

      return !Number.isNaN(updatedTime) && now - updatedTime <= terminalWorkNotificationRetentionMs
    })
    .map(createPlaceRankingBatchJobId)

  return [...aiDiagnosisIds, ...placeRankingIds]
}

function hasUnreadTerminalBackgroundWorkJob({
  aiDiagnosisStatus,
  placeRankingKeywords,
  seenIds,
}: {
  aiDiagnosisStatus: AiDiagnosisDataRefreshStatus | null
  placeRankingKeywords: PlaceRankingBatchKeyword[]
  seenIds: string[]
}) {
  const seen = new Set(seenIds)

  return getTerminalBackgroundWorkJobIds({
    aiDiagnosisStatus,
    placeRankingKeywords,
  }).some((id) => !seen.has(id))
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value))
}

function SideMenu({
  activeView,
  isLoggingOut,
  isOpen,
  onClose,
  onLogout,
  onOpenBlogPosting,
  onOpenKeyword,
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

        <nav className="grid min-h-0 gap-3 overflow-y-auto overscroll-contain px-5 py-5 [-webkit-overflow-scrolling:touch]">
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
