'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
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
  compact?: boolean
}

export function PlaceTrackingDashboard({ compact = false }: PlaceTrackingDashboardProps) {
  const [dashboard, setDashboard] = useState<TrackingDashboardResponse | null>(null)
  const [places, setPlaces] = useState<TrackedPlace[]>([])
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false)
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false)
  const [isManagerOpen, setIsManagerOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const hasTrackedKeywords = useMemo(
    () => places.some((place) => place.keywords.length > 0),
    [places],
  )

  const refreshPlaces = async () => {
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
  }

  const refreshDashboard = async (force = false) => {
    if (!force && !hasTrackedKeywords) {
      setDashboard(null)
      return
    }

    setIsLoadingDashboard(true)
    setErrorMessage('')

    try {
      const response = await fetch('/api/place-tracking/dashboard', {
        cache: 'no-store',
      })
      const data = (await response.json()) as TrackingDashboardResponse & { message?: string }

      if (!response.ok) {
        throw new Error(data.message || '플레이스 순위를 확인하지 못했습니다.')
      }

      setDashboard(data)
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : '플레이스 추적 현황 조회 중 문제가 발생했습니다.',
      )
    } finally {
      setIsLoadingDashboard(false)
    }
  }

  useEffect(() => {
    refreshPlaces().catch(() => {
      setErrorMessage('플레이스 목록을 불러오지 못했습니다.')
    })
  }, [])

  useEffect(() => {
    refreshDashboard().catch(() => {
      setErrorMessage('플레이스 추적 현황 조회 중 문제가 발생했습니다.')
    })
  }, [hasTrackedKeywords])

  return (
    <section className="grid min-w-0 gap-4 rounded-md border border-cyan-300/18 bg-[#07101d]/78 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.22)] md:p-6">
      <div className="grid min-w-0 gap-4 md:grid-cols-[1fr_auto] md:items-start">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200/80">
            Place Tracking
          </p>
          <h2 className="mt-2 break-keep text-2xl font-black tracking-[-0.02em] text-white md:text-4xl">
            내 플레이스 순위
          </h2>
          <p className="mt-3 max-w-2xl break-keep text-sm font-semibold leading-6 text-slate-300 md:text-base">
            등록한 플레이스가 주요 키워드에서 몇 위인지 바로 확인합니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 md:justify-end">
          <button
            type="button"
            onClick={() => setIsManagerOpen(true)}
            className="h-11 rounded-md border border-cyan-300/35 bg-cyan-300/10 px-4 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/16"
          >
            플레이스 관리
          </button>
          <button
            type="button"
            onClick={() => refreshDashboard()}
            disabled={!hasTrackedKeywords || isLoadingDashboard}
            className="h-11 rounded-md border border-white/10 bg-white/[0.045] px-4 text-sm font-black text-slate-100 transition hover:border-cyan-300/35 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoadingDashboard ? '조회 중' : '순위 새로고침'}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p className="rounded-md border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-100">
          {errorMessage}
        </p>
      ) : null}

      {!places.length && !isLoadingPlaces ? (
        <EmptyTrackingState onOpenManager={() => setIsManagerOpen(true)} />
      ) : null}

      {places.length > 0 && !hasTrackedKeywords ? (
        <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
          <p className="break-keep text-sm font-bold text-slate-300">
            등록된 플레이스가 있습니다. 키워드를 추가하면 메인에서 순위를 바로 볼 수 있습니다.
          </p>
        </div>
      ) : null}

      {isLoadingDashboard ? (
        <div className="rounded-md border border-cyan-300/18 bg-cyan-300/8 p-4">
          <div className="flex items-center gap-3">
            <span className="block h-5 w-5 animate-spin rounded-full border-2 border-cyan-100/30 border-t-cyan-100" />
            <p className="text-sm font-black text-cyan-100">
              등록된 키워드 순위를 확인하고 있습니다.
            </p>
          </div>
        </div>
      ) : null}

      {dashboard?.places.length ? (
        <div className={`grid gap-3 ${compact ? 'md:grid-cols-2' : 'lg:grid-cols-2'}`}>
          {dashboard.places.map((place) => (
            <TrackedPlaceCard key={place.id} place={place} />
          ))}
        </div>
      ) : null}

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

function TrackedPlaceCard({ place }: { place: TrackingDashboardPlace }) {
  return (
    <article className="min-w-0 rounded-md border border-white/10 bg-[#090e1a]/82 p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xl font-black text-white">{place.placeName}</p>
          <p className="mt-1 truncate text-xs font-bold text-slate-500">
            ID {place.naverPlaceId}
          </p>
        </div>
        <a
          href={place.placeUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-md border border-white/10 px-3 py-2 text-xs font-black text-slate-300 transition hover:border-cyan-300/45 hover:text-cyan-100"
        >
          열기
        </a>
      </div>

      <div className="mt-4 grid gap-2">
        {place.keywords.map((keyword) => (
          <div
            key={keyword.keywordId}
            className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-white/10 bg-white/[0.035] px-3 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-100">{keyword.keyword}</p>
              <RankChange change={keyword.rankChange} />
            </div>
            <RankBadge rank={keyword.rank} status={keyword.status} />
          </div>
        ))}
      </div>
    </article>
  )
}

function RankBadge({
  rank,
  status,
}: {
  rank: number | null
  status: 'found' | 'not_found'
}) {
  if (status === 'not_found' || !rank) {
    return (
      <span className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-sm font-black text-slate-500">
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
    <span className={`rounded-md border px-3 py-2 text-sm font-black ${colorClass}`}>
      {rank}위
    </span>
  )
}

function RankChange({
  change,
}: {
  change: TrackingDashboardPlace['keywords'][number]['rankChange']
}) {
  if (!change || change.direction === 'same') {
    return <p className="mt-1 text-xs font-bold text-slate-500">전일 대비 -</p>
  }

  const isUp = change.direction === 'up'

  return (
    <p className={`mt-1 text-xs font-black ${isUp ? 'text-rose-300' : 'text-blue-300'}`}>
      전일 대비 {isUp ? '▲' : '▼'} {change.delta}
    </p>
  )
}

function PlaceTrackingManager({
  isOpen,
  isLoading,
  onChanged,
  onClose,
  places,
}: {
  isOpen: boolean
  isLoading: boolean
  onChanged: () => Promise<void>
  onClose: () => void
  places: TrackedPlace[]
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

  if (!isOpen) {
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

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/65 p-4 backdrop-blur-sm">
      <div className="mx-auto my-8 grid w-full max-w-5xl gap-4 rounded-md border border-cyan-300/20 bg-[#080b14] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.55)] md:p-6">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/75">
              Place Manager
            </p>
            <h3 className="mt-2 text-2xl font-black text-white">플레이스 관리</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-md border border-white/10 px-4 text-sm font-black text-slate-100"
          >
            닫기
          </button>
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
