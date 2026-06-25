'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type {
  PlacePreview,
  TrackingDashboardPlace,
  TrackingDashboardResponse,
  TrackedPlace,
} from '../types'

type PlaceListResponse = {
  places: TrackedPlace[]
}

type PlaceTrackingDashboardProps = {
  className?: string
  mobileCompact?: boolean
  mode?: 'dashboard' | 'manager'
  onOpenManagerPage?: () => void
}

const dashboardAutoRefreshIntervalMs = 300_000
const dashboardCacheStorageKey = 'aiva-place-tracking-dashboard-cache:v1'

type DashboardCacheEntry = {
  cachedAt: number
  data: TrackingDashboardResponse
}

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(' ')
}

export function PlaceTrackingDashboard({
  className = '',
  mobileCompact = false,
  mode = 'dashboard',
  onOpenManagerPage,
}: PlaceTrackingDashboardProps) {
  const [dashboard, setDashboard] = useState<TrackingDashboardResponse | null>(null)
  const [places, setPlaces] = useState<TrackedPlace[]>([])
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false)
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false)
  const [isManagerOpen, setIsManagerOpen] = useState(false)
  const [refreshingPlaceId, setRefreshingPlaceId] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const hasTrackedKeywords = useMemo(
    () => places.some((place) => place.keywords.length > 0),
    [places],
  )

  const openManager = () => {
    if (onOpenManagerPage) {
      onOpenManagerPage()
      return
    }

    setIsManagerOpen(true)
  }

  const refreshPlaces = useCallback(async () => {
    setIsLoadingPlaces(true)

    try {
      const response = await fetch('/api/place-tracking/places', {
        cache: 'no-store',
      })
      const data = (await response.json()) as PlaceListResponse

      if (!response.ok) {
        throw new Error('플레이스 목록을 불러오지 못했습니다.')
      }

      setPlaces(data.places)
    } finally {
      setIsLoadingPlaces(false)
    }
  }, [])

  const refreshDashboard = useCallback(async (
    force = false,
    { silent = false }: { silent?: boolean } = {},
  ) => {
    if (!force && !hasTrackedKeywords) {
      setDashboard(null)
      return
    }

    if (!force) {
      const cachedDashboard = readDashboardCache()

      if (cachedDashboard && isFreshDashboardCache(cachedDashboard, places)) {
        setDashboard(cachedDashboard.data)
        return
      }
    }

    if (!silent) {
      setIsLoadingDashboard(true)
      setErrorMessage('')
    }

    try {
      const response = await fetch('/api/place-tracking/dashboard', {
        cache: 'no-store',
      })
      const data = (await response.json()) as TrackingDashboardResponse & { message?: string }

      if (!response.ok) {
        throw new Error(data.message || '플레이스 순위를 확인하지 못했습니다.')
      }

      setDashboard(data)
      writeDashboardCache(data)
    } catch (error) {
      if (!silent) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : '플레이스 추적 현황 조회 중 문제가 발생했습니다.',
        )
      }
    } finally {
      if (!silent) {
        setIsLoadingDashboard(false)
      }
    }
  }, [hasTrackedKeywords, places])

  const refreshPlaceDashboard = async (placeId: number) => {
    setRefreshingPlaceId(placeId)
    setErrorMessage('')

    try {
      const response = await fetch(`/api/place-tracking/dashboard?placeId=${placeId}`, {
        cache: 'no-store',
      })
      const data = (await response.json()) as TrackingDashboardResponse & { message?: string }
      const refreshedPlace = data.places[0]

      if (!response.ok || !refreshedPlace) {
        throw new Error(data.message || '플레이스 순위를 확인하지 못했습니다.')
      }

      setDashboard((current) => {
        const nextDashboard = current
          ? {
              ...current,
              updatedAt: data.updatedAt,
              places: current.places.map((place) =>
                place.id === refreshedPlace.id ? refreshedPlace : place,
              ),
            }
          : data

        writeDashboardCache(nextDashboard)

        return nextDashboard
      })
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : '플레이스 순위 새로고침 중 문제가 발생했습니다.',
      )
    } finally {
      setRefreshingPlaceId(null)
    }
  }

  useEffect(() => {
    refreshPlaces().catch(() => {
      setErrorMessage('플레이스 목록을 불러오지 못했습니다.')
    })
  }, [refreshPlaces])

  useEffect(() => {
    if (mode === 'manager') {
      return
    }

    refreshDashboard().catch(() => {
      setErrorMessage('플레이스 추적 현황 조회 중 문제가 발생했습니다.')
    })
  }, [hasTrackedKeywords, mode, refreshDashboard])

  useEffect(() => {
    if (mode === 'manager' || !hasTrackedKeywords || !dashboard) {
      return
    }

    let timeoutId: number | null = null

    const scheduleNextRefresh = () => {
      const cachedDashboard = readDashboardCache()
      const cacheAge = cachedDashboard ? Date.now() - cachedDashboard.cachedAt : dashboardAutoRefreshIntervalMs
      const delay = Math.max(0, dashboardAutoRefreshIntervalMs - cacheAge)

      timeoutId = window.setTimeout(() => {
        refreshDashboard(true, { silent: true }).catch(() => undefined)
      }, delay)
    }

    scheduleNextRefresh()

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [dashboard, hasTrackedKeywords, mode, refreshDashboard])

  if (mode === 'manager') {
    return (
      <PlaceTrackingManager
        isLoading={isLoadingPlaces}
        isOpen
        onChanged={async () => {
          await refreshPlaces()
        }}
        onClose={() => undefined}
        places={places}
        variant="page"
      />
    )
  }

  return (
    <section
      className={joinClassNames(
        'grid min-w-0 rounded-md border border-cyan-300/18 bg-[#0b1727]/82 shadow-[0_24px_70px_rgba(0,0,0,0.22)]',
        mobileCompact ? 'gap-3 p-3 md:gap-4 md:p-6' : 'gap-4 p-4 md:p-6',
        className,
      )}
    >
      <div className="grid min-w-0 gap-2 md:grid-cols-[1fr_auto] md:items-start md:gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/80 md:text-xs md:tracking-[0.2em]">
            Place Tracking
          </p>
          <h2 className="mt-1 break-keep text-xl font-black tracking-[-0.02em] text-white md:mt-2 md:text-4xl">
            내 플레이스 순위
          </h2>
          <p className={joinClassNames(
            'max-w-2xl break-keep font-semibold text-slate-300',
            mobileCompact
              ? 'mt-1 text-xs leading-5 md:mt-3 md:text-base md:leading-6'
              : 'mt-3 text-sm leading-6 md:text-base',
          )}>
            등록한 플레이스가 주요 키워드에서 몇 위인지 바로 확인합니다.
          </p>
        </div>

        <div className="hidden md:block" />
      </div>

      {errorMessage ? (
        <p className="rounded-md border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-100">
          {errorMessage}
        </p>
      ) : null}

      {!places.length && !isLoadingPlaces ? (
        <EmptyTrackingState onOpenManager={openManager} />
      ) : null}

      {places.length > 0 && !hasTrackedKeywords ? (
        <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
          <p className="break-keep text-sm font-bold text-slate-300">
            등록된 플레이스가 있습니다. 키워드를 추가하면 메인에서 순위를 바로 볼 수 있습니다.
          </p>
        </div>
      ) : null}

      {(isLoadingPlaces || isLoadingDashboard) && !dashboard ? (
        <PlaceTrackingDashboardSkeleton mobileCompact={mobileCompact} />
      ) : null}

      {dashboard?.places.length ? (
        <div className="grid gap-4">
          {dashboard.places.map((place) => (
            <TrackedPlaceCard
              key={place.id}
              isRefreshing={refreshingPlaceId === place.id}
              mobileCompact={mobileCompact}
              onOpenManager={openManager}
              onRefresh={() => refreshPlaceDashboard(place.id)}
              place={place}
            />
          ))}
        </div>
      ) : null}

      {!onOpenManagerPage ? (
        <PlaceTrackingManager
          isOpen={isManagerOpen}
          isLoading={isLoadingPlaces}
          onClose={() => setIsManagerOpen(false)}
          onChanged={async () => {
            await refreshPlaces()
            await refreshDashboard(true)
          }}
          places={places}
        />
      ) : null}
    </section>
  )
}

function EmptyTrackingState({ onOpenManager }: { onOpenManager: () => void }) {
  return (
    <div className="rounded-md border border-dashed border-cyan-300/22 bg-white/[0.025] p-5">
      <p className="break-keep text-base font-black text-white">
        아직 등록된 플레이스가 없습니다.
      </p>
      <p className="mt-2 break-keep text-sm font-semibold leading-6 text-slate-400">
        네이버 플레이스 URL을 등록하고 추적할 키워드를 추가하면 메인에서 순위를 확인할 수 있습니다.
      </p>
      <button
        type="button"
        onClick={onOpenManager}
        className="mt-4 h-11 rounded-md bg-cyan-100 px-4 text-sm font-black text-[#071018] transition hover:bg-white"
      >
        플레이스 등록
      </button>
    </div>
  )
}

function PlaceTrackingDashboardSkeleton({ mobileCompact }: { mobileCompact?: boolean }) {
  const skeletonKeywords = [0, 1, 2]

  return (
    <article
      aria-label="내 플레이스 순위 로딩 중"
      className={joinClassNames(
        'relative grid min-w-0 animate-pulse overflow-hidden rounded-md border border-cyan-300/14 bg-[#0a1220]/86 shadow-[0_18px_46px_rgba(0,0,0,0.18)]',
        mobileCompact ? 'gap-3 p-3 md:gap-4 md:p-5' : 'gap-4 p-4 md:p-5',
      )}
    >
      <div
        className={joinClassNames(
          'grid min-w-0 border-b border-white/10 md:grid-cols-[1fr_auto] md:items-start',
          mobileCompact ? 'gap-2 pb-3 md:gap-3 md:pb-4' : 'gap-3 pb-4',
        )}
      >
        <div className="min-w-0 pr-12 md:pr-0">
          <div className="h-6 w-28 rounded-md bg-white/[0.08] md:h-8 md:w-36" />
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 md:gap-2">
            <div className="h-7 w-28 rounded-full bg-white/[0.06]" />
            <div className="h-7 w-24 rounded-full bg-cyan-300/[0.08]" />
          </div>
        </div>
        <div className="absolute right-3 top-3 h-9 w-9 rounded-md bg-white/[0.06] md:static md:h-10 md:w-10" />
      </div>

      <div
        className={joinClassNames(
          'grid min-w-0',
          mobileCompact
            ? 'gap-1.5 sm:grid-cols-2 md:gap-3 xl:grid-cols-3 2xl:grid-cols-4'
            : 'gap-2 sm:grid-cols-2 md:gap-3 xl:grid-cols-3 2xl:grid-cols-4',
        )}
      >
        {skeletonKeywords.map((item) => (
          <div
            key={item}
            className={joinClassNames(
              'min-w-0 rounded-md border border-cyan-300/12 bg-[#0d1828]/82',
              mobileCompact
                ? 'flex items-center justify-between gap-2 px-2.5 py-2 md:grid md:min-h-28 md:content-between md:gap-3 md:px-3.5 md:py-3.5'
                : 'grid gap-3 px-3.5 py-3.5 md:min-h-28 md:content-between',
            )}
          >
            <div className="flex min-w-0 items-center gap-2 md:items-start md:justify-between md:gap-3">
              <div className="h-8 w-14 rounded-md bg-white/[0.08] md:h-10 md:w-16" />
              <div className="h-4 w-20 rounded-full bg-white/[0.06] md:hidden" />
              <div className="hidden h-4 w-16 rounded-full bg-white/[0.06] md:block" />
            </div>
            <div className={joinClassNames('min-w-0', mobileCompact ? 'hidden md:block' : '')}>
              <div className="h-5 w-32 rounded-md bg-white/[0.07]" />
            </div>
            {mobileCompact ? <div className="h-4 w-16 rounded-full bg-white/[0.06] md:hidden" /> : null}
          </div>
        ))}
      </div>
    </article>
  )
}

function readDashboardCache(): DashboardCacheEntry | null {
  try {
    const rawValue = window.localStorage.getItem(dashboardCacheStorageKey)
    const parsedValue = rawValue ? JSON.parse(rawValue) : null

    if (
      !parsedValue ||
      typeof parsedValue !== 'object' ||
      typeof parsedValue.cachedAt !== 'number' ||
      !parsedValue.data
    ) {
      return null
    }

    return parsedValue as DashboardCacheEntry
  } catch {
    return null
  }
}

function writeDashboardCache(data: TrackingDashboardResponse) {
  try {
    window.localStorage.setItem(
      dashboardCacheStorageKey,
      JSON.stringify({
        cachedAt: Date.now(),
        data,
      } satisfies DashboardCacheEntry),
    )
  } catch {
    // 캐시 저장 실패는 화면 동작에 영향을 주지 않는다.
  }
}

function isFreshDashboardCache(entry: DashboardCacheEntry, places: TrackedPlace[]) {
  if (Date.now() - entry.cachedAt >= dashboardAutoRefreshIntervalMs) {
    return false
  }

  return isDashboardCacheForCurrentTargets(entry.data, places)
}

function isDashboardCacheForCurrentTargets(data: TrackingDashboardResponse, places: TrackedPlace[]) {
  const currentTargets = createTrackingTargetSignatureFromPlaces(places)
  const cachedTargets = createTrackingTargetSignatureFromDashboard(data)

  return currentTargets === cachedTargets
}

function createTrackingTargetSignatureFromPlaces(places: TrackedPlace[]) {
  return places
    .map((place) => {
      const keywordIds = place.keywords
        .map((keyword) => keyword.id)
        .sort((left, right) => left - right)
        .join(',')

      return `${place.id}:${keywordIds}`
    })
    .sort()
    .join('|')
}

function createTrackingTargetSignatureFromDashboard(data: TrackingDashboardResponse) {
  return data.places
    .map((place) => {
      const keywordIds = place.keywords
        .map((keyword) => keyword.keywordId)
        .sort((left, right) => left - right)
        .join(',')

      return `${place.id}:${keywordIds}`
    })
    .sort()
    .join('|')
}

function TrackedPlaceCard({
  isRefreshing,
  mobileCompact,
  onOpenManager,
  onRefresh,
  place,
}: {
  isRefreshing: boolean
  mobileCompact?: boolean
  onOpenManager: () => void
  onRefresh: () => void
  place: TrackingDashboardPlace
}) {
  return (
    <article
      className={joinClassNames(
        'relative grid min-w-0 rounded-md border border-cyan-300/14 bg-[#0a1220]/86 shadow-[0_18px_46px_rgba(0,0,0,0.18)]',
        mobileCompact ? 'gap-3 p-3 md:gap-4 md:p-5' : 'gap-4 p-4 md:p-5',
      )}
    >
      <div className={joinClassNames(
        'grid min-w-0 border-b border-white/10 md:grid-cols-[1fr_auto] md:items-start',
        mobileCompact ? 'gap-2 pb-3 md:gap-3 md:pb-4' : 'gap-3 pb-4',
      )}>
        <div className="min-w-0 pr-12 md:pr-0">
          <p className={joinClassNames(
            'truncate font-black text-white',
            mobileCompact ? 'text-lg md:text-2xl' : 'text-xl md:text-2xl',
          )}>
            {place.placeName}
          </p>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 md:gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-black text-slate-400 md:px-3 md:text-xs">
              ID {place.naverPlaceId}
            </span>
            <button
              type="button"
              onClick={onOpenManager}
              className="inline-flex h-7 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/7 px-2.5 text-[11px] font-black text-cyan-100 transition hover:bg-cyan-300/12 md:h-8 md:px-3 md:text-xs"
            >
              플레이스 관리 →
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label={`${place.placeName} 순위 새로고침`}
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-md border border-white/10 bg-white/[0.05] text-white transition hover:border-cyan-300/45 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60 md:static md:h-10 md:w-10"
        >
          {isRefreshing ? (
            <span className="block h-4 w-4 animate-spin rounded-full border-2 border-cyan-100/30 border-t-cyan-100" />
          ) : (
            <svg
              aria-hidden="true"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10" />
              <path d="M20.5 15a9 9 0 0 1-14.9 3.4L1 14" />
            </svg>
          )}
        </button>
      </div>

      <div className={joinClassNames(
        'grid min-w-0',
        mobileCompact
          ? 'gap-1.5 sm:grid-cols-2 md:gap-3 xl:grid-cols-3 2xl:grid-cols-4'
          : 'gap-2 sm:grid-cols-2 md:gap-3 xl:grid-cols-3 2xl:grid-cols-4',
      )}>
        {place.keywords.map((keyword) => (
          <div
            key={keyword.keywordId}
            className={joinClassNames(
              'min-w-0 rounded-md border border-cyan-300/12 bg-[#0d1828]/82',
              mobileCompact
                ? 'flex items-center justify-between gap-2 px-2.5 py-2 md:grid md:min-h-28 md:content-between md:gap-3 md:px-3.5 md:py-3.5'
                : 'grid gap-3 px-3.5 py-3.5 md:min-h-28 md:content-between',
            )}
          >
            <div className={joinClassNames(
              'flex min-w-0 items-center gap-2',
              mobileCompact ? 'md:items-start md:justify-between md:gap-3' : 'items-start justify-between gap-3',
            )}>
              <RankBadge
                mobileCompact={mobileCompact}
                rank={keyword.rank}
                status={keyword.status}
              />
              <div className={mobileCompact ? 'min-w-0 md:hidden' : 'hidden'}>
                <p className="truncate text-sm font-black leading-tight text-slate-50">
                  {keyword.keyword}
                </p>
              </div>
              <div className={mobileCompact ? 'hidden md:block' : ''}>
                <RankChange change={keyword.rankChange} mobileCompact={mobileCompact} />
              </div>
            </div>
            <div className={joinClassNames('min-w-0', mobileCompact ? 'hidden md:block' : '')}>
              <p className="truncate text-base font-black leading-tight text-slate-50 md:text-lg">
                {keyword.keyword}
              </p>
            </div>
            {mobileCompact ? (
              <div className="shrink-0 md:hidden">
                <RankChange change={keyword.rankChange} mobileCompact />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </article>
  )
}

function RankBadge({
  mobileCompact,
  rank,
  status,
}: {
  mobileCompact?: boolean
  rank: number | null
  status: 'found' | 'not_found'
}) {
  if (status === 'not_found' || !rank) {
    return (
      <span className={joinClassNames(
        'inline-flex w-fit rounded-md border border-white/10 bg-white/[0.035] font-black text-slate-500',
        mobileCompact
          ? 'px-2 py-1.5 text-xs md:px-3 md:py-2 md:text-lg'
          : 'px-3 py-2 text-base md:text-lg',
      )}>
        미노출
      </span>
    )
  }

  const colorClass =
    rank <= 3
      ? 'border-yellow-300/45 bg-yellow-300/14 text-yellow-100'
      : rank <= 10
        ? 'border-cyan-300/40 bg-cyan-300/12 text-cyan-100'
        : rank <= 30
          ? 'border-slate-300/22 bg-slate-300/10 text-slate-100'
          : 'border-white/10 bg-white/[0.035] text-slate-300'

  return (
    <span className={joinClassNames(
      'inline-flex w-fit rounded-md border font-black leading-none',
      mobileCompact
        ? 'px-2 py-1.5 text-base md:px-3 md:py-2 md:text-2xl'
        : 'px-3 py-2 text-lg md:text-2xl',
      colorClass,
    )}>
      {rank}위
    </span>
  )
}

function RankChange({
  change,
  mobileCompact,
}: {
  change: TrackingDashboardPlace['keywords'][number]['rankChange']
  mobileCompact?: boolean
}) {
  if (!change || change.direction === 'same') {
    return (
      <p className={joinClassNames(
        'shrink-0 whitespace-nowrap font-black text-slate-500',
        mobileCompact ? 'text-xs md:pt-1 md:text-base' : 'pt-1 text-sm md:text-base',
      )}>
        변동 없음
      </p>
    )
  }

  const isUp = change.direction === 'up'

  return (
    <p className={joinClassNames(
      'shrink-0 whitespace-nowrap font-black',
      mobileCompact ? 'text-xs md:pt-1 md:text-base' : 'pt-1 text-sm md:text-base',
      isUp ? 'text-rose-300' : 'text-blue-300',
    )}>
      {isUp ? '▲' : '▼'} {change.delta}
    </p>
  )
}

function PlaceTrackingManager({
  isOpen,
  isLoading,
  onChanged,
  onClose,
  places,
  variant = 'modal',
}: {
  isOpen: boolean
  isLoading: boolean
  onChanged: () => Promise<void>
  onClose: () => void
  places: TrackedPlace[]
  variant?: 'modal' | 'page'
}) {
  const [placeUrl, setPlaceUrl] = useState('')
  const [preview, setPreview] = useState<PlacePreview | null>(null)
  const [activePlaceId, setActivePlaceId] = useState<number | null>(null)
  const [keywordInput, setKeywordInput] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const activePlace = places.find((place) => place.id === activePlaceId) ?? places[0] ?? null

  useEffect(() => {
    if (!activePlaceId && places[0]) {
      setActivePlaceId(places[0].id)
    }
  }, [activePlaceId, places])

  if (!isOpen && variant === 'modal') {
    return null
  }

  const submitPreview = async (event: FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage('')

    try {
      const response = await fetch('/api/place-tracking/places', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          placeUrl,
        }),
      })
      const data = (await response.json()) as { preview?: PlacePreview; message?: string }

      if (!response.ok || !data.preview) {
        throw new Error(data.message || '플레이스 URL을 확인하지 못했습니다.')
      }

      setPreview(data.preview)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '플레이스 확인 중 문제가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const registerPlace = async () => {
    if (!preview) {
      return
    }

    setIsSubmitting(true)
    setMessage('')

    try {
      const response = await fetch('/api/place-tracking/places', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          ...preview,
        }),
      })
      const data = (await response.json()) as { place?: TrackedPlace; message?: string }

      if (!response.ok || !data.place) {
        throw new Error(data.message || '플레이스 등록에 실패했습니다.')
      }

      setPlaceUrl('')
      setPreview(null)
      setActivePlaceId(data.place.id)
      await onChanged()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '플레이스 등록 중 문제가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const addKeyword = async (event: FormEvent) => {
    event.preventDefault()

    if (!activePlace || !keywordInput.trim()) {
      return
    }

    setIsSubmitting(true)
    setMessage('')

    try {
      const response = await fetch('/api/place-tracking/keywords', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          placeId: activePlace.id,
          keyword: keywordInput,
        }),
      })
      const data = (await response.json()) as { message?: string }

      if (!response.ok) {
        throw new Error(data.message || '키워드 등록에 실패했습니다.')
      }

      setKeywordInput('')
      await onChanged()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '키워드 등록 중 문제가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const deletePlace = async (id: number) => {
    if (!window.confirm('플레이스를 삭제할까요? 등록된 키워드도 함께 삭제됩니다.')) {
      return
    }

    await mutate('/api/place-tracking/places', {
      action: 'delete',
      id,
    })
    setActivePlaceId(null)
    await onChanged()
  }

  const deleteKeyword = async (id: number) => {
    await mutate('/api/place-tracking/keywords', {
      action: 'delete',
      id,
    })
    await onChanged()
  }

  const managerContent = (
      <div
        className={`mx-auto grid w-full max-w-5xl gap-4 rounded-md border border-cyan-300/20 bg-[#080b14] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.55)] md:p-6 ${
          variant === 'modal' ? 'my-0 md:my-8' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/75">
              Place Manager
            </p>
            <h3 className="mt-2 text-2xl font-black text-white">플레이스 관리</h3>
          </div>
          {variant === 'modal' ? (
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-md border border-white/10 px-4 text-sm font-black text-slate-100"
            >
              닫기
            </button>
          ) : null}
        </div>

        <form onSubmit={submitPreview} className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={placeUrl}
            onChange={(event) => setPlaceUrl(event.target.value)}
            placeholder="네이버 플레이스 URL 입력"
            className="h-12 min-w-0 rounded-md border border-white/10 bg-[#070a12] px-4 text-sm font-bold text-white outline-none transition focus:border-cyan-300/60"
          />
          <button
            type="submit"
            disabled={!placeUrl.trim() || isSubmitting}
            className="h-12 rounded-md border border-cyan-300/35 bg-cyan-300/10 px-5 text-sm font-black text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            URL 확인
          </button>
        </form>

        {preview ? (
          <div className="grid gap-3 rounded-md border border-cyan-300/22 bg-cyan-300/8 p-4 md:grid-cols-[1fr_auto_auto] md:items-center">
            <p className="break-keep text-sm font-bold text-cyan-50">
              조회된 플레이스는 <strong className="text-white">'{preview.placeName}'</strong> 입니다.
              등록하시겠습니까?
            </p>
            <button
              type="button"
              onClick={registerPlace}
              disabled={isSubmitting}
              className="h-10 rounded-md bg-cyan-100 px-4 text-sm font-black text-[#071018]"
            >
              확인
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="h-10 rounded-md border border-white/10 px-4 text-sm font-black text-slate-200"
            >
              취소
            </button>
          </div>
        ) : null}

        {message ? (
          <p className="rounded-md border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-100">
            {message}
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="grid content-start gap-2 rounded-md border border-white/10 bg-white/[0.025] p-3">
            <p className="px-1 text-xs font-black uppercase tracking-[0.14em] text-cyan-200/70">
              Places
            </p>
            {isLoading ? <p className="px-1 text-sm font-bold text-slate-400">불러오는 중</p> : null}
            {places.map((place) => (
              <div
                key={place.id}
                className={`grid gap-2 rounded-md border p-3 text-left ${
                  activePlace?.id === place.id
                    ? 'border-cyan-300/45 bg-cyan-300/10'
                    : 'border-white/10 bg-white/[0.025]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActivePlaceId(place.id)}
                  className="min-w-0 text-left"
                >
                  <span className="block truncate text-sm font-black text-white">
                    {place.placeName}
                  </span>
                  <span className="mt-1 block text-xs font-bold text-slate-500">
                    키워드 {place.keywords.length}개
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => deletePlace(place.id)}
                  className="h-9 w-fit rounded-md border border-rose-300/20 px-3 text-xs font-black text-rose-100"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-white/10 bg-white/[0.025] p-4">
            {activePlace ? (
              <div className="grid gap-4">
                <div className="min-w-0">
                  <p className="truncate text-xl font-black text-white">{activePlace.placeName}</p>
                  <p className="mt-1 truncate text-xs font-bold text-slate-500">
                    {activePlace.placeUrl}
                  </p>
                </div>

                <form onSubmit={addKeyword} className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    value={keywordInput}
                    onChange={(event) => setKeywordInput(event.target.value)}
                    placeholder="추적 키워드 입력"
                    className="h-11 min-w-0 rounded-md border border-white/10 bg-[#070a12] px-4 text-sm font-bold text-white outline-none transition focus:border-cyan-300/60"
                  />
                  <button
                    type="submit"
                    disabled={!keywordInput.trim() || isSubmitting}
                    className="h-11 rounded-md border border-cyan-300/35 bg-cyan-300/10 px-4 text-sm font-black text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    키워드 추가
                  </button>
                </form>

                <div className="grid gap-2">
                  {activePlace.keywords.map((keyword) => (
                    <div
                      key={keyword.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.035] px-3 py-3"
                    >
                      <span className="min-w-0 truncate text-sm font-black text-slate-100">
                        {keyword.keyword}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteKeyword(keyword.id)}
                        className="shrink-0 rounded-md border border-white/10 px-3 py-2 text-xs font-black text-slate-300"
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm font-bold text-slate-400">플레이스를 먼저 등록해주세요.</p>
            )}
          </div>
        </div>
      </div>
  )

  if (variant === 'page') {
    return managerContent
  }

  return (
    <div
      className="fixed inset-0 z-[45] overflow-y-auto overscroll-contain bg-black/65 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+88px)] backdrop-blur-sm [-webkit-overflow-scrolling:touch] [touch-action:pan-y] md:z-[90] md:p-4"
      data-aiva-scroll-lock-allow="true"
    >
      {managerContent}
    </div>
  )
}

async function mutate(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => null) as { message?: string } | null

    throw new Error(data?.message || '요청 처리 중 문제가 발생했습니다.')
  }
}
