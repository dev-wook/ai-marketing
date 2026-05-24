'use client'

import { useEffect, useRef, useState } from 'react'
import { BlogPostingTool } from '@/features/blog-posting/components/blog-posting-tool'
import { KeywordTool } from '@/features/keyword-analysis/components/keyword-tool'
import { BrandHeader } from './brand-header'
import { HomeView } from './home-view'
import { MenuButton } from './menu-button'

type ViewKey = 'home' | 'keyword' | 'blog'

const refreshViewStorageKey = 'aiva-refresh-view'
const pullRefreshThreshold = 84
const pullRefreshMaxDistance = 118
const mobileHeaderHeight = 72
const viewTitles: Record<Exclude<ViewKey, 'home'>, string> = {
  keyword: '키워드 분석',
  blog: '블로그 원고 작성',
}

export function MarketingWorkspace() {
  const [view, setView] = useState<ViewKey>('home')
  const [blogInitialKeyword, setBlogInitialKeyword] = useState('')
  const [blogInitialKeywordKey, setBlogInitialKeywordKey] = useState(0)
  const [blogAutoAnalyzeKey, setBlogAutoAnalyzeKey] = useState(0)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
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

  useEffect(() => {
    const savedView = window.sessionStorage.getItem(refreshViewStorageKey)

    if (savedView === 'keyword' || savedView === 'blog') {
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

  return (
    <main className="min-h-screen bg-[#070a12] text-white">
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
      <div className="min-h-screen bg-[radial-gradient(circle_at_28%_20%,rgba(0,200,255,0.22),transparent_32%),radial-gradient(circle_at_76%_28%,rgba(184,54,255,0.24),transparent_34%),linear-gradient(135deg,#080b14_0%,#0b1020_48%,#090713_100%)]">
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-0 md:px-8 md:py-5">
          <header
            className={`sticky top-0 z-50 -mx-5 min-h-[72px] items-center border-b border-white/10 bg-[#070a12]/86 px-5 py-3 shadow-[0_14px_34px_rgba(0,0,0,0.18)] backdrop-blur-xl md:relative md:top-auto md:z-20 md:mx-0 md:min-h-0 md:border-b-0 md:bg-transparent md:px-0 md:py-0 md:shadow-none md:backdrop-blur-0 ${
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
                  <MenuButton
                    active={view === 'blog'}
                    eyebrow="Live"
                    label="AI 블로그 원고 작성"
                    onClick={() => openView('blog')}
                  />
                  <MenuButton eyebrow="Soon" label="AI 모델 이미지 생성" disabled />
                </nav>
              ) : null}
            </div>
          </header>

          <section
            className="min-w-0 flex-1 py-6 transition-transform duration-150 ease-out lg:py-8 md:translate-y-0"
            style={{
              transform: `translateY(${activePullDistance}px)`,
            }}
          >
            {view === 'home' ? (
              <HomeView
                onOpenBlogPosting={() => openView('blog')}
                onOpenKeyword={() => openView('keyword')}
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
          </section>
        </div>
      </div>
    </main>
  )
}
