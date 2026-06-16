'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  PlaceRankingBatchKeyword,
  PlaceRankingBatchKeywordResponse,
  PlaceRankingItem,
  PlaceRankingSnapshotHistoryResponse,
  PlaceRankingSnapshotSaveResponse,
  PlaceRankingResponse,
} from '../types'

type PlaceRankingErrorBody = {
  message?: string
  debug?: unknown
}

type SnapshotToast = {
  id: number
  type: 'success' | 'error'
  message: string
}

const rankingPageSize = 50
const fetchLimit = 300
const initialVisibleCount = rankingPageSize
const recentPlaceRankingStorageKey = 'aiva:recent-place-ranking-keywords'
const maxRecentKeywords = 5

const loadingSteps = [
  '네이버 플레이스 결과를 확인하고 있습니다.',
  '플레이스 노출 순서를 계산하고 있습니다.',
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

async function requestSaveSnapshots(result: PlaceRankingResponse) {
  const response = await fetch('/api/place-ranking/snapshots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      keyword: result.keyword,
      items: result.items,
    }),
  })
  const body = (await response.json()) as PlaceRankingSnapshotSaveResponse | PlaceRankingErrorBody

  if (!response.ok) {
    const errorBody = body as PlaceRankingErrorBody
    const error = new Error(errorBody.message ?? '순위 기록 저장에 실패했습니다.')

    Object.assign(error, {
      debug: errorBody.debug,
    })

    throw error
  }

  return body as PlaceRankingSnapshotSaveResponse
}

async function requestSnapshotHistory(keyword: string, placeId: string) {
  const params = new URLSearchParams({ keyword, placeId })
  const response = await fetch(`/api/place-ranking/snapshots?${params.toString()}`)
  const body = (await response.json()) as PlaceRankingSnapshotHistoryResponse | PlaceRankingErrorBody

  if (!response.ok) {
    const errorBody = body as PlaceRankingErrorBody
    const error = new Error(errorBody.message ?? '순위 이력 조회에 실패했습니다.')

    Object.assign(error, {
      debug: errorBody.debug,
    })

    throw error
  }

  return body as PlaceRankingSnapshotHistoryResponse
}

async function requestBatchKeywords() {
  const response = await fetch('/api/place-ranking/batch-keywords')
  const body = (await response.json()) as PlaceRankingBatchKeywordResponse | PlaceRankingErrorBody

  if (!response.ok) {
    const errorBody = body as PlaceRankingErrorBody
    const error = new Error(errorBody.message ?? '자동 기록 키워드 조회에 실패했습니다.')

    Object.assign(error, {
      debug: errorBody.debug,
    })

    throw error
  }

  return (body as PlaceRankingBatchKeywordResponse).keywords
}

async function requestAddBatchKeyword(keyword: string) {
  const response = await fetch('/api/place-ranking/batch-keywords', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword }),
  })
  const body = (await response.json()) as
    | { keyword: PlaceRankingBatchKeyword }
    | PlaceRankingErrorBody

  if (!response.ok) {
    const errorBody = body as PlaceRankingErrorBody
    const error = new Error(errorBody.message ?? '자동 기록 키워드 추가에 실패했습니다.')

    Object.assign(error, {
      debug: errorBody.debug,
    })

    throw error
  }

  return (body as { keyword: PlaceRankingBatchKeyword }).keyword
}

async function requestDeleteBatchKeyword(id: number) {
  const response = await fetch('/api/place-ranking/batch-keywords', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  const body = (await response.json()) as { ok: boolean } | PlaceRankingErrorBody

  if (!response.ok) {
    const errorBody = body as PlaceRankingErrorBody
    const error = new Error(errorBody.message ?? '자동 기록 키워드 삭제에 실패했습니다.')

    Object.assign(error, {
      debug: errorBody.debug,
    })

    throw error
  }

  return body as { ok: boolean }
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
  const [placeNameFilterInput, setPlaceNameFilterInput] = useState('')
  const [appliedPlaceNameFilter, setAppliedPlaceNameFilter] = useState('')
  const [recentKeywords, setRecentKeywords] = useState<string[]>([])
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null)
  const [reviewPlace, setReviewPlace] = useState<PlaceRankingItem | null>(null)
  const [historyPlace, setHistoryPlace] = useState<PlaceRankingItem | null>(null)
  const [historyRows, setHistoryRows] = useState<PlaceRankingSnapshotHistoryResponse['history']>([])
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false)
  const [snapshotToast, setSnapshotToast] = useState<SnapshotToast | null>(null)
  const [batchKeywords, setBatchKeywords] = useState<PlaceRankingBatchKeyword[]>([])
  const [batchKeywordInput, setBatchKeywordInput] = useState('')
  const [isBatchLoading, setIsBatchLoading] = useState(false)
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const canSubmit = useMemo(
    () => keyword.trim().length > 0 && !isLoading,
    [isLoading, keyword],
  )
  const visibleItems = result?.items.slice(0, visibleCount) ?? []
  const filteredItems = useMemo(() => {
    const filterText = appliedPlaceNameFilter.trim().toLocaleLowerCase('ko-KR')

    if (!filterText) {
      return visibleItems
    }

    return visibleItems.filter((item) =>
      item.name.toLocaleLowerCase('ko-KR').includes(filterText),
    )
  }, [appliedPlaceNameFilter, visibleItems])
  const canTryLoadMore = Boolean(
    result && visibleCount < result.items.length && !appliedPlaceNameFilter,
  )

  useEffect(() => {
    setIsMounted(true)
    setRecentKeywords(readRecentPlaceRankingKeywords())
    loadBatchKeywords()
  }, [])

  useEffect(() => {
    if (!expandedImage && !reviewPlace && !historyPlace && !isBatchModalOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [expandedImage, reviewPlace, historyPlace, isBatchModalOpen])

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

  const runKeywordSearch = async (nextKeyword: string) => {
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
    setPlaceNameFilterInput('')
    setAppliedPlaceNameFilter('')
    setExpandedImage(null)
    setReviewPlace(null)
    setHistoryPlace(null)
    setHistoryRows([])
    setSnapshotToast(null)
    setVisibleCount(initialVisibleCount)

    try {
      const nextResult = await requestRankings(nextKeyword, fetchLimit)

      setResult(nextResult)
      setVisibleCount(Math.min(initialVisibleCount, nextResult.items.length))
      setRecentKeywords(saveRecentPlaceRankingKeyword(nextKeyword))
    } catch (error) {
      setErrorLog(toReadableErrorLog(readErrorDebug(error)))
      setErrorMessage(error instanceof Error ? error.message : '플레이스 순위 조회에 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const submitKeyword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await runKeywordSearch(keyword.trim())
  }

  const loadMoreRankings = () => {
    if (!result) {
      return
    }

    setVisibleCount((current) => Math.min(current + rankingPageSize, result.items.length))
  }

  const submitPlaceNameFilter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAppliedPlaceNameFilter(placeNameFilterInput.trim())
  }

  const clearPlaceNameFilter = () => {
    setPlaceNameFilterInput('')
    setAppliedPlaceNameFilter('')
  }

  const applyRecentKeyword = async (nextKeyword: string) => {
    setKeyword(nextKeyword)
    await runKeywordSearch(nextKeyword.trim())
  }

  const removeRecentKeyword = (targetKeyword: string) => {
    setRecentKeywords(deleteRecentPlaceRankingKeyword(targetKeyword))
  }

  const saveTodaySnapshot = async () => {
    if (!result || isSavingSnapshot) {
      return
    }

    setIsSavingSnapshot(true)

    try {
      const response = await requestSaveSnapshots(result)

      setResult({
        ...result,
        items: result.items.map((item) => ({
          ...item,
          rankChange: response.summary.changesByPlaceId[item.id] ?? null,
        })),
      })
      showSnapshotToast({
        type: 'success',
        message: '오늘 순위 기록을 저장했습니다.',
      })
    } catch (error) {
      showSnapshotToast({
        type: 'error',
        message: error instanceof Error ? error.message : '순위 기록 저장에 실패했습니다.',
      })
      setErrorLog(toReadableErrorLog(readErrorDebug(error)))
    } finally {
      setIsSavingSnapshot(false)
    }
  }

  const openHistory = async (place: PlaceRankingItem) => {
    if (!result) {
      return
    }

    setHistoryPlace(place)
    setHistoryRows([])
    setIsHistoryLoading(true)

    try {
      const response = await requestSnapshotHistory(result.keyword, place.id)

      setHistoryRows(response.history)
    } catch (error) {
      setHistoryRows([])
      showSnapshotToast({
        type: 'error',
        message: error instanceof Error ? error.message : '순위 이력 조회에 실패했습니다.',
      })
    } finally {
      setIsHistoryLoading(false)
    }
  }

  const showSnapshotToast = ({ type, message }: Omit<SnapshotToast, 'id'>) => {
    setSnapshotToast({
      id: Date.now(),
      type,
      message,
    })
  }

  const loadBatchKeywords = async () => {
    setIsBatchLoading(true)

    try {
      setBatchKeywords(await requestBatchKeywords())
    } catch (error) {
      showSnapshotToast({
        type: 'error',
        message: error instanceof Error ? error.message : '자동 기록 키워드 조회에 실패했습니다.',
      })
    } finally {
      setIsBatchLoading(false)
    }
  }

  const submitBatchKeyword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextKeyword = batchKeywordInput.trim()

    if (!nextKeyword || isBatchLoading) {
      return
    }

    setIsBatchLoading(true)

    try {
      const created = await requestAddBatchKeyword(nextKeyword)

      setBatchKeywords((current) => [
        created,
        ...current.filter((item) => item.id !== created.id && item.keyword !== created.keyword),
      ])
      setBatchKeywordInput('')
      showSnapshotToast({
        type: 'success',
        message: '자동 기록 키워드를 추가했습니다.',
      })
    } catch (error) {
      showSnapshotToast({
        type: 'error',
        message: error instanceof Error ? error.message : '자동 기록 키워드 추가에 실패했습니다.',
      })
    } finally {
      setIsBatchLoading(false)
    }
  }

  const removeBatchKeyword = async (id: number) => {
    if (isBatchLoading) {
      return
    }

    setIsBatchLoading(true)

    try {
      await requestDeleteBatchKeyword(id)
      setBatchKeywords((current) => current.filter((item) => item.id !== id))
      showSnapshotToast({
        type: 'success',
        message: '자동 기록 키워드를 삭제했습니다.',
      })
    } catch (error) {
      showSnapshotToast({
        type: 'error',
        message: error instanceof Error ? error.message : '자동 기록 키워드 삭제에 실패했습니다.',
      })
    } finally {
      setIsBatchLoading(false)
    }
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
          키워드 기준으로 네이버 플레이스 실시간 노출 순위를 확인합니다.
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
              className="min-h-14 rounded-md bg-white px-7 text-base font-black text-[#070a12] shadow-[0_0_26px_rgba(34,211,238,0.2)] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isLoading ? '조회 중' : '실시간 조회'}
            </button>
          </div>
        </form>

        {recentKeywords.length > 0 ? (
          <div className="mx-auto mt-4 max-w-3xl text-left">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200/70">
              최근 검색
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
              {recentKeywords.slice(0, 5).map((recentKeyword) => (
                <div
                  key={recentKeyword}
                  className="grid min-h-11 grid-cols-[minmax(0,1fr)_38px] overflow-hidden rounded-md border border-cyan-300/25 bg-cyan-300/[0.06]"
                >
                  <button
                    type="button"
                    onClick={() => applyRecentKeyword(recentKeyword)}
                    disabled={isLoading}
                    className="min-w-0 px-3 text-center text-sm font-black text-cyan-50 transition hover:bg-cyan-300/12 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="block truncate">{recentKeyword}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRecentKeyword(recentKeyword)}
                    disabled={isLoading}
                    aria-label={`${recentKeyword} 최근 검색어 삭제`}
                    className="grid place-items-center border-l border-cyan-300/20 text-sm font-black text-cyan-100/80 transition hover:bg-cyan-300/14 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mx-auto mt-4 flex max-w-3xl justify-end">
          <button
            type="button"
            onClick={() => {
              setIsBatchModalOpen(true)
              loadBatchKeywords()
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-cyan-300/25 bg-cyan-300/[0.08] px-4 text-sm font-black text-cyan-50 transition hover:border-cyan-200/50 hover:bg-cyan-300/[0.14]"
          >
            자동 기록 키워드 관리
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-cyan-100/80">
              {batchKeywords.length}개
            </span>
          </button>
        </div>

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
            </div>
            <div className="grid gap-2 md:justify-items-end">
              <span className="w-fit rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-black text-slate-300">
                기준 키워드: {result.keyword}
              </span>
              <span className="text-xs font-bold text-slate-500">
                조회 시각: {formatCollectedAt(result.collectedAt)}
                {result.source === 'cache' ? ' · 캐시 응답' : ''}
              </span>
              <button
                type="button"
                onClick={saveTodaySnapshot}
                disabled={isSavingSnapshot || result.items.length === 0}
                className="min-h-11 rounded-md border border-cyan-300/35 bg-cyan-300/12 px-4 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSavingSnapshot ? '기록 중' : '오늘 순위 기록'}
              </button>
            </div>
          </div>

          <form
            onSubmit={submitPlaceNameFilter}
            className="mt-5 flex flex-col gap-3 rounded-md border border-white/10 bg-[#080c17]/45 p-3 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200/70">
                Filter
              </p>
              <p className="mt-1 text-sm font-bold text-slate-400">
                현재 표시된 결과 안에서 플레이스명을 빠르게 찾습니다.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row md:max-w-md">
              <input
                value={placeNameFilterInput}
                onChange={(event) => setPlaceNameFilterInput(event.target.value)}
                placeholder="플레이스명 입력"
                className="min-h-11 flex-1 rounded-md border border-white/10 bg-[#090d18] px-3 text-sm font-black text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10"
              />
              <button
                type="submit"
                className="min-h-11 rounded-md border border-cyan-300/35 bg-cyan-300/12 px-4 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/20"
              >
                검색
              </button>
              {appliedPlaceNameFilter ? (
                <button
                  type="button"
                  onClick={clearPlaceNameFilter}
                  className="min-h-11 rounded-md border border-white/10 bg-white/[0.06] px-4 text-sm font-black text-slate-200 transition hover:bg-white/[0.1]"
                >
                  초기화
                </button>
              ) : null}
            </div>
          </form>

          {appliedPlaceNameFilter ? (
            <p className="mt-3 text-sm font-bold text-slate-400">
              "{appliedPlaceNameFilter}" 검색 결과 {filteredItems.length}개
            </p>
          ) : null}

          <div className="mt-5 grid gap-3">
            {filteredItems.map((item) => (
              <article
                key={item.id}
                onClick={(event) => {
                  const target = event.target

                  if (target instanceof Element && target.closest('button,a')) {
                    return
                  }

                  openHistory(item)
                }}
                className="overflow-visible rounded-md border border-white/10 bg-[#080c17]/85"
              >
                <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-0 sm:grid-cols-[120px_minmax(0,1fr)] md:grid-cols-[156px_minmax(0,1fr)]">
                  <div className="p-2.5 sm:p-4">
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
                      <div className="mt-1 grid grid-cols-3 gap-1 sm:mt-2">
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

                  <div className="min-w-0 p-2.5 pl-0 sm:p-4 sm:pl-0 md:p-5 md:pl-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="rounded-md bg-gradient-to-br from-cyan-300 to-fuchsia-500 px-2 py-0.5 text-xs font-black text-[#070a12] shadow-[0_10px_22px_rgba(0,0,0,0.24)] sm:px-2.5 sm:py-1 sm:text-sm">
                        {item.rank}위
                      </span>
                      <RankChangeBadge change={item.rankChange} />
                      <h4 className="min-w-0 break-keep text-base font-black leading-tight text-white sm:text-lg md:text-2xl">
                        {item.name}
                      </h4>
                    </div>
                    <p className="mt-0.5 text-xs font-bold leading-snug text-cyan-100/80 sm:mt-1 sm:text-sm">
                      {item.category}
                    </p>
                    <div className="relative mt-2 sm:mt-3">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenedAddressId((current) => (current === item.id ? null : item.id))
                        }
                        className="inline-flex max-w-full items-center gap-1 text-left text-xs font-black text-slate-300 transition hover:text-cyan-100 sm:text-sm"
                        aria-expanded={openedAddressId === item.id}
                      >
                        <span className="min-w-0 truncate">{formatShortAddress(item)}</span>
                        <span
                          className={`relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-cyan-200/80 transition ${
                            openedAddressId === item.id ? 'rotate-180' : ''
                          }`}
                          aria-hidden="true"
                        >
                          <span className="block h-2 w-2 translate-y-[-1px] rotate-45 border-b-2 border-r-2 border-current" />
                        </span>
                      </button>
                      {openedAddressId === item.id ? (
                        <div className="absolute left-0 z-30 mt-2 w-[min(16rem,100%)] rounded-md border border-cyan-300/20 bg-[#0b1220] p-3 text-xs font-bold leading-5 text-slate-200 shadow-[0_18px_36px_rgba(0,0,0,0.35)] sm:w-[min(22rem,calc(100vw-3rem))]">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200/70">
                              Address
                            </p>
                            <button
                              type="button"
                              onClick={() => setOpenedAddressId(null)}
                              className="shrink-0 rounded-sm border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] font-black text-slate-200 transition hover:bg-white/[0.1]"
                            >
                              닫기
                            </button>
                          </div>
                          <p className="mt-2">{formatDetailedAddress(item)}</p>
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

                    <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:mt-4 sm:gap-2">
                      {item.badges.map((badge) => (
                        <span
                          key={badge}
                          className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-black text-slate-300 sm:px-2 sm:py-1 sm:text-[11px]"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>

                    {item.reviews.snippets.length > 0 ? (
                      <div className="mt-2 max-w-full overflow-hidden sm:mt-4">
                        <button
                          type="button"
                          onClick={() => setReviewPlace(item)}
                          className="grid w-full gap-1 rounded-md border border-white/10 bg-white/[0.035] px-2 py-1.5 text-left transition hover:border-cyan-300/35 hover:bg-cyan-300/[0.06] sm:hidden"
                        >
                          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200/70">
                            추천 리뷰
                          </span>
                          <span className="line-clamp-2 text-[10px] font-semibold leading-4 text-slate-300">
                            {item.reviews.snippets[0]?.text}
                          </span>
                          <span className="text-[10px] font-black text-cyan-100">
                            리뷰 보기
                          </span>
                        </button>
                        <div className="hidden snap-x gap-2 overflow-x-auto pb-1 sm:flex">
                          {item.reviews.snippets.slice(0, 3).map((review, index) => (
                            <blockquote
                              key={`${item.id}-${review.reviewId}-${index}`}
                              className="min-w-[72%] snap-start rounded-md border border-white/10 bg-white/[0.035] px-2 py-1.5 text-[10px] font-semibold leading-4 text-slate-300 sm:min-w-[42%] sm:px-3 sm:py-2 sm:text-xs sm:leading-5 lg:min-w-[30%]"
                            >
                              <span className="line-clamp-1 sm:line-clamp-2">{review.text}</span>
                            </blockquote>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {item.hashtags.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3">
                        {item.hashtags.map((hashtag) => (
                          <span
                            key={hashtag}
                            className="rounded-md bg-blue-400/10 px-2 py-0.5 text-[10px] font-black text-blue-100 sm:px-2.5 sm:py-1 sm:text-xs"
                          >
                            #{hashtag.replace(/^#/, '')}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-2 flex flex-wrap gap-2 sm:mt-4">
                      {item.actions.bookingUrl ? (
                        <a
                          href={item.actions.bookingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded-md border border-cyan-200/40 bg-cyan-100 px-2.5 py-1.5 text-[10px] font-black text-[#07111f] shadow-[0_8px_18px_rgba(103,232,249,0.12)] transition hover:bg-white sm:px-3 sm:py-2 sm:text-xs"
                        >
                          예약
                        </a>
                      ) : null}
                      {item.actions.routeUrl ? (
                        <a
                          href={item.actions.routeUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded-md border border-white/15 bg-white/[0.09] px-2.5 py-1.5 text-[10px] font-black text-white transition hover:bg-white/15 sm:px-3 sm:py-2 sm:text-xs"
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

      {isMounted && reviewPlace
        ? createPortal(
            <ReviewBottomSheet place={reviewPlace} onClose={() => setReviewPlace(null)} />,
            document.body,
          )
        : null}

      {isMounted && historyPlace
        ? createPortal(
            <PlaceHistoryModal
              place={historyPlace}
              rows={historyRows}
              isLoading={isHistoryLoading}
              onClose={() => setHistoryPlace(null)}
            />,
            document.body,
          )
        : null}

      {isMounted && expandedImage
        ? createPortal(
            <ImagePreviewModal
              image={expandedImage}
              onClose={() => setExpandedImage(null)}
            />,
            document.body,
          )
        : null}

      {isMounted && isBatchModalOpen
        ? createPortal(
            <BatchKeywordModal
              keywords={batchKeywords}
              keywordInput={batchKeywordInput}
              isLoading={isBatchLoading}
              onKeywordInputChange={setBatchKeywordInput}
              onSubmit={submitBatchKeyword}
              onRemove={removeBatchKeyword}
              onRefresh={loadBatchKeywords}
              onClose={() => setIsBatchModalOpen(false)}
            />,
            document.body,
          )
        : null}

      {isMounted && snapshotToast
        ? createPortal(
            <SnapshotToastMessage
              toast={snapshotToast}
              onClose={() => setSnapshotToast(null)}
            />,
            document.body,
          )
        : null}
    </div>
  )
}

type SnapshotToastMessageProps = {
  toast: SnapshotToast
  onClose: () => void
}

type BatchKeywordModalProps = {
  keywords: PlaceRankingBatchKeyword[]
  keywordInput: string
  isLoading: boolean
  onKeywordInputChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onRemove: (id: number) => void
  onRefresh: () => void
  onClose: () => void
}

function BatchKeywordModal({
  keywords,
  keywordInput,
  isLoading,
  onKeywordInputChange,
  onSubmit,
  onRemove,
  onRefresh,
  onClose,
}: BatchKeywordModalProps) {
  return (
    <div
      className="fixed inset-0 z-[9998] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="자동 기록 키워드 관리"
      onClick={onClose}
    >
      <section
        className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#070b15] shadow-[0_24px_80px_rgba(0,0,0,0.52)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200/75">
              Daily Tracking
            </p>
            <h3 className="mt-1 text-2xl font-black text-white">자동 기록 키워드 관리</h3>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-400">
              등록된 키워드는 매일 23:50에 자동 조회되고 순위 기록에 저장됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-100 transition hover:bg-white/[0.1]"
          >
            닫기
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto p-5">
          <form onSubmit={onSubmit} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px]">
            <input
              value={keywordInput}
              onChange={(event) => onKeywordInputChange(event.target.value)}
              placeholder="예: 노원 속눈썹펌"
              className="min-h-12 rounded-md border border-white/10 bg-[#090d18] px-3 text-sm font-black text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10"
            />
            <button
              type="submit"
              disabled={!keywordInput.trim() || isLoading}
              className="min-h-12 rounded-md border border-cyan-300/35 bg-cyan-300/12 px-4 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              추가
            </button>
          </form>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200/65">
              등록 키워드 {keywords.length}개
            </p>
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-black text-slate-200 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
            >
              새로고침
            </button>
          </div>

          <div className="mt-3 grid gap-2">
            {keywords.length > 0 ? (
              keywords.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-2 rounded-md border border-white/10 bg-white/[0.04] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-cyan-50">{item.keyword}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      {item.lastRunAt
                        ? `마지막 기록: ${formatBatchRunAt(item.lastRunAt)} · ${formatBatchRunStatus(item.lastRunStatus)}`
                        : '아직 자동 기록 전입니다.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    disabled={isLoading}
                    className="min-h-9 rounded-md border border-white/10 bg-white/[0.05] px-3 text-xs font-black text-slate-200 transition hover:bg-rose-400/15 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    삭제
                  </button>
                </div>
              ))
            ) : (
              <div className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm font-bold text-slate-400">
                자동 기록할 키워드를 추가하면 매일 순위 이력이 쌓입니다.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

function SnapshotToastMessage({ toast, onClose }: SnapshotToastMessageProps) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 2800)

    return () => window.clearTimeout(timer)
  }, [onClose, toast.id])

  const isError = toast.type === 'error'

  return (
    <div
      className={`fixed left-1/2 top-4 z-[10000] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 rounded-md border px-4 py-3 text-sm font-black shadow-[0_18px_44px_rgba(0,0,0,0.38)] backdrop-blur-xl md:bottom-6 md:left-auto md:right-6 md:top-auto md:translate-x-0 ${
        isError
          ? 'border-rose-300/30 bg-rose-500/15 text-rose-100'
          : 'border-cyan-300/30 bg-[#0b1724]/95 text-cyan-100'
      }`}
      role="status"
    >
      <div className="flex items-center justify-between gap-3">
        <span>{toast.message}</span>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-sm border border-white/10 px-2 py-1 text-[10px] text-slate-200 transition hover:bg-white/10"
          aria-label="알림 닫기"
        >
          닫기
        </button>
      </div>
    </div>
  )
}

function RankChangeBadge({ change }: { change?: PlaceRankingItem['rankChange'] | null }) {
  if (!change || change.direction === 'same') {
    return null
  }

  const isUp = change.direction === 'up'

  return (
    <span className={`text-xs font-black ${isUp ? 'text-rose-300' : 'text-blue-300'}`}>
      {change.delta}
      {isUp ? '▲' : '▼'}
    </span>
  )
}

type PlaceHistoryModalProps = {
  place: PlaceRankingItem
  rows: PlaceRankingSnapshotHistoryResponse['history']
  isLoading: boolean
  onClose: () => void
}

function PlaceHistoryModal({ place, rows, isLoading, onClose }: PlaceHistoryModalProps) {
  const isOutsideStoredRange = place.rank > 100

  return (
    <div
      className="fixed inset-0 z-[9998] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${place.name} 순위 이력`}
      onClick={onClose}
    >
      <div
        className="max-h-[82vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#070b15] shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200/75">
              Ranking History
            </p>
            <h3 className="mt-1 truncate text-2xl font-black text-white">{place.name}</h3>
            <p className="mt-1 text-sm font-bold text-cyan-100/75">{place.category}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-100"
          >
            닫기
          </button>
        </div>

        <div className="max-h-[calc(82vh-7rem)] overflow-y-auto p-5">
          {isOutsideStoredRange ? (
            <div className="mb-4 rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] p-4 text-sm font-black text-cyan-100">
              현재 조회 결과는 100위권 밖입니다. 순위 기록은 100위까지 저장됩니다.
            </div>
          ) : null}
          {isLoading ? (
            <div className="rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] p-4 text-sm font-black text-cyan-100">
              순위 이력을 불러오고 있습니다.
            </div>
          ) : rows.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-white/10">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-white/[0.06] text-xs font-black uppercase tracking-[0.12em] text-cyan-100/75">
                  <tr>
                    <th className="px-4 py-3">날짜</th>
                    <th className="px-4 py-3">순위</th>
                    <th className="px-4 py-3">변화</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {rows.map((row) => (
                    <tr key={row.snapshotDate} className="text-slate-200">
                      <td className="px-4 py-3 font-bold">{formatSnapshotDate(row.snapshotDate)}</td>
                      <td className="px-4 py-3 font-black">{formatRankLabel(row.rank)}</td>
                      <td className="px-4 py-3">
                        <RankChangeText change={row.change} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm font-bold text-slate-300">
              아직 저장된 순위 이력이 없습니다. 조회 결과에서 오늘 순위 기록을 먼저 저장해주세요.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type ReviewBottomSheetProps = {
  place: PlaceRankingItem
  onClose: () => void
}

function ReviewBottomSheet({ place, onClose }: ReviewBottomSheetProps) {
  const reviews = place.reviews.snippets.slice(0, 3)

  return (
    <div
      className="fixed inset-0 z-[9998] grid place-items-center bg-black/65 p-5 backdrop-blur-sm sm:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={`${place.name} 추천 리뷰 보기`}
      onClick={onClose}
    >
      <div
        className="max-h-[72vh] w-full max-w-[24rem] overflow-hidden rounded-2xl border border-white/10 bg-[#070b15] shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/10 bg-[#070b15]/95 px-4 py-4 backdrop-blur">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200/75">
              추천 리뷰
            </p>
            <h3 className="mt-1 truncate text-lg font-black text-white">{place.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-100"
          >
            닫기
          </button>
        </div>

        <div className="max-h-[calc(72vh-5.5rem)] overflow-y-auto px-4 py-4">
          <div className="grid gap-3">
            {reviews.map((review, index) => (
              <article
                key={`${place.id}-sheet-review-${review.reviewId}-${index}`}
                className="rounded-md border border-white/10 bg-white/[0.045] p-3"
              >
                <p className="text-[11px] font-black text-cyan-100/80">
                  {index + 1}번째 추천 리뷰
                </p>
                <p className="mt-2 whitespace-pre-wrap break-keep text-sm font-semibold leading-6 text-slate-200">
                  {review.text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

type ImagePreviewModalProps = {
  image: {
    src: string
    alt: string
  }
  onClose: () => void
}

function ImagePreviewModal({ image, onClose }: ImagePreviewModalProps) {
  return (
    <div
      className="fixed inset-0 z-[9999] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="이미지 확대 보기"
      onClick={onClose}
    >
      <div
        className="relative grid h-[min(76vh,620px)] w-[min(88vw,760px)] place-items-center rounded-md border border-white/10 bg-[#050812] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.5)] md:h-[min(72vh,620px)] md:w-[min(76vw,780px)] md:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-md border border-white/20 bg-black/70 px-3 py-2 text-sm font-black text-white backdrop-blur transition hover:bg-black/85 md:right-4 md:top-4"
        >
          닫기
        </button>
        <img
          src={image.src}
          alt={image.alt}
          className="max-h-[calc(76vh-2rem)] max-w-full rounded-md object-contain md:max-h-[560px]"
        />
      </div>
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

function readRecentPlaceRankingKeywords() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(recentPlaceRankingStorageKey) ?? '[]',
    )

    return Array.isArray(parsed)
      ? parsed.filter((keyword): keyword is string => typeof keyword === 'string').slice(0, maxRecentKeywords)
      : []
  } catch {
    return []
  }
}

function saveRecentPlaceRankingKeyword(keyword: string) {
  if (typeof window === 'undefined') {
    return []
  }

  const trimmedKeyword = keyword.trim()
  const nextKeywords = [
    trimmedKeyword,
    ...readRecentPlaceRankingKeywords().filter((recentKeyword) => recentKeyword !== trimmedKeyword),
  ].slice(0, maxRecentKeywords)

  window.localStorage.setItem(recentPlaceRankingStorageKey, JSON.stringify(nextKeywords))

  return nextKeywords
}

function deleteRecentPlaceRankingKeyword(keyword: string) {
  if (typeof window === 'undefined') {
    return []
  }

  const nextKeywords = readRecentPlaceRankingKeywords().filter(
    (recentKeyword) => recentKeyword !== keyword,
  )

  window.localStorage.setItem(recentPlaceRankingStorageKey, JSON.stringify(nextKeywords))

  return nextKeywords
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

function formatSnapshotDate(value: string) {
  const date = new Date(`${value}T00:00:00+09:00`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString('sv-SE', {
    timeZone: 'Asia/Seoul',
  })
}

function formatBatchRunAt(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatBatchRunStatus(value: string | null) {
  if (value === 'success') {
    return '성공'
  }

  if (value === 'failed') {
    return '실패'
  }

  return '대기'
}

function RankChangeText({ change }: { change?: PlaceRankingItem['rankChange'] | null }) {
  if (!change || change.direction === 'same') {
    return <span className="font-bold text-slate-500">-</span>
  }

  const isUp = change.direction === 'up'

  return (
    <span className={`font-black ${isUp ? 'text-rose-300' : 'text-blue-300'}`}>
      {change.delta}
      {isUp ? '▲' : '▼'}
    </span>
  )
}

function formatRankLabel(rank: number) {
  return rank > 100 ? '100위권 밖' : `${rank}위`
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
