'use client'

import { useEffect, useRef, useState } from 'react'
import { BlogPostingTool } from '@/features/blog-posting/components/blog-posting-tool'
import type { AuthUser } from '@/features/auth/types'
import { KeywordTool } from '@/features/keyword-analysis/components/keyword-tool'
import { PlaceRankingTool } from '@/features/place-ranking/components/place-ranking-tool'
import { PlaceTrackingDashboard } from '@/features/place-tracking/components/place-tracking-dashboard'
import { BrandHeader } from './brand-header'
import { HomeView } from './home-view'
import { MenuButton } from './menu-button'

type ViewKey = 'home' | 'keyword' | 'blog' | 'place' | 'tracking'

const refreshViewStorageKey = 'aiva-refresh-view'
const pullRefreshThreshold = 84
const pullRefreshMaxDistance = 118
const mobileHeaderHeight = 72
const viewTitles: Record<Exclude<ViewKey, 'home'>, string> = {
  keyword: '키워드 분석',
  blog: '블로그 원고 작성',
  place: '플레이스 순위 조회',
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
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
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
      || savedView === 'tracking'
    ) {
      setView(savedView)
      window.sessionStorage.removeItem(refreshViewStorageKey)
    }
  }, [])

  useEffect(() => {
    const isMobileViewport = () => window.matchMedia('(max-width: 767px)').matches

    const handleTouchStart = (event: TouchEvent) => {
      if (!isMobileViewport() || isRefreshing || window.scrollY > 0) {
        isPullingRef.current = false
        return
      }

      touchStartYRef.current = event.touches[0]?.clientY ?? 0
      isPullingRef.current = true
    }

    const handleTouchMove = (event: TouchEvent) => {
      if (!isPullingRef.current || !isMobileViewport() || isRefreshing) {
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
  }, [isRefreshing, view])

  const pullProgress = Math.min(pullDistance / pullRefreshThreshold, 1)
  const shouldShowPullRefresh = pullDistance > 0 || isRefreshing
  const pullIndicatorHeight = Math.min(pullDistance, pullRefreshMaxDistance)
  const activePullDistance = isRefreshing ? pullRefreshThreshold : pullIndicatorHeight
  const isHomeView = view === 'home'

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
                : 'grid grid-cols-[44px_minmax(0,1fr)_44px] gap-3'
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
            </div>
          </header>

          <SideMenu
            activeView={view}
            isLoggingOut={isLoggingOut}
            isOpen={isMenuOpen}
            onClose={() => setIsMenuOpen(false)}
            onLogout={handleLogout}
            onOpenBlogPosting={() => openView('blog')}
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
            {view === 'tracking' ? <PlaceTrackingDashboard mode="manager" /> : null}
          </section>
        </div>
      </div>
    </main>
  )
}

function SideMenu({
  activeView,
  isLoggingOut,
  isOpen,
  onClose,
  onLogout,
  onOpenBlogPosting,
  onOpenKeyword,
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
  onOpenPlaceRanking: () => void
  onOpenPlaceTracking: () => void
  user: AuthUser | null
}) {
  return (
    <div
      className={`fixed inset-0 z-[80] overflow-hidden transition-opacity duration-200 ${
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
        className={`absolute right-0 top-0 flex h-full w-[min(88vw,380px)] transform-gpu flex-col border-l border-cyan-300/18 bg-[#080b14]/98 shadow-[-28px_0_80px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
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

        <nav className="grid gap-3 overflow-y-auto px-5 py-5">
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
