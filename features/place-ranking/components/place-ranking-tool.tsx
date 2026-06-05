'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { PlaceRankingItem, PlaceRankingResponse } from '../types'

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
  const [openedAddressId, setOpenedAddressId] = useState<string | null>(null)
  const [placeNameFilter, setPlaceNameFilter] = useState('')
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const canSubmit = useMemo(
    () => keyword.trim().length > 0 && !isLoading,
    [isLoading, keyword],
  )
  const visibleItems = result?.items.slice(0, visibleCount) ?? []
  const filteredItems = useMemo(() => {
    const filterText = placeNameFilter.trim().toLocaleLowerCase('ko-KR')

    if (!filterText) {
      return visibleItems
    }

    return visibleItems.filter((item) =>
      item.name.toLocaleLowerCase('ko-KR').includes(filterText),
    )
  }, [placeNameFilter, visibleItems])
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
    setOpenedAddressId(null)
    setPlaceNameFilter('')
    setExpandedImage(null)
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

          <div className="mt-5 flex flex-col gap-3 rounded-md border border-white/10 bg-[#080c17]/45 p-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200/70">
                Filter
              </p>
              <p className="mt-1 text-sm font-bold text-slate-400">
                현재 표시된 결과 안에서 플레이스명을 빠르게 찾습니다.
              </p>
            </div>
            <input
              value={placeNameFilter}
              onChange={(event) => setPlaceNameFilter(event.target.value)}
              placeholder="플레이스명 검색"
              className="min-h-11 w-full rounded-md border border-white/10 bg-[#090d18] px-3 text-sm font-black text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10 md:max-w-xs"
            />
          </div>

          {placeNameFilter.trim() ? (
            <p className="mt-3 text-sm font-bold text-slate-400">
              검색 결과 {filteredItems.length}개
            </p>
          ) : null}

          <div className="mt-5 grid gap-3">
            {filteredItems.map((item) => (
              <article
                key={`${item.rank}-${item.name}-${item.rawText.slice(0, 30)}`}
                className="overflow-visible rounded-md border border-white/10 bg-[#080c17]/85"
              >
                <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-0 md:grid-cols-[156px_minmax(0,1fr)]">
                  <div className="p-3 md:p-4">
                    <div className="relative aspect-square overflow-hidden rounded-md bg-white/[0.04]">
                      {item.images.mainImageUrl ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedImage({
                              src: item.images.mainImageUrl ?? '',
                              alt: `${item.name} 대표 이미지`,
                            })
                          }
                          className="block h-full w-full"
                          aria-label={`${item.name} 대표 이미지 크게 보기`}
                        >
                          <img
                            src={item.images.mainImageUrl}
                            alt={`${item.name} 썸네일`}
                            className="h-full w-full object-cover transition duration-200 hover:scale-[1.03]"
                            loading="lazy"
                          />
                        </button>
                      ) : (
                        <div className="grid h-full w-full place-items-center bg-gradient-to-br from-cyan-300/15 via-slate-900 to-fuchsia-400/15 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100/70">
                          No Image
                        </div>
                      )}
                    </div>
                    {getPreviewImages(item).length > 0 ? (
                      <div className="mt-2 grid grid-cols-3 gap-1">
                        {getPreviewImages(item).map((imageUrl, index) => (
                          <button
                            type="button"
                            key={`${item.id}-preview-${imageUrl}-${index}`}
                            onClick={() =>
                              setExpandedImage({
                                src: imageUrl,
                                alt: `${item.name} 참고 이미지 ${index + 1}`,
                              })
                            }
                            className="aspect-square overflow-hidden rounded-sm bg-white/[0.04]"
                            aria-label={`${item.name} 참고 이미지 ${index + 1} 크게 보기`}
                          >
                            <img
                              src={imageUrl}
                              alt={`${item.name} 참고 이미지 ${index + 1}`}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="min-w-0 p-3 pl-0 md:p-5 md:pl-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="rounded-md bg-gradient-to-br from-cyan-300 to-fuchsia-500 px-2.5 py-1 text-sm font-black text-[#070a12] shadow-[0_10px_22px_rgba(0,0,0,0.24)]">
                        {item.rank}위
                      </span>
                      <h4 className="min-w-0 break-keep text-lg font-black text-white md:text-2xl">
                        {item.name}
                      </h4>
                    </div>
                    <p className="mt-1 text-sm font-bold text-cyan-100/80">{item.category}</p>
                    <div className="relative mt-3">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenedAddressId((current) => (current === item.id ? null : item.id))
                        }
                        className="inline-flex max-w-full items-center gap-1 text-left text-sm font-black text-slate-300 transition hover:text-cyan-100"
                        aria-expanded={openedAddressId === item.id}
                      >
                        <span className="min-w-0 truncate">{formatShortAddress(item)}</span>
                        <span
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-cyan-200/80 leading-none"
                          aria-hidden="true"
                        >
                          ⌄
                        </span>
                      </button>
                      {openedAddressId === item.id ? (
                        <div className="absolute left-0 z-20 mt-2 w-min min-w-64 max-w-[min(22rem,calc(100vw-3rem))] rounded-md border border-cyan-300/20 bg-[#0b1220] p-3 text-xs font-bold leading-5 text-slate-200 shadow-[0_18px_36px_rgba(0,0,0,0.35)]">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200/70">
                            Address
                          </p>
                          <p className="mt-2">{formatDetailedAddress(item)}</p>
                          {item.location.distance ? (
                            <p className="mt-1 text-slate-400">
                              현재 위치 기준 {item.location.distance}
                            </p>
                          ) : null}
                          {getUsefulOptions(item).length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {getUsefulOptions(item).map((option) => (
                                <span
                                  key={option}
                                  className="rounded-sm bg-white/[0.06] px-2 py-1 text-[10px] text-slate-300"
                                >
                                  {option}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {item.badges.map((badge) => (
                        <span
                          key={badge}
                          className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-black text-slate-300"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>

                    {item.reviews.snippets.length > 0 ? (
                      <div className="mt-4 max-w-full overflow-hidden">
                        <div className="flex snap-x gap-2 overflow-x-auto pb-1">
                          {item.reviews.snippets.slice(0, 3).map((review, index) => (
                            <blockquote
                              key={`${item.id}-${review.reviewId}-${index}`}
                              className="min-w-[82%] snap-start rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold leading-5 text-slate-300 sm:min-w-[42%] lg:min-w-[30%]"
                            >
                              <span className="line-clamp-2">{review.text}</span>
                            </blockquote>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {item.hashtags.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {item.hashtags.map((hashtag) => (
                          <span
                            key={hashtag}
                            className="rounded-md bg-blue-400/10 px-2.5 py-1 text-xs font-black text-blue-100"
                          >
                            #{hashtag.replace(/^#/, '')}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.actions.bookingUrl ? (
                        <a
                          href={item.actions.bookingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-cyan-200/40 bg-cyan-100 px-3 py-2 text-xs font-black text-[#07111f] shadow-[0_8px_18px_rgba(103,232,249,0.12)] transition hover:bg-white"
                        >
                          예약
                        </a>
                      ) : null}
                      {item.actions.talktalkUrl ? (
                        <a
                          href={item.actions.talktalkUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-cyan-300/30 bg-cyan-300/15 px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/25"
                        >
                          톡톡
                        </a>
                      ) : null}
                      {item.actions.phone ? (
                        <a
                          href={`tel:${item.actions.phone}`}
                          className="rounded-md border border-white/15 bg-white/[0.09] px-3 py-2 text-xs font-black text-white transition hover:bg-white/15"
                        >
                          전화
                        </a>
                      ) : null}
                      {item.actions.routeUrl ? (
                        <a
                          href={item.actions.routeUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-white/15 bg-white/[0.09] px-3 py-2 text-xs font-black text-white transition hover:bg-white/15"
                        >
                          길찾기
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {filteredItems.length === 0 ? (
            <div className="mt-5 rounded-md border border-white/10 bg-[#080c17]/70 p-5 text-center text-sm font-black text-slate-300">
              현재 표시된 {visibleItems.length}개 결과 안에서 일치하는 플레이스명이 없습니다.
            </div>
          ) : null}

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

      {expandedImage ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="이미지 확대 보기"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative max-h-[90vh] w-full max-w-3xl">
            <button
              type="button"
              onClick={() => setExpandedImage(null)}
              className="absolute right-3 top-3 z-10 rounded-md border border-white/20 bg-black/60 px-3 py-2 text-sm font-black text-white backdrop-blur transition hover:bg-black/80"
            >
              닫기
            </button>
            <img
              src={expandedImage.src}
              alt={expandedImage.alt}
              className="max-h-[90vh] w-full rounded-md object-contain shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        </div>
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

function formatShortAddress(item: PlaceRankingItem) {
  return (
    item.location.commonAddress ||
    item.location.address ||
    item.location.roadAddress ||
    item.location.fullAddress ||
    '주소 정보 없음'
  )
}

function formatDetailedAddress(item: PlaceRankingItem) {
  return (
    item.location.roadAddress ||
    item.location.fullAddress ||
    item.location.address ||
    item.location.commonAddress ||
    '상세 주소 정보가 제공되지 않았습니다.'
  )
}

function getPreviewImages(item: PlaceRankingItem) {
  const candidates = [
    ...item.images.imageUrls,
    ...item.reviews.images.map((image) => image.imageUrl),
  ].filter((imageUrl) => imageUrl && imageUrl !== item.images.mainImageUrl)

  return Array.from(new Set(candidates)).slice(0, 3)
}

function getUsefulOptions(item: PlaceRankingItem) {
  const usefulKeywords = ['주차', '대기공간', '무선 인터넷', '반려동물', '간편결제', '제로페이']

  return item.options
    .filter((option) => usefulKeywords.some((keyword) => option.includes(keyword)))
    .slice(0, 5)
}
