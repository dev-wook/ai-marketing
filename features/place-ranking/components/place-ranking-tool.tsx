'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RecentSearchList, ToolLoadingPanel } from '@/features/platform/components/tool-ui'
import { useBodyScrollLock } from '@/features/platform/components/use-body-scroll-lock'
import type {
  PlaceBookingCalendarResponse,
  PlaceBookingProduct,
  PlaceBookingSlot,
  PlaceBookingSummaryItem,
  PlaceBookingSummaryResponse,
  PlaceBookingStatusResponse,
  PlaceRankingBlacklistEntry,
  PlaceRankingBlacklistGroup,
  PlaceRankingBlacklistResponse,
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

const fetchLimit = 75
const initialVisibleCount = fetchLimit
const bookingTopLimit = 30
const recentPlaceRankingStorageKey = 'aiva:recent-place-ranking-keywords'
const maxRecentKeywords = 5
const calendarWeekdayLabels = ['일', '월', '화', '수', '목', '금', '토']
const placeActionButtonClass =
  'inline-flex h-9 w-full items-center justify-center whitespace-nowrap rounded-md px-0 text-[11px] font-black leading-none transition sm:w-[4.75rem] sm:text-[12px]'

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

async function requestBookingStatus({
  place,
  date,
}: {
  place: PlaceRankingItem
  date: string
}) {
  const response = await fetch('/api/place-ranking/booking-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bookingUrl: place.actions.bookingUrl,
      bookingBusinessId: place.actions.bookingBusinessId,
      date,
    }),
  })
  const body = (await response.json()) as PlaceBookingStatusResponse | PlaceRankingErrorBody

  if (!response.ok) {
    const errorBody = body as PlaceRankingErrorBody
    const error = new Error(errorBody.message ?? '예약현황 조회에 실패했습니다.')

    Object.assign(error, {
      debug: errorBody.debug,
    })

    throw error
  }

  return body as PlaceBookingStatusResponse
}

async function requestBookingCalendar({
  place,
  yearMonth,
}: {
  place: PlaceRankingItem
  yearMonth: string
}) {
  const response = await fetch('/api/place-ranking/booking-calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bookingUrl: place.actions.bookingUrl,
      bookingBusinessId: place.actions.bookingBusinessId,
      yearMonth,
    }),
  })
  const body = (await response.json()) as
    | PlaceBookingCalendarResponse
    | PlaceRankingErrorBody

  if (!response.ok) {
    const errorBody = body as PlaceRankingErrorBody
    const error = new Error(errorBody.message ?? '예약 캘린더 조회에 실패했습니다.')

    Object.assign(error, {
      debug: errorBody.debug,
    })

    throw error
  }

  return body as PlaceBookingCalendarResponse
}

async function requestBookingSummaries({
  result,
  date,
  excludePlaceKeys = [],
}: {
  result: PlaceRankingResponse
  date: string
  excludePlaceKeys?: string[]
}) {
  const response = await fetch('/api/place-ranking/booking-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date,
      items: result.items.map((item) => ({
        placeId: item.id,
        rank: item.rank,
        name: item.name,
        category: item.category,
        bookingUrl: item.actions.bookingUrl,
        bookingBusinessId: item.actions.bookingBusinessId,
      })),
      excludePlaceKeys,
    }),
  })
  const body = (await response.json()) as PlaceBookingSummaryResponse | PlaceRankingErrorBody

  if (!response.ok) {
    const errorBody = body as PlaceRankingErrorBody
    const error = new Error(errorBody.message ?? '오늘 예약 현황 조회에 실패했습니다.')

    Object.assign(error, {
      debug: errorBody.debug,
    })

    throw error
  }

  return body as PlaceBookingSummaryResponse
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

async function requestBlacklistEntries(keyword: string) {
  const params = new URLSearchParams({ keyword })
  const response = await fetch(`/api/place-ranking/blacklist?${params.toString()}`)
  const body = (await response.json()) as PlaceRankingBlacklistResponse | PlaceRankingErrorBody

  if (!response.ok) {
    const errorBody = body as PlaceRankingErrorBody
    const error = new Error(errorBody.message ?? '제외 목록 조회에 실패했습니다.')

    Object.assign(error, {
      debug: errorBody.debug,
    })

    throw error
  }

  return (body as PlaceRankingBlacklistResponse).entries ?? []
}

async function requestBlacklistGroups() {
  const response = await fetch('/api/place-ranking/blacklist')
  const body = (await response.json()) as PlaceRankingBlacklistResponse | PlaceRankingErrorBody

  if (!response.ok) {
    const errorBody = body as PlaceRankingErrorBody
    const error = new Error(errorBody.message ?? '제외 목록 조회에 실패했습니다.')

    Object.assign(error, {
      debug: errorBody.debug,
    })

    throw error
  }

  return (body as PlaceRankingBlacklistResponse).groups ?? []
}

async function requestAddBlacklistEntry({
  keyword,
  place,
}: {
  keyword: string
  place: PlaceBookingSummaryItem
}) {
  const response = await fetch('/api/place-ranking/blacklist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      keyword,
      placeKey: createPlaceBlacklistKey(place.placeId, place.name),
      placeId: place.placeId,
      placeName: place.name,
      category: place.category,
    }),
  })
  const body = (await response.json()) as
    | { entry: PlaceRankingBlacklistEntry }
    | PlaceRankingErrorBody

  if (!response.ok) {
    const errorBody = body as PlaceRankingErrorBody
    const error = new Error(errorBody.message ?? '제외 목록 등록에 실패했습니다.')

    Object.assign(error, {
      debug: errorBody.debug,
    })

    throw error
  }

  return (body as { entry: PlaceRankingBlacklistEntry }).entry
}

async function requestDeleteBlacklistEntry(id: number) {
  const response = await fetch('/api/place-ranking/blacklist', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  const body = (await response.json()) as { ok: boolean } | PlaceRankingErrorBody

  if (!response.ok) {
    const errorBody = body as PlaceRankingErrorBody
    const error = new Error(errorBody.message ?? '제외 목록 삭제에 실패했습니다.')

    Object.assign(error, {
      debug: errorBody.debug,
    })

    throw error
  }

  return body as { ok: boolean }
}

async function requestDeleteBlacklistPlace({
  keyword,
  placeKey,
}: {
  keyword: string
  placeKey: string
}) {
  const response = await fetch('/api/place-ranking/blacklist', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword, placeKey }),
  })
  const body = (await response.json()) as { ok: boolean } | PlaceRankingErrorBody

  if (!response.ok) {
    const errorBody = body as PlaceRankingErrorBody
    const error = new Error(errorBody.message ?? '제외 목록 삭제에 실패했습니다.')

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
  const [shouldScrollToResult, setShouldScrollToResult] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [errorLog, setErrorLog] = useState('')
  const [openedAddressId, setOpenedAddressId] = useState<string | null>(null)
  const [placeNameFilterInput, setPlaceNameFilterInput] = useState('')
  const [appliedPlaceNameFilter, setAppliedPlaceNameFilter] = useState('')
  const [placeNameFilterNotice, setPlaceNameFilterNotice] = useState('')
  const [recentKeywords, setRecentKeywords] = useState<string[]>([])
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null)
  const [reviewPlace, setReviewPlace] = useState<PlaceRankingItem | null>(null)
  const [bookingPlace, setBookingPlace] = useState<PlaceRankingItem | null>(null)
  const [bookingDate, setBookingDate] = useState(getTodayKstDate())
  const [bookingStatus, setBookingStatus] = useState<PlaceBookingStatusResponse | null>(null)
  const [selectedBookingProductId, setSelectedBookingProductId] = useState<string | null>(null)
  const [isBookingLoading, setIsBookingLoading] = useState(false)
  const [bookingErrorMessage, setBookingErrorMessage] = useState('')
  const [bookingErrorLog, setBookingErrorLog] = useState('')
  const [bookingSummaries, setBookingSummaries] = useState<Record<string, PlaceBookingSummaryItem>>({})
  const [bookingSummaryDate, setBookingSummaryDate] = useState(getTodayKstDate())
  const [isBookingSummaryLoading, setIsBookingSummaryLoading] = useState(false)
  const [bookingSummaryError, setBookingSummaryError] = useState('')
  const [blacklistEntries, setBlacklistEntries] = useState<PlaceRankingBlacklistEntry[]>([])
  const [blacklistGroups, setBlacklistGroups] = useState<PlaceRankingBlacklistGroup[]>([])
  const [isBlacklistLoading, setIsBlacklistLoading] = useState(false)
  const [isBlacklistModalOpen, setIsBlacklistModalOpen] = useState(false)
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
  const keywordInputRef = useRef<HTMLInputElement | null>(null)
  const resultSectionRef = useRef<HTMLElement | null>(null)
  const rankingListStartRef = useRef<HTMLDivElement | null>(null)

  const canSubmit = useMemo(
    () => keyword.trim().length > 0 && !isLoading,
    [isLoading, keyword],
  )
  const bookingSummaryList = useMemo(() => {
    return Object.values(bookingSummaries)
      .filter((summary) => summary.status === 'ready')
      .sort((left, right) => {
        if (right.bookedSlots !== left.bookedSlots) {
          return right.bookedSlots - left.bookedSlots
        }

        return left.rank - right.rank
      })
  }, [bookingSummaries])
  const blacklistPlaceKeys = useMemo(() => {
    return new Set(blacklistEntries.map((entry) => entry.placeKey))
  }, [blacklistEntries])
  const visibleBookingSummaryList = useMemo(() => {
    return bookingSummaryList.filter(
      (summary) => !blacklistPlaceKeys.has(createPlaceBlacklistKey(summary.placeId, summary.name)),
    )
  }, [blacklistPlaceKeys, bookingSummaryList])
  const visibleBookingTop = useMemo(() => {
    return visibleBookingSummaryList.slice(0, bookingTopLimit)
  }, [visibleBookingSummaryList])
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
  useEffect(() => {
    setIsMounted(true)
    setRecentKeywords(readRecentPlaceRankingKeywords())
  }, [])

  useBodyScrollLock(
    Boolean(expandedImage || reviewPlace || bookingPlace || historyPlace || isBatchModalOpen || isBlacklistModalOpen),
  )

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
    if (!shouldScrollToResult || !result || isLoading) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      const scrollTarget = rankingListStartRef.current ?? resultSectionRef.current

      scrollTarget?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
      setShouldScrollToResult(false)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [isLoading, result, shouldScrollToResult])

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
    setShouldScrollToResult(false)
    setOpenedAddressId(null)
    setPlaceNameFilterInput('')
    setAppliedPlaceNameFilter('')
    setPlaceNameFilterNotice('')
    setExpandedImage(null)
    setReviewPlace(null)
    setBookingPlace(null)
    setBookingStatus(null)
    setBookingErrorMessage('')
    setBookingErrorLog('')
    setBookingSummaries({})
    setBookingSummaryDate(getTodayKstDate())
    setBookingSummaryError('')
    setBlacklistEntries([])
    setBlacklistGroups([])
    setHistoryPlace(null)
    setHistoryRows([])
    setSnapshotToast(null)
    setVisibleCount(initialVisibleCount)

    try {
      const nextResult = await requestRankings(nextKeyword, fetchLimit)
      let nextBlacklistEntries: PlaceRankingBlacklistEntry[] = []

      try {
        nextBlacklistEntries = await requestBlacklistEntries(nextResult.keyword)
      } catch (error) {
        showSnapshotToast({
          type: 'error',
          message: error instanceof Error ? error.message : '제외 목록 조회에 실패했습니다.',
        })
      }

      setResult(nextResult)
      setShouldScrollToResult(true)
      setVisibleCount(Math.min(initialVisibleCount, nextResult.items.length))
      setRecentKeywords(saveRecentPlaceRankingKeyword(nextKeyword))
      setBlacklistEntries(nextBlacklistEntries)
      void loadBookingSummaries(
        nextResult,
        getTodayKstDate(),
        nextBlacklistEntries.map((entry) => entry.placeKey),
      )
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

  const submitPlaceNameFilter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextFilter = placeNameFilterInput.trim()

    setAppliedPlaceNameFilter(nextFilter)

    if (!nextFilter) {
      setPlaceNameFilterNotice('')
      return
    }

    if (!result) {
      setPlaceNameFilterNotice('')
      return
    }

    const filterText = nextFilter.toLocaleLowerCase('ko-KR')
    const currentMatchCount = result.items.filter((item) =>
      item.name.toLocaleLowerCase('ko-KR').includes(filterText),
    ).length

    if (currentMatchCount > 0) {
      setPlaceNameFilterNotice('')
      return
    }

    setPlaceNameFilterNotice(
      `조회된 ${result.items.length}위 결과 안에서 일치하는 플레이스명이 없습니다.`,
    )
  }

  const clearPlaceNameFilter = () => {
    setPlaceNameFilterInput('')
    setAppliedPlaceNameFilter('')
    setPlaceNameFilterNotice('')
  }

  const scrollToPageTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
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

  const openBookingStatus = async (place: PlaceRankingItem, nextDate = getTodayKstDate()) => {
    setBookingPlace(place)
    setBookingDate(nextDate)
    setBookingStatus(null)
    setSelectedBookingProductId(null)
    setBookingErrorMessage('')
    setBookingErrorLog('')
    setIsBookingLoading(true)

    try {
      const response = await requestBookingStatus({ place, date: nextDate })

      setBookingStatus(response)
      setSelectedBookingProductId(response.products[0]?.id ?? null)
    } catch (error) {
      setBookingErrorLog(toReadableErrorLog(readErrorDebug(error)))
      setBookingErrorMessage(
        error instanceof Error ? error.message : '예약현황 조회에 실패했습니다.',
      )
    } finally {
      setIsBookingLoading(false)
    }
  }

  const changeBookingDate = async (nextDate: string) => {
    if (!bookingPlace) {
      return
    }

    await openBookingStatus(bookingPlace, nextDate)
  }

  const loadBookingSummaries = async (
    nextResult: PlaceRankingResponse,
    date = getTodayKstDate(),
    excludePlaceKeys: Iterable<string> = blacklistEntries.map((entry) => entry.placeKey),
  ) => {
    const bookingTargets = nextResult.items.filter(
      (item) => item.actions.bookingUrl || item.actions.bookingBusinessId,
    )

    if (bookingTargets.length === 0) {
      setBookingSummaries({})
      setBookingSummaryError('')
      return
    }

    setIsBookingSummaryLoading(true)
    setBookingSummaryError('')

    try {
      const response = await requestBookingSummaries({
        result: nextResult,
        date,
        excludePlaceKeys: Array.from(excludePlaceKeys),
      })

      setBookingSummaries(response.summaries)
      setBookingSummaryDate(response.date)
    } catch (error) {
      setBookingSummaries({})
      setBookingSummaryError(
        error instanceof Error ? error.message : '오늘 예약 현황 조회에 실패했습니다.',
      )
    } finally {
      setIsBookingSummaryLoading(false)
    }
  }

  const changeBookingSummaryDate = async (nextDate: string) => {
    if (!result) {
      return
    }

    setBookingSummaryDate(nextDate)
    await loadBookingSummaries(result, nextDate)
  }

  const loadBlacklistEntries = async (targetKeyword: string) => {
    setIsBlacklistLoading(true)

    try {
      setBlacklistEntries(await requestBlacklistEntries(targetKeyword))
    } catch (error) {
      showSnapshotToast({
        type: 'error',
        message: error instanceof Error ? error.message : '제외 목록 조회에 실패했습니다.',
      })
    } finally {
      setIsBlacklistLoading(false)
    }
  }

  const loadBlacklistGroups = async () => {
    setIsBlacklistLoading(true)

    try {
      setBlacklistGroups(await requestBlacklistGroups())
    } catch (error) {
      showSnapshotToast({
        type: 'error',
        message: error instanceof Error ? error.message : '제외 목록 조회에 실패했습니다.',
      })
    } finally {
      setIsBlacklistLoading(false)
    }
  }

  const addBookingTopBlacklist = async (place: PlaceBookingSummaryItem) => {
    if (!result || isBlacklistLoading) {
      return
    }

    setIsBlacklistLoading(true)

    try {
      const entry = await requestAddBlacklistEntry({
        keyword: result.keyword,
        place,
      })

      setBlacklistEntries((current) => {
        const nextEntries = new Map(current.map((entry) => [entry.placeKey, entry]))

        nextEntries.set(entry.placeKey, entry)

        return Array.from(nextEntries.values())
      })
    } catch (error) {
      showSnapshotToast({
        type: 'error',
        message: error instanceof Error ? error.message : '제외 목록 등록에 실패했습니다.',
      })
      throw error
    } finally {
      setIsBlacklistLoading(false)
    }
  }

  const removeBookingTopBlacklist = async (place: PlaceBookingSummaryItem) => {
    if (!result || isBlacklistLoading) {
      return
    }

    const placeKey = createPlaceBlacklistKey(place.placeId, place.name)

    setIsBlacklistLoading(true)

    try {
      await requestDeleteBlacklistPlace({
        keyword: result.keyword,
        placeKey,
      })

      setBlacklistEntries((current) => current.filter((entry) => entry.placeKey !== placeKey))
      setBlacklistGroups((current) =>
        current
          .map((group) => ({
            ...group,
            entries: group.entries.filter((entry) => entry.placeKey !== placeKey),
          }))
          .filter((group) => group.entries.length > 0)
          .map((group) => ({
            ...group,
            count: group.entries.length,
          })),
      )
    } catch (error) {
      showSnapshotToast({
        type: 'error',
        message: error instanceof Error ? error.message : '제외 목록 삭제에 실패했습니다.',
      })
      throw error
    } finally {
      setIsBlacklistLoading(false)
    }
  }

  const applyBookingTopBlacklist = async (places: PlaceBookingSummaryItem[]) => {
    if (!result || isBlacklistLoading || places.length === 0) {
      return
    }

    setIsBlacklistLoading(true)

    try {
      const excludePlaceKeys = new Set(blacklistEntries.map((entry) => entry.placeKey))

      places.forEach((place) => {
        excludePlaceKeys.add(createPlaceBlacklistKey(place.placeId, place.name))
      })

      await loadBookingSummaries(result, bookingSummaryDate, excludePlaceKeys)
      showSnapshotToast({
        type: 'success',
        message: '제외 조건을 반영해 순위를 재산정했습니다.',
      })
    } catch (error) {
      showSnapshotToast({
        type: 'error',
        message: error instanceof Error ? error.message : '순위 재산정에 실패했습니다.',
      })
    } finally {
      setIsBlacklistLoading(false)
    }
  }

  const removeBlacklistEntry = async (entry: PlaceRankingBlacklistEntry) => {
    if (isBlacklistLoading) {
      return
    }

    setIsBlacklistLoading(true)

    try {
      await requestDeleteBlacklistEntry(entry.id)
      setBlacklistEntries((current) => current.filter((item) => item.id !== entry.id))
      setBlacklistGroups((current) =>
        current
          .map((group) => ({
            ...group,
            entries: group.entries.filter((item) => item.id !== entry.id),
          }))
          .filter((group) => group.entries.length > 0)
          .map((group) => ({ ...group, count: group.entries.length })),
      )
      showSnapshotToast({
        type: 'success',
        message: '제외 목록에서 삭제했습니다.',
      })
    } catch (error) {
      showSnapshotToast({
        type: 'error',
        message: error instanceof Error ? error.message : '제외 목록 삭제에 실패했습니다.',
      })
    } finally {
      setIsBlacklistLoading(false)
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

  const clearKeywordInput = () => {
    setKeyword('')
    setErrorMessage('')
    setErrorLog('')
    keywordInputRef.current?.focus()
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl content-start pt-4 pb-6 md:content-center md:py-6">
      <section className="text-center">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200/80">
          Naver Place Ranking
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-normal md:mt-3 md:text-5xl">
          네이버 플레이스 순위를 실시간으로 조회하세요
        </h2>
        <p className="mx-auto mt-3 max-w-4xl text-sm font-semibold leading-6 text-slate-300 md:mt-4 md:text-base md:leading-7">
          키워드 기준으로 네이버 플레이스 실시간 노출 순위를 확인합니다.
        </p>

        <form
          onSubmit={submitKeyword}
          className="mx-auto mt-4 max-w-3xl rounded-md border border-white/10 bg-white/[0.06] p-3 shadow-[0_22px_50px_rgba(0,0,0,0.24)] backdrop-blur-xl md:mt-6"
        >
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <input
                ref={keywordInputRef}
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value)
                  setErrorMessage('')
                  setErrorLog('')
                }}
                placeholder="예: 노원 속눈썹펌"
                className="min-h-14 w-full rounded-md border border-white/10 bg-[#090d18] py-0 pl-4 pr-12 text-lg font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10"
                disabled={isLoading}
              />
              {keyword ? (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={clearKeywordInput}
                  aria-label="검색어 전체 삭제"
                  className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-xl font-black leading-none text-slate-500 transition hover:bg-white/[0.08] hover:text-cyan-100"
                >
                  ×
                </button>
              ) : null}
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              className="min-h-14 rounded-md bg-white px-7 text-base font-black text-[#070a12] shadow-[0_0_26px_rgba(34,211,238,0.2)] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isLoading ? '조회 중' : '실시간 조회'}
            </button>
          </div>
        </form>

        <RecentSearchList
          className="mx-auto mt-4 max-w-3xl"
          disabled={isLoading}
          keywords={recentKeywords}
          onRemove={removeRecentKeyword}
          onSelect={applyRecentKeyword}
        />

        {!keyword.trim() && errorMessage ? (
          <p className="mx-auto mt-3 max-w-3xl text-left text-sm font-bold text-rose-200">
            {errorMessage}
          </p>
        ) : null}
      </section>

      {isLoading ? (
        <ToolLoadingPanel
          className="mx-auto mt-8 w-full max-w-5xl"
          eyebrow="Searching"
          step={loadingStep}
          steps={loadingSteps}
          subtitle="네이버 플레이스 데이터를 확인해 순위와 리뷰 정보를 정리합니다."
          title="플레이스 순위를 조회하는 중입니다"
        />
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
        <section
          ref={resultSectionRef}
          className="mx-auto mt-9 w-full max-w-6xl scroll-mt-28 rounded-md border border-white/10 bg-white/[0.07] p-5 text-left shadow-[0_22px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl"
        >
          <div className="flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">
                Result
              </p>
              <h3 className="mt-2 text-2xl font-black">네이버 플레이스 순위 조회 결과</h3>
              <p className="mt-2 text-sm font-bold text-slate-400">
                {result.items.length > 0
                  ? `조회가 완료되었습니다. 총 ${result.items.length.toLocaleString('ko-KR')}개의 플레이스를 찾았습니다.`
                  : '검색 결과가 없습니다.'}
              </p>
            </div>
            <div className="grid gap-2 md:justify-items-end">
              <span className="w-fit rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-black text-slate-300">
                기준 키워드: {result.keyword}
              </span>
              <span className="text-xs font-bold text-slate-500">
                조회 시각: {formatCollectedAt(result.collectedAt)}
                {result.source === 'cache' ? ' · 캐시 응답' : ''}
                {result.source === 'local-fallback' ? ' · 지역검색 대체 응답' : ''}
              </span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={saveTodaySnapshot}
                  disabled={
                    isSavingSnapshot || result.items.length === 0 || result.source === 'local-fallback'
                  }
                  className="min-h-11 rounded-md border border-cyan-300/35 bg-cyan-300/12 px-4 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {result.source === 'local-fallback'
                    ? '대체 결과 기록 불가'
                    : isSavingSnapshot
                      ? '기록 중'
                      : '오늘 순위 기록'}
                </button>
              </div>
            </div>
          </div>

          {result.warning ? (
            <div className="mt-4 rounded-md border border-fuchsia-300/25 bg-fuchsia-300/[0.08] p-3 text-sm font-bold leading-6 text-fuchsia-50">
              {result.warning}
            </div>
          ) : null}

          <BookingTopBoard
            top={visibleBookingTop}
            allSummaries={bookingSummaryList}
            keyword={result.keyword}
            date={bookingSummaryDate}
            isLoading={isBookingSummaryLoading}
            errorMessage={bookingSummaryError}
            blacklistCount={blacklistEntries.length}
            blacklistPlaceKeys={blacklistPlaceKeys}
            isBlacklistLoading={isBlacklistLoading}
            onDateChange={changeBookingSummaryDate}
            onAddBlacklistPlace={addBookingTopBlacklist}
            onRemoveBlacklistPlace={removeBookingTopBlacklist}
            onApplyBlacklist={applyBookingTopBlacklist}
            onOpenBlacklistManagement={() => {
              setIsBlacklistModalOpen(true)
              loadBlacklistGroups()
            }}
          />

          <form
            onSubmit={submitPlaceNameFilter}
            className="mt-5 flex flex-col gap-3 rounded-md border border-white/10 bg-[#080c17]/45 p-3 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200/70">
                Filter
              </p>
              <p className="mt-1 text-sm font-bold text-slate-400">
                현재 조회된 최대 75위 결과 안에서 플레이스명을 빠르게 찾습니다.
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
            <div className="mt-3 grid gap-2">
              <p className="text-sm font-bold text-slate-400">
                "{appliedPlaceNameFilter}" 검색 결과 {filteredItems.length}개 · 현재 확인 범위{' '}
                {visibleItems.length}위까지
              </p>
              {placeNameFilterNotice ? (
                <p className="rounded-md border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-2 text-xs font-black leading-5 text-cyan-100">
                  {placeNameFilterNotice}
                </p>
              ) : null}
            </div>
          ) : null}

          <div ref={rankingListStartRef} className="scroll-mt-28" />

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
                    <BookingCountBadge
                      summary={bookingSummaries[item.id]}
                      isLoading={
                        isBookingSummaryLoading &&
                        Boolean(item.actions.bookingUrl || item.actions.bookingBusinessId)
                      }
                    />
                    <p className="mt-0.5 text-xs font-bold leading-snug text-cyan-100/80 sm:mt-1 sm:text-sm">
                      {item.category}
                    </p>
                    <PlaceAddressDisclosure
                      isOpen={openedAddressId === item.id}
                      item={item}
                      onClose={() => setOpenedAddressId(null)}
                      onToggle={() =>
                        setOpenedAddressId((current) => (current === item.id ? null : item.id))
                      }
                    />

                    <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:mt-4 sm:gap-2">
                      {item.badges.filter((badge) => badge !== '메뉴').map((badge) => (
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

                    <div className="mt-2 grid max-w-[16.5rem] grid-cols-3 gap-2 sm:mt-4 sm:flex sm:max-w-none sm:flex-wrap">
                      {item.actions.bookingUrl ? (
                        <button
                          type="button"
                          onClick={() => openBookingStatus(item)}
                          className={`${placeActionButtonClass} border border-cyan-300/35 bg-cyan-300/[0.08] text-cyan-50 hover:bg-cyan-300/[0.14]`}
                        >
                          예약현황
                        </button>
                      ) : null}
                      {item.actions.bookingUrl ? (
                        <button
                          type="button"
                          onClick={() => openExternalUrl(item.actions.bookingUrl)}
                          className={`${placeActionButtonClass} border border-cyan-300/25 bg-cyan-300/[0.06] text-cyan-50 hover:bg-cyan-300/[0.12]`}
                        >
                          예약
                        </button>
                      ) : null}
                      {item.actions.routeUrl ? (
                        <button
                          type="button"
                          onClick={() => openExternalUrl(item.actions.routeUrl)}
                          className={`${placeActionButtonClass} border border-white/15 bg-white/[0.06] text-slate-100 hover:bg-white/[0.12]`}
                        >
                          길찾기
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {filteredItems.length === 0 ? (
            <div className="mt-5 rounded-md border border-white/10 bg-[#080c17]/70 p-5 text-center text-sm font-black text-slate-300">
              {appliedPlaceNameFilter
                ? `조회된 ${visibleItems.length}위 결과 안에서 일치하는 플레이스명이 없습니다.`
                : `${visibleItems.length}위까지 확인했지만 일치하는 플레이스명이 없습니다.`}
            </div>
          ) : null}

          <PlaceRankingResultFooter onTopClick={scrollToPageTop} />
        </section>
      ) : null}

      {isMounted && reviewPlace
        ? createPortal(
            <ReviewBottomSheet place={reviewPlace} onClose={() => setReviewPlace(null)} />,
            document.body,
          )
        : null}

      {isMounted && bookingPlace
        ? createPortal(
            <BookingStatusModal
              place={bookingPlace}
              date={bookingDate}
              status={bookingStatus}
              selectedProductId={selectedBookingProductId}
              isLoading={isBookingLoading}
              errorMessage={bookingErrorMessage}
              errorLog={bookingErrorLog}
              onDateChange={changeBookingDate}
              onProductChange={setSelectedBookingProductId}
              onRetry={() => openBookingStatus(bookingPlace, bookingDate)}
              onClose={() => setBookingPlace(null)}
            />,
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

      {isMounted && isBlacklistModalOpen
        ? createPortal(
            <BlacklistManagementModal
              groups={blacklistGroups}
              isLoading={isBlacklistLoading}
              onRemove={removeBlacklistEntry}
              onRefresh={loadBlacklistGroups}
              onClose={() => setIsBlacklistModalOpen(false)}
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

function PlaceRankingResultFooter({ onTopClick }: { onTopClick: () => void }) {
  return (
    <div className="mt-6 border-t border-white/10 pt-4">
      <p className="text-sm font-bold text-slate-400">
        ⓘ 최대 75개의 검색결과를 제공합니다.
      </p>
      <button
        type="button"
        onClick={onTopClick}
        className="mx-auto mt-5 flex min-h-10 items-center justify-center gap-1 rounded-md px-4 text-sm font-black text-slate-200 transition hover:bg-white/[0.06] hover:text-white"
      >
        <span className="text-base text-blue-400">↑</span>
        TOP
      </button>
    </div>
  )
}

function PlaceAddressDisclosure({
  isOpen,
  item,
  onClose,
  onToggle,
}: {
  isOpen: boolean
  item: PlaceRankingItem
  onClose: () => void
  onToggle: () => void
}) {
  const addressRef = useRef<HTMLSpanElement | null>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    const addressElement = addressRef.current

    if (!addressElement) {
      return
    }

    const updateOverflowState = () => {
      setIsOverflowing(addressElement.scrollWidth > addressElement.clientWidth + 1)
    }

    updateOverflowState()

    const resizeObserver = new ResizeObserver(updateOverflowState)
    resizeObserver.observe(addressElement)

    return () => resizeObserver.disconnect()
  }, [item.id])

  return (
    <div className="relative mt-2 min-w-0 sm:mt-3">
      <button
        type="button"
        onClick={onToggle}
        disabled={!isOverflowing}
        className="flex max-w-full items-center gap-1 text-left text-[10px] font-bold leading-snug text-slate-300 transition enabled:hover:text-cyan-100 sm:text-sm"
        aria-expanded={isOverflowing ? isOpen : undefined}
      >
        <span ref={addressRef} className="min-w-0 truncate">
          {formatShortAddress(item)}
        </span>
        {isOverflowing ? (
          <span
            className={`relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-cyan-200/80 transition sm:h-5 sm:w-5 ${
              isOpen ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          >
            <span className="block h-1.5 w-1.5 translate-y-[-1px] rotate-45 border-b-2 border-r-2 border-current sm:h-2 sm:w-2" />
          </span>
        ) : null}
      </button>

      {isOpen && isOverflowing ? (
        <div className="absolute left-0 z-30 mt-2 w-[min(16rem,100%)] rounded-md border border-cyan-300/20 bg-[#0b1220] p-3 text-xs font-bold leading-5 text-slate-200 shadow-[0_18px_36px_rgba(0,0,0,0.35)] sm:w-[min(22rem,calc(100vw-3rem))]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200/70">
              Address
            </p>
            <button
              type="button"
              onClick={onClose}
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
  onClose: () => void
}

function BatchKeywordModal({
  keywords,
  keywordInput,
  isLoading,
  onKeywordInputChange,
  onSubmit,
  onRemove,
  onClose,
}: BatchKeywordModalProps) {
  return (
    <div
      className="fixed inset-0 z-[10020] grid place-items-center bg-black/70 p-2 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="자동 기록 키워드 관리"
      onClick={onClose}
    >
      <section
        className="relative z-10 flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#070b15] shadow-[0_24px_80px_rgba(0,0,0,0.52)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200/75">
              Daily Tracking
            </p>
            <h3 className="mt-1 text-2xl font-black text-white">자동 기록 키워드 관리</h3>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-400">
              등록된 키워드는 매일 22:00 이후 플레이스 순위 기록에 사용됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 shrink-0 touch-manipulation items-center justify-center rounded-md border border-white/10 bg-white/[0.06] px-3 text-xs font-black text-slate-100 transition hover:bg-white/[0.1]"
          >
            닫기
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto p-5" data-aiva-scroll-lock-allow="true">
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
              className="min-h-12 touch-manipulation rounded-md border border-cyan-300/35 bg-cyan-300/12 px-4 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              추가
            </button>
          </form>

          <div className="mt-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200/65">
              등록 키워드 {keywords.length}개
            </p>
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
                    {item.lastRunAt ? (
                      <div className="mt-1 grid gap-0.5 text-xs font-bold text-slate-500">
                        {item.lastRunMessage ? (
                          <p className="truncate text-slate-400">{item.lastRunMessage}</p>
                        ) : null}
                        <p>
                          실행 시각: {formatBatchRunAt(item.lastRunAt)} ·{' '}
                          {formatBatchRunStatus(item.lastRunStatus)}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        아직 자동 기록 전입니다.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    disabled={isLoading}
                    className="min-h-11 touch-manipulation rounded-md border border-white/10 bg-white/[0.05] px-3 text-xs font-black text-slate-200 transition hover:bg-rose-400/15 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
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

type BlacklistManagementModalProps = {
  groups: PlaceRankingBlacklistGroup[]
  isLoading: boolean
  onRemove: (entry: PlaceRankingBlacklistEntry) => Promise<void>
  onRefresh: () => Promise<void>
  onClose: () => void
}

function BlacklistManagementModal({
  groups,
  isLoading,
  onRemove,
  onRefresh,
  onClose,
}: BlacklistManagementModalProps) {
  const [selectedKeyword, setSelectedKeyword] = useState(groups[0]?.keyword ?? '')

  useEffect(() => {
    if (groups.length === 0) {
      setSelectedKeyword('')
      return
    }

    if (!selectedKeyword || !groups.some((group) => group.keyword === selectedKeyword)) {
      setSelectedKeyword(groups[0].keyword)
    }
  }, [groups, selectedKeyword])

  const selectedGroup = groups.find((group) => group.keyword === selectedKeyword) ?? groups[0]

  return (
    <div
      className="fixed inset-0 z-[10020] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="제외 목록 관리"
      onClick={onClose}
    >
      <section
        className="relative z-10 flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#070b15] shadow-[0_24px_80px_rgba(0,0,0,0.52)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200/75">
              Blacklist
            </p>
            <h3 className="mt-1 text-2xl font-black text-white">제외 목록 관리</h3>
            <p className="mt-2 break-keep text-sm font-bold leading-6 text-slate-400">
              키워드와 맞지 않는 플레이스를 제외하면 예약 TOP 30 순위에서 빠집니다.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex min-h-11 touch-manipulation items-center justify-center rounded-md border border-cyan-300/25 bg-cyan-300/[0.08] px-3 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
            >
              새로고침
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 touch-manipulation items-center justify-center rounded-md border border-white/10 bg-white/[0.06] px-3 text-xs font-black text-slate-100 transition hover:bg-white/[0.1]"
            >
              닫기
            </button>
          </div>
        </div>

        <div
          className="grid min-h-0 gap-4 overflow-y-auto p-5 md:grid-cols-[18rem_minmax(0,1fr)]"
          data-aiva-scroll-lock-allow="true"
        >
          <div className="min-h-0">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200/65">
                키워드 {groups.length}개
              </p>
              {isLoading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-200/25 border-t-cyan-200" />
              ) : null}
            </div>
            <div className="grid max-h-[28vh] gap-2 overflow-y-auto pr-1 md:max-h-none">
              {groups.length > 0 ? (
                groups.map((group) => {
                  const isSelected = group.keyword === selectedGroup?.keyword

                  return (
                    <button
                      key={group.keyword}
                      type="button"
                      onClick={() => setSelectedKeyword(group.keyword)}
                      className={`grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 text-left transition ${
                        isSelected
                          ? 'border-cyan-300/45 bg-cyan-300/[0.08] text-cyan-50'
                          : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.07]'
                      }`}
                    >
                      <span className="truncate text-sm font-black">{group.keyword}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-[11px] font-black text-cyan-100">
                        {group.count}
                      </span>
                    </button>
                  )
                })
              ) : (
                <div className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm font-bold text-slate-400">
                  아직 제외 등록된 플레이스가 없습니다.
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 rounded-md border border-white/10 bg-white/[0.03] p-4">
            {selectedGroup ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-200/65">
                      Excluded Places
                    </p>
                    <h4 className="mt-1 truncate text-lg font-black text-white">
                      {selectedGroup.keyword}
                    </h4>
                  </div>
                  <span className="shrink-0 rounded-full border border-fuchsia-300/20 bg-fuchsia-300/[0.08] px-3 py-1 text-xs font-black text-fuchsia-100">
                    {selectedGroup.count}개 제외
                  </span>
                </div>

                <div className="mt-4 grid max-h-[42vh] gap-2 overflow-y-auto pr-1">
                  {selectedGroup.entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="grid gap-3 rounded-md border border-white/10 bg-[#090d18] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-50">
                          {entry.placeName}
                        </p>
                        {entry.category ? (
                          <p className="mt-1 truncate text-xs font-bold text-cyan-100/65">
                            {entry.category}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemove(entry)}
                        disabled={isLoading}
                        className="min-h-11 touch-manipulation rounded-md border border-rose-300/20 bg-rose-300/[0.06] px-3 text-xs font-black text-rose-100 transition hover:bg-rose-300/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        제외 해제
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm font-bold text-slate-400">
                키워드를 선택하면 제외된 플레이스를 확인할 수 있습니다.
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

function BookingCountBadge({
  summary,
  isLoading,
}: {
  summary?: PlaceBookingSummaryItem
  isLoading: boolean
}) {
  if (isLoading && !summary) {
    return (
      <span className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-2.5 py-1 text-[10px] font-black text-cyan-100/75">
        <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-200" />
        예약 확인 중
      </span>
    )
  }

  if (!summary || summary.status !== 'ready') {
    return null
  }

  const hasBookedSlots = summary.bookedSlots > 0
  const isClosedToday = summary.isManualClosedToday

  return (
    <span
      className={`mt-2 inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black sm:text-[11px] ${
        isClosedToday
          ? 'border-slate-400/20 bg-white/[0.045] text-slate-300'
          : hasBookedSlots
          ? 'border-fuchsia-300/25 bg-fuchsia-300/[0.08] text-fuchsia-100'
          : 'border-white/10 bg-white/[0.04] text-slate-400'
      }`}
    >
      {isClosedToday ? (
        <span className="text-slate-200">휴무</span>
      ) : (
        <>
          <span className="text-cyan-100/85">오늘 예약</span>
          <strong className={hasBookedSlots ? 'text-white' : 'text-slate-300'}>
            {summary.bookedSlots}
          </strong>
        </>
      )}
    </span>
  )
}

function BookingTopBoard({
  top,
  allSummaries,
  keyword,
  date,
  isLoading,
  errorMessage,
  blacklistCount,
  blacklistPlaceKeys,
  isBlacklistLoading,
  onDateChange,
  onAddBlacklistPlace,
  onRemoveBlacklistPlace,
  onApplyBlacklist,
  onOpenBlacklistManagement,
}: {
  top: PlaceBookingSummaryItem[]
  allSummaries: PlaceBookingSummaryItem[]
  keyword: string
  date: string
  isLoading: boolean
  errorMessage: string
  blacklistCount: number
  blacklistPlaceKeys: Set<string>
  isBlacklistLoading: boolean
  onDateChange: (date: string) => Promise<void>
  onAddBlacklistPlace: (place: PlaceBookingSummaryItem) => Promise<void>
  onRemoveBlacklistPlace: (place: PlaceBookingSummaryItem) => Promise<void>
  onApplyBlacklist: (places: PlaceBookingSummaryItem[]) => Promise<void>
  onOpenBlacklistManagement: () => void
}) {
  const [isAllModalOpen, setIsAllModalOpen] = useState(false)

  if (isLoading && top.length === 0) {
    return <BookingTopBoardSkeleton date={date} />
  }

  if (errorMessage && top.length === 0) {
    return (
      <section className="mt-5 rounded-md border border-rose-300/20 bg-rose-400/[0.06] p-4">
        <p className="text-sm font-black text-rose-100">{errorMessage}</p>
      </section>
    )
  }

  if (top.length === 0) {
    return null
  }

  const compactItems = top.slice(0, 10)
  const mobileItems = compactItems.slice(0, 3)

  return (
    <>
      <section className="mt-5 rounded-md border border-white/10 bg-[#080c17]/55 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">
              Today Booking
            </p>
            <h4 className="mt-1 whitespace-nowrap text-lg font-black text-white sm:text-xl">
              오늘의 예약 TOP 30
            </h4>
            <p className="mt-1 break-keep text-sm font-bold leading-6 text-slate-400">
              네이버 예약을 사용하는 플레이스 기준입니다.
            </p>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 sm:flex-col sm:items-end">
            <span className="hidden w-fit rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-black text-slate-300 sm:inline-flex">
              {formatCalendarDateLabel(date)}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenBlacklistManagement}
                className="inline-flex min-h-11 touch-manipulation items-center justify-center whitespace-nowrap rounded-md border border-white/10 bg-white/[0.045] px-3 text-xs font-black text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.08] hover:text-cyan-50"
              >
                제외 관리
              </button>
              <button
                type="button"
                onClick={() => setIsAllModalOpen(true)}
                className="inline-flex min-h-11 touch-manipulation items-center justify-center whitespace-nowrap rounded-md border border-cyan-300/25 bg-cyan-300/[0.06] px-3 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/[0.12]"
              >
                전체 순위 보기
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:hidden">
          {mobileItems.map((item, index) => (
            <BookingTopRow key={item.placeId} item={item} index={index} />
          ))}
        </div>
        <div className="mt-4 hidden gap-2 md:grid md:grid-cols-2">
          {compactItems.map((item, index) => (
            <BookingTopRow key={item.placeId} item={item} index={index} />
          ))}
        </div>
      </section>

      {isAllModalOpen ? (
        <BookingTopAllModal
          items={allSummaries.length > 0 ? allSummaries : compactItems}
          keyword={keyword}
          date={date}
          isLoading={isLoading}
          blacklistCount={blacklistCount}
          blacklistPlaceKeys={blacklistPlaceKeys}
          isBlacklistLoading={isBlacklistLoading}
          onDateChange={onDateChange}
          onAddBlacklistPlace={onAddBlacklistPlace}
          onRemoveBlacklistPlace={onRemoveBlacklistPlace}
          onApplyBlacklist={onApplyBlacklist}
          onClose={() => setIsAllModalOpen(false)}
        />
      ) : null}
    </>
  )
}

function BookingTopBoardSkeleton({ date }: { date: string }) {
  return (
    <section
      className="mt-5 rounded-md border border-white/10 bg-[#080c17]/55 p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">
            Today Booking
          </p>
          <h4 className="mt-1 whitespace-nowrap text-lg font-black text-white sm:text-xl">
            오늘의 예약 TOP 30
          </h4>
          <p className="mt-1 break-keep text-sm font-bold leading-6 text-slate-400">
            예약 데이터를 집계하고 있습니다.
          </p>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 sm:flex-col sm:items-end">
          <span className="hidden w-fit rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-black text-slate-400 sm:inline-flex">
            {formatCalendarDateLabel(date)}
          </span>
          <div className="flex items-center gap-2">
            <SkeletonLine className="h-9 w-20" />
            <SkeletonLine className="h-9 w-24" />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:hidden">
        {Array.from({ length: 3 }).map((_, index) => (
          <BookingTopRowSkeleton key={index} index={index} />
        ))}
      </div>
      <div className="mt-4 hidden gap-2 md:grid md:grid-cols-2">
        {Array.from({ length: 10 }).map((_, index) => (
          <BookingTopRowSkeleton key={index} index={index} />
        ))}
      </div>
    </section>
  )
}

function BookingTopRowSkeleton({ index }: { index: number }) {
  const visual = getBookingTopVisual(index)

  return (
    <article
      className={`grid grid-cols-[3.65rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2.5 ${visual.containerClass}`}
    >
      <span
        className={`inline-flex h-10 items-center justify-center rounded-md px-2 text-xs font-black leading-none ${visual.badgeClass}`}
      >
        {visual.badgeText}
      </span>
      <div className="min-w-0">
        <SkeletonLine className="h-4 w-28" />
        <SkeletonLine className="mt-2 h-3 w-20" />
      </div>
      <div className="grid justify-items-end">
        <SkeletonLine className="h-3 w-7" />
        <SkeletonLine className="mt-2 h-5 w-8" />
      </div>
    </article>
  )
}

function BookingTopRow({
  item,
  index,
  isHighlighted = false,
}: {
  item: PlaceBookingSummaryItem
  index: number
  isHighlighted?: boolean
}) {
  const visual = getBookingTopVisual(index)

  return (
    <article
      className={`grid grid-cols-[3.65rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2.5 transition ${visual.containerClass} ${
        isHighlighted ? 'ring-2 ring-cyan-200/75 ring-offset-2 ring-offset-[#080c17]' : ''
      }`}
    >
      <span
        className={`inline-flex h-10 items-center justify-center rounded-md px-2 text-xs font-black leading-none ${visual.badgeClass}`}
      >
        {visual.badgeText}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-slate-50">{item.name}</p>
        <p className="mt-0.5 truncate text-xs font-bold text-slate-500">
          플레이스 {item.rank}위
        </p>
      </div>
      <div className="text-right">
        <p className="text-[10px] font-black text-slate-500">예약</p>
        <strong className="text-lg font-black text-cyan-100">{item.bookedSlots}</strong>
      </div>
    </article>
  )
}

function BookingTopAllModal({
  items,
  keyword,
  date,
  isLoading,
  blacklistCount,
  blacklistPlaceKeys,
  isBlacklistLoading,
  onDateChange,
  onAddBlacklistPlace,
  onRemoveBlacklistPlace,
  onApplyBlacklist,
  onClose,
}: {
  items: PlaceBookingSummaryItem[]
  keyword: string
  date: string
  isLoading: boolean
  blacklistCount: number
  blacklistPlaceKeys: Set<string>
  isBlacklistLoading: boolean
  onDateChange: (date: string) => Promise<void>
  onAddBlacklistPlace: (place: PlaceBookingSummaryItem) => Promise<void>
  onRemoveBlacklistPlace: (place: PlaceBookingSummaryItem) => Promise<void>
  onApplyBlacklist: (places: PlaceBookingSummaryItem[]) => Promise<void>
  onClose: () => void
}) {
  const [searchText, setSearchText] = useState('')
  const [highlightedPlaceId, setHighlightedPlaceId] = useState<string | null>(null)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [isBlacklistMode, setIsBlacklistMode] = useState(false)
  const [appliedBlacklistKeys, setAppliedBlacklistKeys] = useState<Set<string>>(
    () => new Set(blacklistPlaceKeys),
  )
  const [pendingExcludeKeys, setPendingExcludeKeys] = useState<Set<string>>(() => new Set())
  const [savingExcludeKeys, setSavingExcludeKeys] = useState<Set<string>>(() => new Set())
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const modalRef = useRef<HTMLElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const displayedItems = useMemo(() => {
    return items
      .filter((item) => !appliedBlacklistKeys.has(createPlaceBlacklistKey(item.placeId, item.name)))
      .slice(0, bookingTopLimit)
  }, [appliedBlacklistKeys, items])
  const pendingExcludeItems = useMemo(() => {
    return displayedItems.filter((item) =>
      pendingExcludeKeys.has(createPlaceBlacklistKey(item.placeId, item.name)),
    )
  }, [displayedItems, pendingExcludeKeys])

  if (typeof document === 'undefined') {
    return null
  }

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const keyword = searchText.trim().toLocaleLowerCase('ko-KR')

    if (!keyword) {
      setHighlightedPlaceId(null)
      return
    }

    const matched = displayedItems.find((item) => {
      return `${item.name} ${item.category}`.toLocaleLowerCase('ko-KR').includes(keyword)
    })

    if (!matched) {
      setHighlightedPlaceId(null)
      return
    }

    setHighlightedPlaceId(matched.placeId)
    window.requestAnimationFrame(() => {
      itemRefs.current[matched.placeId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    })
  }

  const scrollToTop = () => {
    modalRef.current?.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
    listRef.current?.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  const selectDate = async (nextDate: string) => {
    setIsCalendarOpen(false)
    setHighlightedPlaceId(null)
    setPendingExcludeKeys(new Set())
    setSavingExcludeKeys(new Set())
    listRef.current?.scrollTo({ top: 0 })
    await onDateChange(nextDate)
    setAppliedBlacklistKeys(new Set(blacklistPlaceKeys))
  }

  const togglePendingExclude = async (item: PlaceBookingSummaryItem) => {
    const placeKey = createPlaceBlacklistKey(item.placeId, item.name)

    if (savingExcludeKeys.has(placeKey)) {
      return
    }

    setSavingExcludeKeys((current) => {
      const nextKeys = new Set(current)

      nextKeys.add(placeKey)

      return nextKeys
    })

    try {
      if (pendingExcludeKeys.has(placeKey)) {
        await onRemoveBlacklistPlace(item)

        setPendingExcludeKeys((current) => {
          const nextKeys = new Set(current)

          nextKeys.delete(placeKey)

          return nextKeys
        })
      } else {
        await onAddBlacklistPlace(item)

        setPendingExcludeKeys((current) => {
          const nextKeys = new Set(current)

          nextKeys.add(placeKey)

          return nextKeys
        })
      }
    } finally {
      setSavingExcludeKeys((current) => {
        const nextKeys = new Set(current)

        nextKeys.delete(placeKey)

        return nextKeys
      })
    }
  }

  const applyPendingExcludes = async () => {
    if (pendingExcludeItems.length === 0 || isBlacklistLoading) {
      return
    }

    await onApplyBlacklist(pendingExcludeItems)
    setAppliedBlacklistKeys((current) => new Set([...current, ...pendingExcludeKeys]))
    setPendingExcludeKeys(new Set())
    setHighlightedPlaceId(null)
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return createPortal(
    <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/70 p-3 backdrop-blur-md">
      <section
        ref={modalRef}
        className="relative z-10 flex max-h-[86vh] w-full max-w-3xl flex-col overflow-y-auto rounded-md border border-cyan-300/20 bg-[#080c17] shadow-[0_28px_80px_rgba(0,0,0,0.55)] md:overflow-hidden"
        data-aiva-scroll-lock-allow="true"
      >
        <div className="relative flex flex-col gap-4 border-b border-white/10 p-4 pr-[5.75rem] sm:flex-row sm:items-start sm:justify-between sm:pr-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">
              Today Booking
            </p>
            <h4 className="mt-1 break-keep text-xl font-black leading-tight text-white">
              오늘의 예약 TOP 30
            </h4>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-3 py-1 text-xs font-black text-cyan-100">
                기준 키워드: {keyword}
              </span>
              {blacklistCount > 0 ? (
                <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-300/[0.08] px-3 py-1 text-xs font-black text-fuchsia-100">
                  제외 목록 {blacklistCount}개
                </span>
              ) : null}
            </div>
            <p className="mt-3 break-keep text-sm font-bold leading-6 text-slate-500">
              네이버 예약을 사용하는 플레이스 {displayedItems.length}개를 예약 수 기준으로 보여드립니다.
            </p>
          </div>
          <div className="flex w-full shrink-0 items-start gap-2 sm:w-auto sm:flex-col sm:items-end">
            <div className="grid w-full gap-1.5 sm:w-auto">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200/70">
                날짜 선택
              </span>
              <button
                type="button"
                onClick={() => setIsCalendarOpen(true)}
                disabled={isLoading}
                className="inline-flex h-11 w-full min-w-[9.5rem] touch-manipulation items-center justify-center rounded-md border border-white/10 bg-[#090d18] px-3 text-center text-sm font-black text-white outline-none transition hover:border-cyan-300/45 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                <span className="whitespace-nowrap">{formatCalendarDateLabel(date)}</span>
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 inline-flex min-h-11 touch-manipulation items-center justify-center rounded-md border border-white/10 bg-white/[0.06] px-4 text-sm font-black text-slate-100 transition hover:bg-white/[0.1] sm:static"
            >
              닫기
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="break-keep text-xs font-bold leading-5 text-slate-500">
            제외 모드에서 플레이스를 선택한 뒤 순위 재산정을 누르면 TOP30을 다시 채웁니다.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {pendingExcludeKeys.size > 0 ? (
              <span className="inline-flex min-h-9 items-center rounded-md border border-fuchsia-300/25 bg-fuchsia-300/[0.08] px-3 text-xs font-black text-fuchsia-100">
                선택됨 {pendingExcludeKeys.size}개
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setIsBlacklistMode((current) => !current)}
              className={`inline-flex min-h-11 touch-manipulation items-center justify-center whitespace-nowrap rounded-md border px-3 text-xs font-black transition ${
                isBlacklistMode
                  ? 'border-fuchsia-300/35 bg-fuchsia-300/[0.12] text-fuchsia-50 hover:bg-fuchsia-300/[0.18]'
                  : 'border-white/10 bg-white/[0.05] text-slate-200 hover:bg-white/[0.09]'
              }`}
            >
              {isBlacklistMode ? '제외 선택 중' : '제외 모드'}
            </button>
            <button
              type="button"
              onClick={applyPendingExcludes}
              disabled={isBlacklistLoading || pendingExcludeItems.length === 0}
              className="inline-flex min-h-11 touch-manipulation items-center justify-center whitespace-nowrap rounded-md border border-cyan-300/25 bg-cyan-300/[0.06] px-3 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/[0.12] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isBlacklistLoading ? '재산정 중' : '순위 재산정'}
            </button>
          </div>
        </div>

        <form onSubmit={submitSearch} className="grid gap-2 border-b border-white/10 p-4 sm:grid-cols-[minmax(0,1fr)_6rem]">
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="플레이스명 검색"
            className="min-h-11 rounded-md border border-white/10 bg-[#050814] px-3 text-sm font-bold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/70"
          />
          <button
            type="submit"
            className="min-h-11 touch-manipulation rounded-md border border-cyan-300/35 bg-cyan-300/[0.12] px-4 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/[0.18]"
          >
            검색
          </button>
        </form>

        <div
          ref={listRef}
          className="grid gap-2 p-4 md:overflow-y-auto"
          data-aiva-scroll-lock-allow="true"
        >
          {isLoading ? (
            <BookingTopListSkeleton />
          ) : displayedItems.length > 0 ? (
            displayedItems.map((item, index) => {
              const placeKey = createPlaceBlacklistKey(item.placeId, item.name)
              const isPendingExclude = pendingExcludeKeys.has(placeKey)
              const isSavingExclude = savingExcludeKeys.has(placeKey)

              return (
                <div
                  key={`${placeKey}:${item.rank}:${index}`}
                  ref={(node) => {
                    itemRefs.current[item.placeId] = node
                  }}
                  className={`grid gap-2 ${isBlacklistMode ? 'grid-cols-[minmax(0,1fr)_4.75rem] sm:grid-cols-[minmax(0,1fr)_6.25rem]' : ''}`}
                >
                  <BookingTopRow
                    item={item}
                    index={index}
                    isHighlighted={highlightedPlaceId === item.placeId || isPendingExclude}
                  />
                  {isBlacklistMode ? (
                    <button
                      type="button"
                      onClick={() => togglePendingExclude(item)}
                      disabled={isSavingExclude}
                      className={`inline-flex min-h-11 touch-manipulation items-center justify-center whitespace-nowrap rounded-md border px-2 text-[11px] font-black transition disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:text-xs ${
                        isPendingExclude
                          ? 'border-fuchsia-300/45 bg-fuchsia-300/[0.14] text-fuchsia-50 hover:bg-fuchsia-300/[0.2]'
                          : 'border-white/10 bg-white/[0.045] text-slate-300 hover:border-fuchsia-300/30 hover:bg-fuchsia-300/[0.08] hover:text-fuchsia-50'
                      }`}
                    >
                      {isSavingExclude ? '저장 중' : isPendingExclude ? '선택됨' : '선택'}
                    </button>
                  ) : null}
                </div>
              )
            })
          ) : (
            <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm font-bold text-slate-400">
              표시할 예약 순위 데이터가 없습니다.
            </p>
          )}
          {!isLoading && displayedItems.length > 0 ? (
            <div className="mt-2 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={scrollToTop}
                className="flex min-h-11 w-full touch-manipulation items-center justify-center gap-1 rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] px-4 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/[0.12]"
              >
                <span className="text-base text-cyan-300">↑</span>
                TOP
              </button>
            </div>
          ) : null}
        </div>
        {isCalendarOpen ? (
          <BookingCalendarModal
            selectedDate={date}
            onSelect={selectDate}
            onClose={() => setIsCalendarOpen(false)}
          />
        ) : null}
      </section>
    </div>,
    document.body,
  )
}

function BookingTopListSkeleton() {
  return (
    <div className="grid gap-2" role="status" aria-live="polite">
      <div className="rounded-md border border-cyan-300/20 bg-cyan-300/[0.055] p-4">
        <p className="text-sm font-black text-cyan-100">오늘의 예약 현황을 분석하고 있습니다.</p>
        <p className="mt-1 break-keep text-xs font-bold leading-5 text-slate-400">
          네이버 예약 데이터를 집계해 TOP30 순위를 구성하는 중입니다.
        </p>
      </div>
      {Array.from({ length: 12 }).map((_, index) => (
        <BookingTopRowSkeleton key={index} index={index} />
      ))}
    </div>
  )
}

function getBookingTopVisual(index: number) {
  if (index === 0) {
    return {
      badgeText: 'TOP 1',
      badgeClass: 'bg-amber-300 text-[#1b1300]',
      containerClass: 'border-amber-300/45 bg-amber-300/[0.08]',
    }
  }

  if (index === 1) {
    return {
      badgeText: 'TOP 2',
      badgeClass: 'bg-slate-200 text-[#101521]',
      containerClass: 'border-slate-200/35 bg-slate-200/[0.06]',
    }
  }

  if (index === 2) {
    return {
      badgeText: 'TOP 3',
      badgeClass: 'bg-orange-300 text-[#1b1005]',
      containerClass: 'border-orange-300/35 bg-orange-300/[0.06]',
    }
  }

  return {
    badgeText: `${index + 1}위`,
    badgeClass: 'bg-white/[0.08] text-slate-200',
    containerClass: 'border-white/10 bg-white/[0.035]',
  }
}

type BookingStatusModalProps = {
  place: PlaceRankingItem
  date: string
  status: PlaceBookingStatusResponse | null
  selectedProductId: string | null
  isLoading: boolean
  errorMessage: string
  errorLog: string
  onDateChange: (date: string) => void
  onProductChange: (productId: string) => void
  onRetry: () => void
  onClose: () => void
}

function BookingStatusModal({
  place,
  date,
  status,
  selectedProductId,
  isLoading,
  errorMessage,
  errorLog,
  onDateChange,
  onProductChange,
  onRetry,
  onClose,
}: BookingStatusModalProps) {
  const selectedProduct =
    status?.products.find((product) => product.id === selectedProductId) ??
    status?.products[0] ??
    null
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [calendarMonthKey, setCalendarMonthKey] = useState(formatYearMonthValue(date))
  const [calendarCountsByMonth, setCalendarCountsByMonth] = useState<
    Record<string, PlaceBookingCalendarResponse['days']>
  >({})
  const [isCalendarCountsLoading, setIsCalendarCountsLoading] = useState(false)
  const [calendarCountsError, setCalendarCountsError] = useState('')

  useEffect(() => {
    setCalendarMonthKey(formatYearMonthValue(date))
  }, [date])

  useEffect(() => {
    if (!isCalendarOpen || calendarCountsByMonth[calendarMonthKey]) {
      return
    }

    let isCanceled = false

    setIsCalendarCountsLoading(true)
    setCalendarCountsError('')

    requestBookingCalendar({ place, yearMonth: calendarMonthKey })
      .then((response) => {
        if (isCanceled) {
          return
        }

        setCalendarCountsByMonth((current) => ({
          ...current,
          [response.yearMonth]: response.days,
        }))
      })
      .catch(() => {
        if (!isCanceled) {
          setCalendarCountsError('예약 수를 확인하지 못했습니다.')
        }
      })
      .finally(() => {
        if (!isCanceled) {
          setIsCalendarCountsLoading(false)
        }
      })

    return () => {
      isCanceled = true
    }
  }, [calendarCountsByMonth, calendarMonthKey, isCalendarOpen, place])

  return (
    <div
      className="fixed inset-0 z-[10020] grid h-[100dvh] overflow-hidden overscroll-none bg-black/72 p-3 backdrop-blur-sm sm:place-items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`${place.name} 예약현황`}
      onClick={onClose}
    >
      <section
        className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden overscroll-contain rounded-2xl border border-cyan-300/20 bg-[#070b15] shadow-[0_24px_80px_rgba(0,0,0,0.56)] sm:max-h-[88vh]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5 sm:py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200/75">
              Booking Status
            </p>
            <h3 className="mt-1 truncate text-xl font-black text-white sm:text-2xl">
              {place.name}
            </h3>
            <p className="mt-1 text-xs font-bold text-cyan-100/75 sm:text-sm">
              {place.category}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="relative z-10 inline-flex h-12 min-w-12 touch-manipulation items-center justify-center rounded-md border border-white/10 bg-white/[0.06] px-3 text-sm font-black text-slate-100 transition hover:bg-white/[0.1]"
          >
            닫기
          </button>
        </div>

        <div
          className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4 [touch-action:pan-y] [-webkit-overflow-scrolling:touch] sm:px-5 sm:py-5"
          data-aiva-scroll-lock-allow="true"
        >
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_19rem] md:items-end">
            <div>
              <p className="text-lg font-black text-white">실시간 예약현황</p>
              <p className="mt-1 text-sm font-bold leading-6 text-slate-400">
                예약상품별 남은 시간대를 색상으로 확인합니다.
              </p>
            </div>
            <div className="grid gap-2">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-cyan-200/70">
                날짜 선택
              </span>
              <div className="grid grid-cols-[2.5rem_minmax(8.75rem,1fr)_2.5rem] gap-2">
                <button
                  type="button"
                  onClick={() => onDateChange(shiftDateValue(date, -1))}
                  disabled={isLoading}
                  className="inline-flex h-11 touch-manipulation items-center justify-center rounded-md border border-white/10 bg-white/[0.05] text-lg font-black leading-none text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-300/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="이전 날짜"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => setIsCalendarOpen(true)}
                  disabled={isLoading}
                  className="inline-flex h-11 min-w-0 touch-manipulation items-center justify-center rounded-md border border-white/10 bg-[#090d18] px-3 text-center text-sm font-black text-white outline-none transition hover:border-cyan-300/45 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="whitespace-nowrap">{formatCalendarDateLabel(date)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDateChange(shiftDateValue(date, 1))}
                  disabled={isLoading}
                  className="inline-flex h-11 touch-manipulation items-center justify-center rounded-md border border-white/10 bg-white/[0.05] text-lg font-black leading-none text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-300/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="다음 날짜"
                >
                  ›
                </button>
              </div>
            </div>
          </div>

          {isCalendarOpen ? (
            <BookingCalendarModal
              selectedDate={date}
              dateCounts={calendarCountsByMonth[calendarMonthKey] ?? {}}
              isCountsLoading={isCalendarCountsLoading}
              countsError={calendarCountsError}
              onVisibleMonthChange={setCalendarMonthKey}
              onSelect={(nextDate) => {
                setIsCalendarOpen(false)
                onDateChange(nextDate)
              }}
              onClose={() => setIsCalendarOpen(false)}
            />
          ) : null}

          {isLoading ? (
            <div className="mt-5 rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-black text-cyan-100">예약 가능 시간을 확인하고 있습니다.</p>
                  <p className="mt-1 text-sm font-bold text-slate-400">
                    네이버 예약 정보를 실시간으로 불러옵니다.
                  </p>
                </div>
                <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-cyan-200/25 border-t-cyan-200" />
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-1/3 animate-[aiva-loading_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-300 via-blue-300 to-fuchsia-400" />
              </div>
            </div>
          ) : null}

          {!isLoading && errorMessage ? (
            <div className="mt-5 rounded-md border border-rose-300/20 bg-rose-400/[0.08] p-4">
              <p className="font-black text-rose-100">{errorMessage}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-md border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-100 transition hover:bg-white/[0.1]"
                >
                  다시 조회
                </button>
              </div>
              {errorLog ? (
                <details className="mt-3 rounded-md border border-white/10 bg-[#080c17]/80 p-3">
                  <summary className="cursor-pointer text-sm font-black text-rose-100">
                    실패 로그 보기
                  </summary>
                  <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-300">
                    {errorLog}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : null}

          {!isLoading && !errorMessage && status ? (
            status.products.length > 0 ? (
              <div className="mt-5 grid gap-5">
                <div className="grid gap-2 sm:grid-cols-2">
                  {status.products.map((product) => {
                    const visibleSummary = summarizeBookingSlots(product.slots)

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => onProductChange(product.id)}
                        className={`rounded-md border p-3 text-left transition ${
                          selectedProduct?.id === product.id
                            ? 'border-cyan-300/45 bg-cyan-300/[0.1]'
                            : 'border-white/10 bg-white/[0.04] hover:border-cyan-300/25'
                        }`}
                      >
                        <p className="line-clamp-1 text-sm font-black text-white">
                          {product.name}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-slate-400">
                          {product.description || '예약 가능한 상품입니다.'}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black">
                          <span className="rounded-full bg-cyan-300/12 px-2 py-1 text-cyan-100">
                            가능 {visibleSummary.availableSlots}
                          </span>
                          <span className="rounded-full bg-fuchsia-300/10 px-2 py-1 text-fuchsia-100">
                            예약됨 {visibleSummary.bookedSlots}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {selectedProduct ? (
                  <BookingProductGrid product={selectedProduct} />
                ) : null}
              </div>
            ) : (
              <div className="mt-5 rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm font-bold text-slate-300">
                표시할 수 있는 예약상품이 없습니다.
              </div>
            )
          ) : null}
        </div>

      </section>
    </div>
  )
}

function BookingProductGrid({
  product,
}: {
  product: PlaceBookingProduct
}) {
  const visibleSlots = product.slots
  const visibleSummary = summarizeBookingSlots(visibleSlots)

  return (
    <section className="rounded-md border border-white/10 bg-[#080c17]/75 p-4">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200/70">
            Time Map
          </p>
          <h4 className="mt-1 text-xl font-black text-white">{product.name}</h4>
          <p className="mt-1 text-sm font-bold text-slate-400">
            {visibleSummary.firstAvailableTime
              ? `가장 빠른 가능 시간 ${visibleSummary.firstAvailableTime}`
              : visibleSlots.length > 0
                ? '현재 표시 가능한 시간에는 바로 예약 가능한 시간이 없습니다.'
                : '표시할 예약 시간이 없습니다.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-black">
          <span className="rounded-full bg-cyan-300/12 px-3 py-1 text-cyan-100">
            가능 {visibleSummary.availableSlots}
          </span>
          <span className="rounded-full bg-fuchsia-300/10 px-3 py-1 text-fuchsia-100">
            예약됨 {visibleSummary.bookedSlots}
          </span>
          <span className="rounded-full bg-white/[0.06] px-3 py-1 text-slate-400">
            예약불가 {visibleSummary.closedSlots}
          </span>
        </div>
      </div>

      {visibleSlots.length > 0 ? (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {visibleSlots.map((slot) => (
            <div
              key={`${product.id}-${slot.startDateTime}-${slot.time}`}
              className={`min-h-14 rounded-md border px-2 py-2 text-center ${
                slot.status === 'available'
                  ? 'border-cyan-300/40 bg-cyan-300/[0.12] text-cyan-50'
                  : slot.status === 'booked'
                    ? 'border-fuchsia-300/25 bg-fuchsia-400/[0.08] text-fuchsia-100'
                    : 'border-white/10 bg-white/[0.035] text-slate-500'
              }`}
            >
              <p className="text-sm font-black">{slot.time}</p>
              <p className="mt-1 text-[10px] font-black">
                {slot.status === 'available'
                  ? `가능 ${slot.remaining}`
                  : slot.status === 'booked'
                    ? '예약됨'
                    : '예약불가'}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-4 text-sm font-bold text-slate-400">
          현재 기준으로 노출할 예약 시간이 없습니다. 다른 날짜를 선택해 확인해주세요.
        </div>
      )}
    </section>
  )
}

function SkeletonLine({ className = '' }: { className?: string }) {
  return (
    <span
      className={`block animate-pulse rounded-md bg-gradient-to-r from-white/[0.08] via-white/[0.16] to-white/[0.08] ${className}`}
    />
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
      className="fixed inset-0 z-[10020] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${place.name} 순위 이력`}
      onClick={onClose}
    >
      <div
        className="relative z-10 flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-white/10 bg-[#070b15] shadow-[0_24px_80px_rgba(0,0,0,0.5)] sm:max-h-[88dvh]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5 sm:py-5">
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
            className="inline-flex min-h-11 shrink-0 touch-manipulation items-center justify-center rounded-md border border-white/10 bg-white/[0.06] px-3 text-xs font-black text-slate-100"
          >
            닫기
          </button>
        </div>

        <div
          className="min-h-0 overflow-x-hidden overflow-y-auto p-3 sm:p-5"
          data-aiva-scroll-lock-allow="true"
        >
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
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)] lg:items-start">
              <RankingHistoryChart rows={rows} />
              <RankingHistoryTable rows={rows} />
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

function RankingHistoryChart({
  rows,
}: {
  rows: PlaceRankingSnapshotHistoryResponse['history']
}) {
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null)
  const latestSnapshotTime = parseSnapshotDate(rows[0].snapshotDate)
  const chartRangeStartTime = latestSnapshotTime - 29 * 24 * 60 * 60 * 1000
  const chartRows = rows.filter((row) => parseSnapshotDate(row.snapshotDate) >= chartRangeStartTime)
  const chronologicalRows = [...chartRows].reverse()
  const ranks = chronologicalRows.map((row) => row.rank)
  const latest = rows[0]
  const oldest = rows[rows.length - 1]
  const bestRank = Math.min(...ranks)
  const bestRankIndex = ranks.lastIndexOf(bestRank)
  const worstRank = Math.max(...ranks)
  const chartMinRank = Math.max(1, bestRank - 2)
  const chartMaxRank = Math.max(chartMinRank + 4, worstRank + 2)
  const chartWidth = 720
  const chartHeight = 330
  const padding = { top: 34, right: 24, bottom: 48, left: 44 }
  const plotWidth = chartWidth - padding.left - padding.right
  const plotHeight = chartHeight - padding.top - padding.bottom
  const getX = (index: number) =>
    padding.left + (chronologicalRows.length === 1 ? plotWidth / 2 : (index / (chronologicalRows.length - 1)) * plotWidth)
  const getY = (rank: number) =>
    padding.top + ((rank - chartMinRank) / (chartMaxRank - chartMinRank)) * plotHeight
  const points = chronologicalRows.map((row, index) => `${getX(index)},${getY(row.rank)}`).join(' ')
  const areaPoints = `${padding.left},${padding.top + plotHeight} ${points} ${padding.left + plotWidth},${padding.top + plotHeight}`
  const guideRanks = [chartMinRank, Math.round((chartMinRank + chartMaxRank) / 2), chartMaxRank]
  const dateLabelIndexes = Array.from(
    new Set([0, Math.floor((chronologicalRows.length - 1) / 2), chronologicalRows.length - 1]),
  )
  const periodDelta = oldest.rank - latest.rank

  useEffect(() => {
    if (activePointIndex === null) {
      return
    }

    const clearActivePoint = () => setActivePointIndex(null)

    document.addEventListener('click', clearActivePoint)

    return () => document.removeEventListener('click', clearActivePoint)
  }, [activePointIndex])

  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-cyan-300/18 bg-[#08111e] p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-200/70">
            Ranking Trend
          </p>
          <h4 className="mt-1 text-base font-black text-white">최근 한 달 순위 변화</h4>
          <p className="mt-1 text-[11px] font-bold text-slate-500">
            최근 기록일 기준 30일 이내이며, 그래프가 위로 갈수록 상위 순위입니다.
          </p>
        </div>
        <span className="rounded-md border border-cyan-300/25 bg-cyan-300/[0.08] px-3 py-2 text-sm font-black text-cyan-50">
          현재 {formatRankLabel(latest.rank)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5 sm:gap-2">
        <RankingHistoryMetric label="현재" value={formatRankLabel(latest.rank)} />
        <RankingHistoryMetric label="한 달 최고" value={formatRankLabel(bestRank)} />
        <RankingHistoryMetric
          label="한 달 변화"
          value={periodDelta > 0 ? `${periodDelta}위 상승` : periodDelta < 0 ? `${Math.abs(periodDelta)}위 하락` : '변화 없음'}
          tone={periodDelta > 0 ? 'up' : periodDelta < 0 ? 'down' : 'same'}
        />
      </div>

      <div className="mt-3 aspect-[4/3] w-full overflow-hidden rounded-md border border-white/[0.07] bg-[#060b14] sm:aspect-[16/9]">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-full w-full"
          role="img"
          aria-label={`${chronologicalRows[0].snapshotDate}부터 ${latest.snapshotDate}까지의 플레이스 순위 변화`}
          onClick={() => setActivePointIndex(null)}
        >
          <defs>
            <linearGradient id="ranking-history-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {guideRanks.map((rank) => {
            const y = getY(rank)

            return (
              <g key={rank}>
                <line
                  x1={padding.left}
                  x2={padding.left + plotWidth}
                  y1={y}
                  y2={y}
                  stroke="rgba(148,163,184,0.18)"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  fill="#64748b"
                  fontSize="12"
                  fontWeight="700"
                >
                  {rank}위
                </text>
              </g>
            )
          })}

          {chronologicalRows.length > 1 ? (
            <polygon points={areaPoints} fill="url(#ranking-history-area)" />
          ) : null}
          <polyline
            points={points}
            fill="none"
            stroke="#67e8f9"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {chronologicalRows.map((row, index) => {
            const x = getX(index)
            const y = getY(row.rank)
            const isLatest = index === chronologicalRows.length - 1
            const isActive = activePointIndex === index

            return (
              <g
                key={row.snapshotDate}
                className="cursor-pointer outline-none"
                role="button"
                tabIndex={0}
                aria-label={`${formatSnapshotDate(row.snapshotDate)} ${formatRankLabel(row.rank)}`}
                onClick={(event) => {
                  event.stopPropagation()
                  setActivePointIndex(index)
                }}
                onFocus={() => setActivePointIndex(index)}
                onBlur={() => setActivePointIndex(null)}
                onMouseEnter={() => setActivePointIndex(index)}
                onMouseLeave={() => setActivePointIndex(null)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setActivePointIndex(index)
                  }
                }}
              >
                <circle cx={x} cy={y} r="15" fill="transparent" />
                <circle
                  cx={x}
                  cy={y}
                  r={isActive ? 7 : isLatest ? 7 : 4.5}
                  fill={isLatest ? '#f0abfc' : '#07111d'}
                  stroke={isLatest ? '#f0abfc' : '#67e8f9'}
                  strokeWidth="3"
                />
                {isLatest || index === bestRankIndex || chronologicalRows.length <= 8 ? (
                  <text
                    x={x}
                    y={Math.max(y - 12, 18)}
                    textAnchor="middle"
                    fill={isLatest ? '#f5d0fe' : '#cffafe'}
                    fontSize="13"
                    fontWeight="900"
                    paintOrder="stroke"
                    stroke="#060b14"
                    strokeWidth="5"
                  >
                    {row.rank}
                  </text>
                ) : null}
              </g>
            )
          })}

          {activePointIndex !== null ? (
            <RankingChartTooltip
              date={chronologicalRows[activePointIndex].snapshotDate}
              rank={chronologicalRows[activePointIndex].rank}
              x={getX(activePointIndex)}
              y={getY(chronologicalRows[activePointIndex].rank)}
            />
          ) : null}

          {dateLabelIndexes.map((index) => {
            const row = chronologicalRows[index]

            return (
              <text
                key={row.snapshotDate}
                x={getX(index)}
                y={chartHeight - 18}
                textAnchor={index === 0 ? 'start' : index === chronologicalRows.length - 1 ? 'end' : 'middle'}
                fill="#94a3b8"
                fontSize="12"
                fontWeight="700"
              >
                {formatChartDate(row.snapshotDate)}
              </text>
            )
          })}
        </svg>
      </div>
    </section>
  )
}

function RankingChartTooltip({
  date,
  rank,
  x,
  y,
}: {
  date: string
  rank: number
  x: number
  y: number
}) {
  const width = 132
  const height = 50
  const left = Math.min(Math.max(x - width / 2, 4), 720 - width - 4)
  const top = y > 88 ? y - height - 14 : y + 14

  return (
    <g pointerEvents="none" aria-hidden="true">
      <rect
        x={left}
        y={top}
        width={width}
        height={height}
        rx="6"
        fill="#111827"
        stroke="rgba(103,232,249,0.45)"
      />
      <text x={left + 12} y={top + 19} fill="#94a3b8" fontSize="11" fontWeight="700">
        {formatSnapshotDate(date)}
      </text>
      <text x={left + 12} y={top + 38} fill="#ecfeff" fontSize="15" fontWeight="900">
        {formatRankLabel(rank)}
      </text>
    </g>
  )
}

function RankingHistoryMetric({
  label,
  tone = 'same',
  value,
}: {
  label: string
  value: string
  tone?: 'up' | 'down' | 'same'
}) {
  return (
    <div className="min-w-0 rounded-md border border-white/[0.07] bg-white/[0.035] px-2 py-2.5 sm:px-2.5">
      <p className="break-keep text-[9px] font-black text-slate-500 sm:text-[10px]">{label}</p>
      <p
        className={`mt-1 break-keep text-[11px] font-black sm:text-sm ${
          tone === 'up' ? 'text-rose-300' : tone === 'down' ? 'text-blue-300' : 'text-slate-100'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function RankingHistoryTable({
  rows,
}: {
  rows: PlaceRankingSnapshotHistoryResponse['history']
}) {
  return (
    <section className="overflow-hidden rounded-md border border-white/10 bg-[#080c16]">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-cyan-200/70">
          Daily Ranking
        </p>
        <h4 className="mt-1 text-sm font-black text-white">일자별 순위</h4>
      </div>
      <div className="lg:max-h-[28rem] lg:overflow-y-auto" data-aiva-scroll-lock-allow="true">
        <table className="w-full table-fixed border-collapse text-left text-xs sm:text-sm">
          <colgroup>
            <col className="w-[52%]" />
            <col className="w-[23%]" />
            <col className="w-[25%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-[#151925] text-[11px] font-black text-cyan-100/75">
            <tr>
              <th className="px-2.5 py-3 sm:px-4">날짜</th>
              <th className="px-2 py-3 sm:px-4">순위</th>
              <th className="px-2 py-3 text-right sm:px-4 sm:text-left">변화</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((row) => (
              <tr key={row.snapshotDate} className="text-slate-200">
                <td className="whitespace-nowrap px-2.5 py-3 font-bold sm:px-4">
                  {formatSnapshotDate(row.snapshotDate)}
                </td>
                <td className="whitespace-nowrap px-2 py-3 font-black sm:px-4">
                  {formatRankLabel(row.rank)}
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-right sm:px-4 sm:text-left">
                  <RankChangeText change={row.change} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function formatChartDate(value: string) {
  const [, month, day] = value.split('-')

  return month && day ? `${Number(month)}/${Number(day)}` : value
}

function parseSnapshotDate(value: string) {
  const time = Date.parse(`${value}T00:00:00Z`)

  return Number.isNaN(time) ? 0 : time
}

type ReviewBottomSheetProps = {
  place: PlaceRankingItem
  onClose: () => void
}

function ReviewBottomSheet({ place, onClose }: ReviewBottomSheetProps) {
  const reviews = place.reviews.snippets.slice(0, 3)

  return (
    <div
      className="fixed inset-0 z-[10020] grid place-items-center bg-black/65 p-5 backdrop-blur-sm sm:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={`${place.name} 추천 리뷰 보기`}
      onClick={onClose}
    >
      <div
        className="relative z-10 max-h-[72vh] w-full max-w-[24rem] overflow-hidden rounded-2xl border border-white/10 bg-[#070b15] shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
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
            className="inline-flex min-h-11 shrink-0 touch-manipulation items-center justify-center rounded-md border border-white/10 bg-white/[0.06] px-3 text-xs font-black text-slate-100"
          >
            닫기
          </button>
        </div>

        <div
          className="max-h-[calc(72vh-5.5rem)] overflow-y-auto px-4 py-4"
          data-aiva-scroll-lock-allow="true"
        >
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

type BookingCalendarModalProps = {
  selectedDate: string
  dateCounts?: PlaceBookingCalendarResponse['days']
  isCountsLoading?: boolean
  countsError?: string
  onVisibleMonthChange?: (yearMonth: string) => void
  onSelect: (date: string) => void
  onClose: () => void
}

function BookingCalendarModal({
  selectedDate,
  dateCounts = {},
  isCountsLoading = false,
  countsError = '',
  onVisibleMonthChange,
  onSelect,
  onClose,
}: BookingCalendarModalProps) {
  const selectedParts = parseDateValue(selectedDate)
  const [visibleMonth, setVisibleMonth] = useState({
    year: selectedParts.year,
    monthIndex: selectedParts.monthIndex,
  })
  const [pickerMode, setPickerMode] = useState<'year' | 'month' | null>(null)
  const bookingCalendarYearOptions = useMemo(() => getBookingCalendarYearOptions(), [])
  const calendarCells = getCalendarCells(visibleMonth.year, visibleMonth.monthIndex)
  const visibleMonthKey = formatYearMonthFromParts(
    visibleMonth.year,
    visibleMonth.monthIndex,
  )

  useEffect(() => {
    onVisibleMonthChange?.(visibleMonthKey)
  }, [onVisibleMonthChange, visibleMonthKey])

  const moveMonth = (offset: number) => {
    setVisibleMonth((current) => {
      const nextDate = new Date(current.year, current.monthIndex + offset, 1)

      return {
        year: nextDate.getFullYear(),
        monthIndex: nextDate.getMonth(),
      }
    })
  }

  const selectVisibleYear = (year: number) => {
    setVisibleMonth((current) => ({
      ...current,
      year,
    }))
    setPickerMode(null)
  }

  const selectVisibleMonth = (monthIndex: number) => {
    setVisibleMonth((current) => ({
      ...current,
      monthIndex,
    }))
    setPickerMode(null)
  }

  return (
    <div
      className="fixed inset-0 z-[10030] grid h-[100dvh] place-items-center overflow-hidden overscroll-none bg-black/62 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="예약현황 날짜 선택"
      onClick={onClose}
    >
      <div
        className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto overscroll-contain rounded-xl border border-cyan-300/20 bg-[#080c17] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.5)] [touch-action:pan-y] [-webkit-overflow-scrolling:touch]"
        data-aiva-scroll-lock-allow="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200/70">
            Booking Date
          </p>
          <h3 className="mt-1 text-lg font-black text-white">예약 캘린더</h3>
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => moveMonth(-1)}
            className="inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-md border border-white/10 bg-white/[0.05] text-lg font-black text-slate-100 transition hover:bg-white/[0.1]"
            aria-label="이전 달"
          >
            ‹
          </button>
          <p className="min-w-32 text-center text-lg font-black text-white">
            {visibleMonth.year}년 {visibleMonth.monthIndex + 1}월
          </p>
          <button
            type="button"
            onClick={() => moveMonth(1)}
            className="inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-md border border-white/10 bg-white/[0.05] text-lg font-black text-slate-100 transition hover:bg-white/[0.1]"
            aria-label="다음 달"
          >
            ›
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPickerMode((current) => (current === 'year' ? null : 'year'))}
            className={`min-h-11 touch-manipulation rounded-md border px-3 py-2 text-sm font-black transition ${
              pickerMode === 'year'
                ? 'border-cyan-200/45 bg-cyan-200/[0.12] text-cyan-50'
                : 'border-white/10 bg-white/[0.045] text-slate-100 hover:border-cyan-300/35 hover:bg-cyan-300/[0.08]'
            }`}
            aria-expanded={pickerMode === 'year'}
          >
            {visibleMonth.year}년
          </button>
          <button
            type="button"
            onClick={() => setPickerMode((current) => (current === 'month' ? null : 'month'))}
            className={`min-h-11 touch-manipulation rounded-md border px-3 py-2 text-sm font-black transition ${
              pickerMode === 'month'
                ? 'border-cyan-200/45 bg-cyan-200/[0.12] text-cyan-50'
                : 'border-white/10 bg-white/[0.045] text-slate-100 hover:border-cyan-300/35 hover:bg-cyan-300/[0.08]'
            }`}
            aria-expanded={pickerMode === 'month'}
          >
            {visibleMonth.monthIndex + 1}월
          </button>
        </div>

        {pickerMode === 'year' ? (
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-md border border-white/10 bg-white/[0.035] p-2">
            {bookingCalendarYearOptions.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => selectVisibleYear(year)}
                className={`min-h-10 touch-manipulation rounded-md border px-2 py-2 text-xs font-black transition ${
                  year === visibleMonth.year
                    ? 'border-cyan-200/50 bg-cyan-100 text-[#07111f]'
                    : 'border-white/10 bg-[#0d1322] text-slate-200 hover:border-cyan-300/35 hover:bg-cyan-300/[0.08]'
                }`}
              >
                {year}년
              </button>
            ))}
          </div>
        ) : null}

        {pickerMode === 'month' ? (
          <div className="mt-2 grid grid-cols-4 gap-2 rounded-md border border-white/10 bg-white/[0.035] p-2">
            {Array.from({ length: 12 }, (_, monthIndex) => (
              <button
                key={monthIndex}
                type="button"
                onClick={() => selectVisibleMonth(monthIndex)}
                className={`min-h-10 touch-manipulation rounded-md border px-2 py-2 text-xs font-black transition ${
                  monthIndex === visibleMonth.monthIndex
                    ? 'border-cyan-200/50 bg-cyan-100 text-[#07111f]'
                    : 'border-white/10 bg-[#0d1322] text-slate-200 hover:border-cyan-300/35 hover:bg-cyan-300/[0.08]'
                }`}
              >
                {monthIndex + 1}월
              </button>
            ))}
          </div>
        ) : null}

        {isCountsLoading || countsError ? (
          <div
            className={`mt-4 overflow-hidden rounded-md border px-3 py-2 ${
              countsError
                ? 'border-rose-300/20 bg-rose-400/[0.08]'
                : 'border-cyan-300/20 bg-cyan-300/[0.06]'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              {isCountsLoading ? (
                <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-cyan-100/25 border-t-cyan-100" />
              ) : null}
              <p
                className={`text-center text-xs font-black ${
                  countsError ? 'text-rose-100/85' : 'text-cyan-100/80'
                }`}
              >
                {countsError || '날짜별 예약 수를 불러오는 중입니다.'}
              </p>
            </div>
            {isCountsLoading ? (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-1/3 animate-[aiva-loading_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-300 via-blue-300 to-fuchsia-400" />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-7 gap-1 text-center">
          {calendarWeekdayLabels.map((label) => (
            <span
              key={label}
              className="py-2 text-[11px] font-black text-cyan-200/65"
            >
              {label}
            </span>
          ))}
          {calendarCells.map((cell, index) =>
            cell ? (
              (() => {
                const daySummary = dateCounts[cell.value]
                const bookedCount = daySummary?.bookedSlots ?? 0
                const isSelected = cell.value === selectedDate

                return (
                  <button
                    key={cell.value}
                    type="button"
                    onClick={() => onSelect(cell.value)}
                    className={`flex min-h-12 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-md px-1 text-sm font-black transition ${
                      isSelected
                    ? 'bg-cyan-100 text-[#07111f]'
                    : 'border border-white/10 bg-white/[0.04] text-slate-200 hover:border-cyan-300/35 hover:bg-cyan-300/[0.08]'
                    }`}
                  >
                    <span>{cell.day}</span>
                    {bookedCount > 0 ? (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-black leading-none ${
                          isSelected
                            ? 'bg-[#07111f]/12 text-[#07111f]'
                            : 'bg-fuchsia-300/12 text-fuchsia-100'
                        }`}
                      >
                        예약 {bookedCount}
                      </span>
                    ) : null}
                  </button>
                )
              })()
            ) : (
              <span key={`blank-${index}`} aria-hidden="true" />
            ),
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onSelect(getTodayKstDate())}
            className="min-h-11 touch-manipulation rounded-md border border-cyan-300/25 bg-cyan-300/[0.08] px-3 py-2 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/[0.14]"
          >
            오늘
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 touch-manipulation rounded-md border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-black text-slate-100 transition hover:bg-white/[0.1]"
          >
            닫기
          </button>
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
      className="fixed inset-0 z-[10020] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="이미지 확대 보기"
      onClick={onClose}
    >
      <div
        className="relative z-10 grid h-[min(76vh,620px)] w-[min(88vw,760px)] place-items-center rounded-md border border-white/10 bg-[#050812] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.5)] md:h-[min(72vh,620px)] md:w-[min(76vw,780px)] md:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 inline-flex min-h-11 touch-manipulation items-center justify-center rounded-md border border-white/20 bg-black/70 px-3 text-sm font-black text-white backdrop-blur transition hover:bg-black/85 md:right-4 md:top-4"
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

function openExternalUrl(url?: string) {
  if (!url || typeof window === 'undefined') {
    return
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}

function createPlaceBlacklistKey(placeId?: string | null, placeName = '') {
  const normalizedId = placeId?.trim()

  if (normalizedId) {
    return `id:${normalizedId}`
  }

  return `name:${normalizeBlacklistName(placeName)}`
}

function normalizeBlacklistName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR')
}

function getTodayKstDate() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function getKstCurrentYear() {
  return Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
    }).format(new Date()),
  )
}

function getBookingCalendarYearOptions() {
  const currentYear = getKstCurrentYear()
  const startYear = currentYear - 6

  return Array.from({ length: 8 }, (_, index) => startYear + index)
}

function formatCalendarDateLabel(value: string) {
  const { year, monthIndex, day } = parseDateValue(value)

  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatYearMonthValue(value: string) {
  const { year, monthIndex } = parseDateValue(value)

  return formatYearMonthFromParts(year, monthIndex)
}

function formatYearMonthFromParts(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

function formatBookingTopDateLabel(value: string) {
  const { year, monthIndex, day } = parseDateValue(value)

  return `${year}.${String(monthIndex + 1).padStart(2, '0')}.${String(day).padStart(2, '0')}`
}

function shiftDateValue(value: string, offsetDays: number) {
  const { year, monthIndex, day } = parseDateValue(value)
  const nextDate = new Date(year, monthIndex, day + offsetDays)

  return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`
}

function parseDateValue(value: string) {
  const [yearValue, monthValue, dayValue] = value.split('-').map(Number)

  if (
    Number.isInteger(yearValue) &&
    Number.isInteger(monthValue) &&
    Number.isInteger(dayValue) &&
    monthValue >= 1 &&
    monthValue <= 12 &&
    dayValue >= 1 &&
    dayValue <= 31
  ) {
    return {
      year: yearValue,
      monthIndex: monthValue - 1,
      day: dayValue,
    }
  }

  const [todayYear, todayMonth, todayDay] = getTodayKstDate().split('-').map(Number)

  return {
    year: todayYear,
    monthIndex: todayMonth - 1,
    day: todayDay,
  }
}

function getCalendarCells(year: number, monthIndex: number) {
  const firstDay = new Date(year, monthIndex, 1).getDay()
  const lastDate = new Date(year, monthIndex + 1, 0).getDate()
  const cells: Array<{ day: number; value: string } | null> = []

  for (let index = 0; index < firstDay; index += 1) {
    cells.push(null)
  }

  for (let day = 1; day <= lastDate; day += 1) {
    cells.push({
      day,
      value: `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    })
  }

  return cells
}

function summarizeBookingSlots(slots: PlaceBookingSlot[]) {
  return {
    totalSlots: slots.length,
    availableSlots: slots.filter((slot) => slot.status === 'available').length,
    bookedSlots: slots.filter((slot) => slot.status === 'booked').length,
    closedSlots: slots.filter((slot) => slot.status === 'closed').length,
    firstAvailableTime:
      slots.find((slot) => slot.status === 'available')?.time ?? null,
  }
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
