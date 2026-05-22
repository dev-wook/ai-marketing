'use client'

import { useState } from 'react'
import { BlogPostingTool } from '@/features/blog-posting/components/blog-posting-tool'
import { KeywordTool } from '@/features/keyword-analysis/components/keyword-tool'
import { BrandHeader } from './brand-header'
import { HomeView } from './home-view'
import { MenuButton } from './menu-button'

type ViewKey = 'home' | 'keyword' | 'blog'

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
