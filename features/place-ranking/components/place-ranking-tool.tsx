'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { PlaceRankingResponse } from '../types'

type PlaceRankingErrorBody = {
  message?: string
  debug?: unknown
}

const rankingPageSize = 50
const fetchLimit = 300
const initialVisibleCount = rankingPageSize

const loadingSteps = [
  '네이버 플레이스 결과를 확인하고 있습니다.',
  '광고를 제외한 실제 노출 순서를 계산하고 있습니다.',
  '상위 플레이스 정보를 정리하고 있습니다.',
]

async function requestRankings(keyword: string, limit: number) {
  const response = await fetch('/api/place-ranking/rankings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword, limit }),
  })
  const body = (await response.json()) as PlaceRankingResponse | PlaceRankingErrorBody

  if (!response.ok) {
    const errorBody = body as PlaceRankingErrorBody
    const error = new Error(errorBody.message ?? '플레이스 순위 조회에 실패했습니다.')

    Object.assign(error, {
      debug: errorBody.debug,
    })

    throw error
  }

  return body as PlaceRankingResponse
}

export function PlaceRankingTool() {
  const [keyword, setKeyword] = useState('')
  const [result, setResult] = useState<PlaceRankingResponse | null>(null)
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [errorLog, setErrorLog] = useState('')
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const canSubmit = useMemo(
    () => keyword.trim().length > 0 && !isLoading,
    [isLoading, keyword],
  )
  const visibleItems = result?.items.slice(0, visibleCount) ?? []
  const canTryLoadMore = Boolean(result && visibleCount < result.items.length)

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

  useEffect(() => {
    const target = loadMoreRef.current

    if (!target || !canTryLoadMore) {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          loadMoreRankings()
        }
      },
      { rootMargin: '220px' },
    )

    observer.observe(target)

    return () => observer.disconnect()
  }, [canTryLoadMore, result])

  const submitKeyword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextKeyword = keyword.trim()

    if (!nextKeyword) {
      setErrorMessage('조회할 키워드를 입력해주세요.')
      setErrorLog('')
      return
    }

    setIsLoading(true)
    setErrorMessage('')
    setErrorLog('')
    setResult(null)
    setVisibleCount(initialVisibleCount)

    try {
      const nextResult = await requestRankings(nextKeyword, fetchLimit)

      setResult(nextResult)
      setVisibleCount(Math.min(initialVisibleCount, nextResult.items.length))
    } catch (error) {
      setErrorLog(toReadableErrorLog(readErrorDebug(error)))
      setErrorMessage(error instanceof Error ? error.message : '플레이스 순위 조회에 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const loadMoreRankings = () => {
    if (!result) {
      return
    }

    setVisibleCount((current) => Math.min(current + rankingPageSize, result.items.length))
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl content-center py-6">
      <section className="text-center">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200/80">
          Naver Place Ranking
        </p>
        <h2 className="mt-3 text-3xl font-black tracking-normal md:text-5xl">
          네이버 플레이스 순위를 실시간으로 조회하세요
        </h2>
        <p className="mx-auto mt-4 max-w-4xl text-base font-semibold leading-7 text-slate-300">
          키워드 기준으로 네이버 플레이스 결과를 수집하고, 광고를 제외한 실제 노출 순서를
          확인합니다.
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
                setErrorLog('')
              }}
              placeholder="예: 노원 속눈썹펌"
              className="min-h-14 flex-1 rounded-md border border-white/10 bg-[#090d18] px-4 text-lg font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10"
            />
            <button
              type="submit"
              disabled={!canSubmit}
              className="min-h-14 rounded-md bg-cyan-100 px-7 text-base font-black text-[#090b14] transition hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-400 disabled:text-slate-800"
            >
              {isLoading ? '조회 중' : '실시간 조회'}
            </button>
          </div>
        </form>

        {!keyword.trim() && errorMessage ? (
          <p className="mx-auto mt-3 max-w-3xl text-left text-sm font-bold text-rose-200">
            {errorMessage}
          </p>
        ) : null}
      </section>

      {isLoading ? (
        <section className="mx-auto mt-8 w-full max-w-5xl rounded-md border border-cyan-300/25 bg-cyan-300/[0.07] p-5 text-left">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-lg font-black text-cyan-100">{loadingSteps[loadingStep]}</p>
              <p className="mt-1 text-sm font-bold text-slate-400">
                네이버 플레이스 데이터를 확인해 순위와 리뷰 정보를 정리합니다.
              </p>
            </div>
            <span className="inline-flex w-fit rounded-md border border-cyan-300/25 px-4 py-2 text-sm font-black text-cyan-200">
              진행 중
            </span>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/3 animate-[aiva-loading_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-300 via-blue-300 to-fuchsia-400" />
          </div>
        </section>
      ) : null}

      {errorMessage && keyword.trim() ? (
        <section className="mx-auto mt-6 w-full max-w-5xl rounded-md border border-rose-300/20 bg-rose-400/[0.08] p-4 text-left">
          <p className="font-black text-rose-100">{errorMessage}</p>
          {errorLog ? (
            <details className="mt-3 rounded-md border border-white/10 bg-[#080c17]/80 p-3">
              <summary className="cursor-pointer text-sm font-black text-rose-100">
                실패 로그 보기
              </summary>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-300">
                {errorLog}
              </pre>
            </details>
          ) : null}
        </section>
      ) : null}

      {result ? (
        <section className="mx-auto mt-9 w-full max-w-6xl rounded-md border border-white/10 bg-white/[0.07] p-5 text-left shadow-[0_22px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">
                Result
              </p>
              <h3 className="mt-2 text-2xl font-black">네이버 플레이스 순위 조회 결과</h3>
              <p className="mt-2 text-sm font-semibold text-slate-400">
                광고를 제외한 실제 노출 순서 기준입니다. 전체 {result.items.length}개 중 현재{' '}
                {visibleItems.length}개를 표시합니다.
              </p>
            </div>
            <div className="grid gap-2 md:justify-items-end">
              <span className="w-fit rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-black text-slate-300">
                기준 키워드: {result.keyword}
              </span>
              <span className="text-xs font-bold text-slate-500">
                조회 시각: {formatCollectedAt(result.collectedAt)}
                {result.source === 'cache' ? ' · 캐시 응답' : ''}
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {visibleItems.map((item) => (
              <article
                key={`${item.rank}-${item.name}-${item.rawText.slice(0, 30)}`}
                className="overflow-hidden rounded-md border border-white/10 bg-[#080c17]/85"
              >
                <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-0 md:grid-cols-[132px_minmax(0,1fr)] lg:grid-cols-[140px_minmax(0,1fr)_minmax(300px,0.86fr)]">
                  <div className="p-3 md:p-4">
                    <div className="relative aspect-square overflow-hidden rounded-md bg-white/[0.04]">
                      {item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={`${item.name} 썸네일`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center bg-gradient-to-br from-cyan-300/15 via-slate-900 to-fuchsia-400/15 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100/70">
                          No Image
                        </div>
                      )}
                      <div className="absolute left-2 top-2 grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br from-cyan-300 to-fuchsia-500 text-sm font-black text-[#070a12] shadow-[0_12px_24px_rgba(0,0,0,0.28)] md:h-10 md:w-10">
                        {item.rank}
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 p-3 pl-0 md:p-5 md:pl-0 lg:pl-1">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-200/70">
                          Place
                        </p>
                        <h4 className="mt-1 break-keep text-lg font-black text-white md:text-xl">
                          {item.name}
                        </h4>
                        <p className="mt-1 text-sm font-bold text-cyan-100/80">{item.category}</p>
                      </div>
                      {item.imageCount ? (
                        <span className="w-fit rounded-md border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-xs font-black text-slate-300">
                          이미지 {item.imageCount}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 grid gap-2 text-sm font-bold text-slate-300 md:mt-4">
                      {item.status ? (
                        <p className="rounded-md border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-2 text-cyan-100">
                          {item.status}
                        </p>
                      ) : null}
                      {item.address ? (
                        <p className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2">
                          {item.address}
                        </p>
                      ) : null}
                      {item.distance ? (
                        <p className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2">
                          현재 위치 기준 {item.distance}
                        </p>
                      ) : null}
                    </div>

                    {item.badges.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {item.badges.map((badge) => (
                          <span
                            key={badge}
                            className="rounded-md bg-cyan-300/10 px-2 py-1 text-[11px] font-black text-cyan-100"
                          >
                            {badge}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="col-span-2 border-t border-white/10 p-4 md:p-5 lg:col-span-1 lg:border-l lg:border-t-0">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-200/70">
                      최근 리뷰
                    </p>
                    <div className="mt-3 grid gap-2">
                      {item.visitorReviews.length > 0 ? (
                        item.visitorReviews.map((review, index) => (
                          <p
                            key={`${item.expId}-review-${index}`}
                            className="line-clamp-3 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold leading-6 text-slate-300"
                          >
                            {review}
                          </p>
                        ))
                      ) : (
                        <p className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold leading-6 text-slate-400">
                          최근 리뷰 정보가 제공되지 않았습니다.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {canTryLoadMore ? (
            <div
              ref={loadMoreRef}
              className="mt-5 rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] p-4 text-center text-sm font-black text-cyan-100"
            >
              아래로 스크롤하면 {visibleItems.length + 1}위 이후 순위를 이어서 표시합니다.
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

function toReadableErrorLog(value: unknown) {
  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function readErrorDebug(error: unknown) {
  if (typeof error === 'object' && error !== null && 'debug' in error) {
    return error.debug
  }

  return undefined
}

function formatCollectedAt(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    day: '2-digit',
  })
}
