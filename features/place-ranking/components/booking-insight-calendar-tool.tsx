'use client'

import { FormEvent, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '@/features/platform/components/use-body-scroll-lock'
import type {
  PlaceBookingInsightBlock,
  PlaceBookingInsightResponse,
  PlaceRankingItem,
  PlaceRankingResponse,
} from '../types'

type PlaceRankingErrorBody = {
  message?: string
  debug?: unknown
}

const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토']

export function BookingInsightCalendarTool() {
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState<PlaceRankingItem[]>([])
  const [selectedPlace, setSelectedPlace] = useState<PlaceRankingItem | null>(null)
  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth())
  const [insight, setInsight] = useState<PlaceBookingInsightResponse | null>(null)
  const [selectedAiBlock, setSelectedAiBlock] = useState<PlaceBookingInsightBlock | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingInsight, setIsLoadingInsight] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const calendarDays = useMemo(() => createCalendarDays(yearMonth), [yearMonth])
  const canSearch = query.trim().length > 0 && !isSearching

  const submitSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSearch) {
      return
    }

    setIsSearching(true)
    setErrorMessage('')
    setSelectedPlace(null)
    setInsight(null)

    try {
      const result = await requestRankings(query.trim())
      setPlaces(result.items.filter((item) => item.actions.bookingUrl || item.actions.bookingBusinessId))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '플레이스 검색에 실패했습니다.')
    } finally {
      setIsSearching(false)
    }
  }

  const loadInsight = async (place: PlaceRankingItem, nextYearMonth = yearMonth) => {
    setSelectedPlace(place)
    setIsLoadingInsight(true)
    setErrorMessage('')

    try {
      const data = await requestBookingInsight(place, nextYearMonth)
      setInsight(data)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'AI 예약 수요 캘린더 조회에 실패했습니다.')
    } finally {
      setIsLoadingInsight(false)
    }
  }

  const moveMonth = async (direction: -1 | 1) => {
    const nextYearMonth = addMonths(yearMonth, direction)
    setYearMonth(nextYearMonth)
    if (selectedPlace) {
      await loadInsight(selectedPlace, nextYearMonth)
    }
  }

  const moveToday = async () => {
    const nextYearMonth = getCurrentYearMonth()
    setYearMonth(nextYearMonth)
    if (selectedPlace) {
      await loadInsight(selectedPlace, nextYearMonth)
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5">
      <section className="rounded-md border border-cyan-300/18 bg-[#0b1727]/82 p-4 shadow-[0_0_34px_rgba(34,211,238,0.08)] md:p-6">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200/80">
          AI Booking Calendar
        </p>
        <div className="mt-2 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <h1 className="text-2xl font-black tracking-[-0.02em] text-white md:text-4xl">
              AI 예약 수요 캘린더
            </h1>
            <p className="mt-2 break-keep text-sm font-semibold leading-6 text-slate-300 md:text-base">
              실예약과 AI 예측 예약을 월간 캘린더에서 함께 확인하는 운영 대시보드입니다.
            </p>
          </div>
          <span className="w-fit rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-1 text-xs font-black text-cyan-100">
            최대 4주 예측
          </span>
        </div>

        <form onSubmit={submitSearch} className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예: 라솝뷰티"
            className="min-h-13 rounded-md border border-white/10 bg-[#090d18] px-4 text-base font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10"
            disabled={isSearching}
          />
          <button
            type="submit"
            disabled={!canSearch}
            className="min-h-13 rounded-md bg-white px-6 text-sm font-black text-[#070a12] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isSearching ? '검색중...' : '플레이스 검색'}
          </button>
        </form>

        {places.length ? (
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {places.slice(0, 6).map((place) => (
              <button
                key={place.id}
                type="button"
                onClick={() => loadInsight(place)}
                className={`grid min-w-0 gap-2 rounded-md border p-3 text-left transition hover:border-cyan-300/45 hover:bg-cyan-300/10 ${
                  selectedPlace?.id === place.id
                    ? 'border-cyan-300/45 bg-cyan-300/10'
                    : 'border-white/10 bg-white/[0.035]'
                }`}
              >
                <span className="truncate text-sm font-black text-white">{place.name}</span>
                <span className="truncate text-xs font-bold text-cyan-100/75">{place.category}</span>
                <span className="truncate text-xs font-bold text-slate-400">
                  {place.location.commonAddress || place.location.roadAddress || place.location.address || '주소 미확인'}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {errorMessage ? (
          <p className="mt-4 rounded-md border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-100">
            {errorMessage}
          </p>
        ) : null}
      </section>

      <section className="rounded-md border border-cyan-300/18 bg-[#0b1727]/82 p-4 shadow-[0_0_34px_rgba(34,211,238,0.08)] md:p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/75">
              Monthly Calendar
            </p>
            <h2 className="mt-1 text-xl font-black text-white md:text-2xl">
              {formatYearMonthTitle(yearMonth)}
            </h2>
            {selectedPlace ? (
              <p className="mt-1 truncate text-sm font-bold text-slate-400">{selectedPlace.name}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => moveMonth(-1)} className="h-10 rounded-md border border-white/10 bg-white/[0.05] px-3 text-sm font-black text-white transition hover:bg-white/[0.1]">
              이전 달
            </button>
            <button type="button" onClick={moveToday} className="h-10 rounded-md border border-cyan-300/25 bg-cyan-300/[0.08] px-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15">
              오늘
            </button>
            <button type="button" onClick={() => moveMonth(1)} className="h-10 rounded-md border border-white/10 bg-white/[0.05] px-3 text-sm font-black text-white transition hover:bg-white/[0.1]">
              다음 달
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 border-y border-white/10 text-center text-xs font-black text-slate-400">
          {weekdayLabels.map((label) => (
            <div key={label} className="py-2">{label}</div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2 pt-3 md:grid-cols-7 md:gap-0 md:pt-0">
          {calendarDays.map((date) => (
            <CalendarDayCell
              key={date.key}
              date={date}
              day={insight?.days[date.date]}
              isLoading={isLoadingInsight}
              onOpenAiBlock={setSelectedAiBlock}
            />
          ))}
        </div>
      </section>

      {isLoadingInsight ? <InsightSkeleton /> : null}

      {insight ? <InsightAnalysisPanel insight={insight} /> : null}

      <AiBlockDetailModal block={selectedAiBlock} onClose={() => setSelectedAiBlock(null)} />
    </div>
  )
}

function CalendarDayCell({
  date,
  day,
  isLoading,
  onOpenAiBlock,
}: {
  date: CalendarDate
  day?: PlaceBookingInsightResponse['days'][string]
  isLoading: boolean
  onOpenAiBlock: (block: PlaceBookingInsightBlock) => void
}) {
  const isMuted = !date.isCurrentMonth
  const visibleActualBlocks = day?.actualBlocks.slice(0, 3) ?? []
  const visibleAiBlocks = day?.aiBlocks.slice(0, 3) ?? []
  const overflowCount =
    Math.max((day?.actualBlocks.length ?? 0) - visibleActualBlocks.length, 0) +
    Math.max((day?.aiBlocks.length ?? 0) - visibleAiBlocks.length, 0)

  return (
    <div
      className={`min-h-[8.75rem] rounded-md border border-white/10 bg-[#080f1d]/86 p-2 md:rounded-none md:border-l-0 md:border-t-0 ${
        isMuted ? 'opacity-35' : ''
      } ${date.isToday ? 'ring-2 ring-cyan-300/35' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-black ${date.isToday ? 'text-cyan-100' : 'text-slate-200'}`}>
          {date.day}
        </span>
        {day?.isClosed ? (
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-black text-slate-500">
            휴무
          </span>
        ) : null}
      </div>

      <div className="mt-2 grid gap-1">
        {isLoading && date.isCurrentMonth ? (
          <>
            <span className="h-5 animate-pulse rounded bg-white/[0.08]" />
            <span className="h-5 w-2/3 animate-pulse rounded bg-white/[0.06]" />
          </>
        ) : null}

        {!isLoading && visibleActualBlocks.map((block) => (
          <span
            key={block.id}
            className="truncate rounded border border-cyan-300/20 bg-cyan-300/14 px-2 py-1 text-[11px] font-black text-cyan-50"
            title={block.productName}
          >
            {block.time} 실예약
          </span>
        ))}

        {!isLoading && visibleAiBlocks.map((block) => (
          <button
            key={block.id}
            type="button"
            onClick={() => onOpenAiBlock(block)}
            className="truncate rounded border border-dashed border-fuchsia-300/35 bg-fuchsia-300/10 px-2 py-1 text-left text-[11px] font-black text-fuchsia-100 transition hover:bg-fuchsia-300/18"
          >
            AI {block.time}
          </button>
        ))}

        {!isLoading && overflowCount > 0 ? (
          <span className="text-[11px] font-black text-slate-500">+{overflowCount}개 더 있음</span>
        ) : null}
      </div>
    </div>
  )
}

function InsightAnalysisPanel({ insight }: { insight: PlaceBookingInsightResponse }) {
  const accuracyItems = [
    insight.accuracy.recent7Days,
    insight.accuracy.recent4Weeks,
    insight.accuracy.monthToDate,
  ]

  return (
    <section className="grid gap-4 rounded-md border border-cyan-300/18 bg-[#0b1727]/82 p-4 shadow-[0_0_34px_rgba(34,211,238,0.08)] md:p-5">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="이번 달 실예약" value={`${insight.summary.monthActualBookings}건`} />
        <MetricCard label="AI 추가 예측" value={`${insight.summary.monthAiPredictedBookings}건`} tone="ai" />
        <MetricCard label="예상 최종 예약" value={`${insight.summary.monthExpectedFinalBookings}건`} />
        <MetricCard label="이번 주 상태" value={insight.summary.statusLabel} tone={insight.summary.statusLabel === '주의' ? 'warning' : 'good'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
          <h3 className="text-base font-black text-white">월간 운영 분석</h3>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-300">{insight.summary.insight}</p>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <ChipList title="예약 집중 예상 날짜" items={insight.summary.busyDates} />
            <ChipList title="비교적 여유로운 날짜" items={insight.summary.quietDates} />
            <ChipList title="예약 집중 예상 시간" items={insight.summary.busyTimes} />
            <ChipList title="비교적 여유로운 시간" items={insight.summary.quietTimes} />
          </div>
        </div>

        <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
          <h3 className="text-base font-black text-white">AI 적중률</h3>
          <div className="mt-3 grid gap-3">
            {accuracyItems.map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between gap-3 text-sm font-black">
                  <span className="text-slate-300">{item.label}</span>
                  <span className="text-cyan-100">{item.percent}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-fuchsia-300" style={{ width: `${item.percent}%` }} />
                </div>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {item.total ? `${item.matched}/${item.total}개 시간대 일치` : '비교 가능한 과거 예측 표본이 부족합니다.'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function AiBlockDetailModal({
  block,
  onClose,
}: {
  block: PlaceBookingInsightBlock | null
  onClose: () => void
}) {
  useBodyScrollLock(Boolean(block))

  if (!block) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] grid place-items-center overflow-hidden bg-black/65 p-4">
      <button type="button" aria-label="AI 예약 상세 닫기" className="absolute inset-0" onClick={onClose} />
      <section
        className="relative max-h-[88dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-md border border-cyan-300/22 bg-[#080c16] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.55)] [-webkit-overflow-scrolling:touch] [touch-action:pan-y]"
        data-aiva-scroll-lock-allow="true"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-fuchsia-200/80">
              AI Forecast
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">AI 예약 예측 상세</h2>
            <p className="mt-2 text-sm font-bold text-cyan-100">
              {block.date} · {block.time}
            </p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-md border border-white/10 bg-white/[0.05] text-xl font-black text-white">
            ×
          </button>
        </div>

        <div className="mt-5 rounded-md border border-fuchsia-300/25 bg-fuchsia-300/10 p-4">
          <p className="text-sm font-black text-fuchsia-100">
            예약 유입 가능성 {block.confidence ?? 0}%
          </p>
          <p className="mt-2 break-keep text-sm font-bold leading-6 text-slate-200">
            {block.reason ?? '최근 예약 패턴에서 유의미한 예약 신호가 확인된 시간입니다.'}
          </p>
        </div>

        <div className="mt-4 grid gap-2">
          {(block.basis ?? []).map((item) => (
            <p key={item} className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold leading-6 text-slate-300">
              {item}
            </p>
          ))}
        </div>
      </section>
    </div>,
    document.body,
  )
}

function InsightSkeleton() {
  return (
    <section className="rounded-md border border-cyan-300/18 bg-[#0b1727]/82 p-4 md:p-5">
      <div className="grid gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-md border border-white/10 bg-white/[0.05]" />
        ))}
      </div>
    </section>
  )
}

function MetricCard({
  label,
  tone = 'default',
  value,
}: {
  label: string
  tone?: 'default' | 'ai' | 'good' | 'warning'
  value: string
}) {
  const toneClass =
    tone === 'ai'
      ? 'border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-100'
      : tone === 'good'
        ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
        : tone === 'warning'
          ? 'border-amber-300/25 bg-amber-300/10 text-amber-100'
          : 'border-cyan-300/18 bg-white/[0.035] text-cyan-100'

  return (
    <div className={`rounded-md border p-4 ${toneClass}`}>
      <p className="text-xs font-black text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  )
}

function ChipList({ items, title }: { items: string[]; title: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-200/70">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.length ? items.map((item) => (
          <span key={item} className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs font-black text-slate-200">
            {item}
          </span>
        )) : (
          <span className="text-xs font-bold text-slate-500">충분한 신호 없음</span>
        )}
      </div>
    </div>
  )
}

async function requestRankings(keyword: string) {
  const response = await fetch('/api/place-ranking/rankings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword, limit: 50 }),
  })
  const body = (await response.json()) as PlaceRankingResponse | PlaceRankingErrorBody

  if (!response.ok) {
    throw new Error((body as PlaceRankingErrorBody).message ?? '플레이스 검색에 실패했습니다.')
  }

  return body as PlaceRankingResponse
}

async function requestBookingInsight(place: PlaceRankingItem, yearMonth: string) {
  const response = await fetch('/api/place-ranking/booking-insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bookingBusinessId: place.actions.bookingBusinessId,
      bookingUrl: place.actions.bookingUrl,
      yearMonth,
    }),
  })
  const body = (await response.json()) as PlaceBookingInsightResponse | PlaceRankingErrorBody

  if (!response.ok) {
    throw new Error((body as PlaceRankingErrorBody).message ?? 'AI 예약 수요 캘린더 조회에 실패했습니다.')
  }

  return body as PlaceBookingInsightResponse
}

type CalendarDate = {
  key: string
  date: string
  day: number
  isCurrentMonth: boolean
  isToday: boolean
}

function createCalendarDays(yearMonth: string): CalendarDate[] {
  const [year, month] = yearMonth.split('-').map(Number)
  const firstDate = new Date(year, month - 1, 1)
  const startDate = new Date(firstDate)
  startDate.setDate(firstDate.getDate() - firstDate.getDay())
  const today = getTodayDate()

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + index)
    const dateValue = formatDateValue(date)

    return {
      key: `${dateValue}:${index}`,
      date: dateValue,
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === month - 1,
      isToday: dateValue === today,
    }
  })
}

function addMonths(yearMonth: string, diff: number) {
  const [year, month] = yearMonth.split('-').map(Number)
  const date = new Date(year, month - 1 + diff, 1)

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getCurrentYearMonth() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

function getTodayDate() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function formatDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function formatYearMonthTitle(yearMonth: string) {
  const [year, month] = yearMonth.split('-')

  return `${year}년 ${Number(month)}월`
}
