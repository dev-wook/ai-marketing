'use client'

import { useEffect, useRef, useState } from 'react'
import { BlogPostingTool } from '@/features/blog-posting/components/blog-posting-tool'
import { KeywordTool } from '@/features/keyword-analysis/components/keyword-tool'
import { BrandHeader } from './brand-header'
import { HomeView } from './home-view'
import { MenuButton } from './menu-button'

type ViewKey = 'home' | 'keyword' | 'blog'

const pullRefreshThreshold = 84
const pullRefreshMaxDistance = 118

export function MarketingWorkspace() {
  const [view, setView] = useState<ViewKey>('home')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const touchStartYRef = useRef(0)
  const isPullingRef = useRef(false)

  const openView = (nextView: ViewKey) => {
    setView(nextView)
    setIsMenuOpen(false)
  }

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

      if (dampedDistance > 10) {
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
  }, [isRefreshing])

  const pullProgress = Math.min(pullDistance / pullRefreshThreshold, 1)
  const shouldShowPullRefresh = pullDistance > 0 || isRefreshing

  return (
    <main className="min-h-screen bg-[#070a12] text-white">
      <div
        aria-hidden={!shouldShowPullRefresh}
        className={`fixed left-1/2 top-3 z-50 -translate-x-1/2 transition duration-200 md:hidden ${
          shouldShowPullRefresh ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{
          transform: `translate(-50%, ${Math.min(pullDistance * 0.22, 18)}px)`,
        }}
      >
        <div className="flex min-h-11 items-center gap-3 rounded-full border border-cyan-300/30 bg-[#07111d]/88 px-4 text-xs font-black text-cyan-50 shadow-[0_18px_45px_rgba(0,0,0,0.34)] backdrop-blur-xl">
          <span
            className={`grid h-6 w-6 place-items-center rounded-full border border-cyan-200/40 ${
              isRefreshing ? 'animate-spin' : ''
            }`}
          >
            <span
              className="block h-2.5 w-2.5 rounded-full bg-gradient-to-br from-cyan-200 to-fuchsia-300"
              style={{ transform: `scale(${Math.max(0.55, pullProgress)})` }}
            />
          </span>
          {isRefreshing
            ? '새로고침 중'
            : pullProgress >= 1
              ? '놓으면 새로고침'
              : '아래로 당겨 새로고침'}
        </div>
      </div>
      <div className="min-h-screen bg-[radial-gradient(circle_at_28%_20%,rgba(0,200,255,0.22),transparent_32%),radial-gradient(circle_at_76%_28%,rgba(184,54,255,0.24),transparent_34%),linear-gradient(135deg,#080b14_0%,#0b1020_48%,#090713_100%)]">
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 md:px-8">
          <header className="sticky top-0 z-40 -mx-5 flex items-center justify-between border-b border-white/10 bg-[#070a12]/72 px-5 py-3 shadow-[0_14px_34px_rgba(0,0,0,0.18)] backdrop-blur-xl md:relative md:top-auto md:z-20 md:mx-0 md:border-b-0 md:bg-transparent md:px-0 md:py-0 md:shadow-none md:backdrop-blur-0">
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

          <section className="min-w-0 flex-1 py-6 lg:py-8">
            {view !== 'home' ? (
              <button
                type="button"
                onClick={() => openView('home')}
                aria-label="메인으로 돌아가기"
                className="mb-2 inline-grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/[0.045] text-slate-100 shadow-[0_14px_34px_rgba(0,0,0,0.18)] transition hover:-translate-x-0.5 hover:border-cyan-300/45 hover:bg-cyan-300/10 focus:outline-none focus:ring-4 focus:ring-cyan-300/15 md:mb-3"
              >
                <span
                  aria-hidden="true"
                  className="block h-3 w-3 rotate-45 border-b-2 border-l-2 border-current"
                >
                  <span className="sr-only">메인으로</span>
                </span>
              </button>
            ) : null}
            {view === 'home' ? (
              <HomeView
                onOpenBlogPosting={() => openView('blog')}
                onOpenKeyword={() => openView('keyword')}
              />
            ) : null}
            {view === 'keyword' ? <KeywordTool /> : null}
            {view === 'blog' ? <BlogPostingTool /> : null}
          </section>
        </div>
      </div>
    </main>
  )
}
