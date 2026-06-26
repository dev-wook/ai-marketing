'use client'

import { FormEvent, ReactNode, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '@/features/platform/components/use-body-scroll-lock'
import type {
  PlaceBookingInsightBlock,
  PlaceBookingInsightResponse,
  PlaceBookingProduct,
  PlaceBookingStatusResponse,
  PlaceRankingItem,
  PlaceRankingResponse,
} from '../types'

type PlaceRankingErrorBody = {
  message?: string
  debug?: unknown
}

const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토']

type CalendarSelectOption = {
  label: string
  value: string
}

export function BookingInsightCalendarTool() {
  const [keyword, setKeyword] = useState('')
  const [places, setPlaces] = useState<PlaceRankingItem[]>([])
  const [selectedPlace, setSelectedPlace] = useState<PlaceRankingItem | null>(null)
  const [products, setProducts] = useState<PlaceBookingProduct[]>([])
  const [selectedProduct, setSelectedProduct] = useState<PlaceBookingProduct | null>(null)
  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth())
  const [insight, setInsight] = useState<PlaceBookingInsightResponse | null>(null)
  const [selectedAiBlock, setSelectedAiBlock] = useState<PlaceBookingInsightBlock | null>(null)
  const [selectedDay, setSelectedDay] = useState<PlaceBookingInsightResponse['days'][string] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingProducts, setIsLoadingProducts] = useState(false)
  const [isLoadingInsight, setIsLoadingInsight] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const calendarDays = useMemo(() => createCalendarDays(yearMonth), [yearMonth])
  const canSearch = Boolean(keyword.trim()) && !isSearching

  const submitSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSearch) {
      return
    }

    setIsSearching(true)
    setErrorMessage('')
    setProducts([])
    setSelectedProduct(null)
    setInsight(null)
    setSelectedPlace(null)
    setPlaces([])

    try {
      const ranking = await requestRankings(keyword)
      setPlaces(ranking.items)

      if (ranking.items.length === 0) {
        setErrorMessage('검색 결과가 없습니다. 다른 키워드로 다시 조회해주세요.')
        return
      }

      if (ranking.items.length === 1) {
        await selectPlace(ranking.items[0])
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '플레이스 검색에 실패했습니다.')
    } finally {
      setIsSearching(false)
    }
  }

  const selectPlace = async (place: PlaceRankingItem) => {
    setSelectedPlace(place)
    setSelectedProduct(null)
    setInsight(null)
    setErrorMessage('')
    setIsLoadingProducts(true)

    try {
      const status = await requestBookingStatus(place, getTodayDate())
      setProducts(status.products)
      if (status.products.length === 1) {
        setSelectedProduct(status.products[0])
      }
    } catch (error) {
      setProducts([])
      setErrorMessage(error instanceof Error ? error.message : '예약상품을 불러오지 못했습니다.')
    } finally {
      setIsLoadingProducts(false)
    }
  }

  const loadInsight = async (place = selectedPlace, product = selectedProduct, nextYearMonth = yearMonth) => {
    if (!place || !product) {
      setErrorMessage('플레이스와 예약상품을 먼저 선택해주세요.')
      return
    }

    setIsLoadingInsight(true)
    setErrorMessage('')

    try {
      const data = await requestBookingInsight(place, product, nextYearMonth)
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
    if (selectedPlace && selectedProduct && insight) {
      await loadInsight(selectedPlace, selectedProduct, nextYearMonth)
    }
  }

  const moveToday = async () => {
    const nextYearMonth = getCurrentYearMonth()
    setYearMonth(nextYearMonth)
    if (selectedPlace && selectedProduct && insight) {
      await loadInsight(selectedPlace, selectedProduct, nextYearMonth)
    }
  }

  const selectYearMonth = async (nextYearMonth: string) => {
    setYearMonth(nextYearMonth)
    if (selectedPlace && selectedProduct && insight) {
      await loadInsight(selectedPlace, selectedProduct, nextYearMonth)
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
          <div className="relative">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              aria-label="플레이스 검색어"
              placeholder="예: 라솝뷰티"
              className="min-h-13 w-full rounded-md border border-white/10 bg-[#090d18] px-4 pr-12 text-base font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10"
            />
          </div>
          <button
            type="submit"
            disabled={!canSearch}
            className="min-h-13 rounded-md bg-white px-6 text-sm font-black text-[#070a12] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isSearching ? '검색 중...' : '플레이스 검색'}
          </button>
        </form>

        {places.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {places.slice(0, 6).map((place) => (
              <button
                key={place.id}
                type="button"
                onClick={() => selectPlace(place)}
                className={`grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-md border p-3 text-left transition hover:border-cyan-300/45 hover:bg-cyan-300/10 ${
                  selectedPlace?.id === place.id
                    ? 'border-cyan-300/45 bg-cyan-300/10'
                    : 'border-white/10 bg-white/[0.035]'
                }`}
              >
                <span className="block h-16 w-16 overflow-hidden rounded-md border border-white/10 bg-white/[0.04]">
                  {place.images.mainImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={place.images.mainImageUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </span>
                <span className="grid min-w-0 content-center gap-1">
                  <span className="flex min-w-0 items-start justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-black text-white">{place.name}</span>
                    {selectedPlace?.id === place.id ? (
                      <span className="shrink-0 rounded-md bg-cyan-100 px-2 py-1 text-[10px] font-black text-[#071018]">
                        선택
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate text-xs font-bold text-cyan-100/75">{place.category}</span>
                  <span className="truncate text-xs font-bold text-slate-400">
                    {formatPlaceAddress(place)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {selectedPlace ? (
          <div className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-200/75">
                  Booking Product
                </p>
                <h2 className="mt-1 text-base font-black text-white">예약상품 선택</h2>
              </div>
              {isLoadingProducts ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-100/30 border-t-cyan-100" />
              ) : null}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => {
                    setSelectedProduct(product)
                    setInsight(null)
                  }}
                  className={`rounded-md border px-3 py-3 text-left transition hover:border-cyan-300/45 hover:bg-cyan-300/10 ${
                    selectedProduct?.id === product.id
                      ? 'border-cyan-300/45 bg-cyan-300/10'
                      : 'border-white/10 bg-[#080f1d]/75'
                  }`}
                >
                  <span className="block truncate text-sm font-black text-white">{product.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {errorMessage ? (
          <p className="mt-4 rounded-md border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-100">
            {errorMessage}
          </p>
        ) : null}
      </section>

      <section className="rounded-md border border-cyan-300/18 bg-[#0b1727]/82 p-4 shadow-[0_0_34px_rgba(34,211,238,0.08)] md:p-5">
        <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/75">
              Monthly Calendar
            </p>
            <h2 className="mt-1 text-xl font-black text-white md:text-2xl">
              {formatYearMonthTitle(yearMonth)}
            </h2>
            {selectedPlace ? (
              <p className="mt-1 truncate text-sm font-bold text-slate-400">
                {selectedPlace.name}{selectedProduct ? ` · ${selectedProduct.name}` : ''}
              </p>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-[auto_auto_auto_auto_auto_auto]">
            <CalendarSelect
              options={getYearOptions().map((year) => ({ label: `${year}년`, value: year }))}
              value={yearMonth.slice(0, 4)}
              onChange={(value) => void selectYearMonth(`${value}-${yearMonth.slice(5, 7)}`)}
            />
            <CalendarSelect
              options={Array.from({ length: 12 }, (_, index) => {
                const month = String(index + 1).padStart(2, '0')
                return { label: `${Number(month)}월`, value: month }
              })}
              value={yearMonth.slice(5, 7)}
              onChange={(value) => void selectYearMonth(`${yearMonth.slice(0, 4)}-${value}`)}
            />
            <button type="button" onClick={() => moveMonth(-1)} className="h-10 rounded-md border border-white/10 bg-white/[0.05] px-3 text-sm font-black text-white transition hover:bg-white/[0.1]">
              이전 달
            </button>
            <button type="button" onClick={moveToday} className="h-10 rounded-md border border-cyan-300/25 bg-cyan-300/[0.08] px-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15">
              오늘
            </button>
            <button type="button" onClick={() => moveMonth(1)} className="h-10 rounded-md border border-white/10 bg-white/[0.05] px-3 text-sm font-black text-white transition hover:bg-white/[0.1]">
              다음 달
            </button>
            <button
              type="button"
              onClick={() => loadInsight()}
              disabled={!selectedPlace || !selectedProduct || isLoadingInsight}
              className="h-10 rounded-md bg-white px-4 text-sm font-black text-[#070a12] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isLoadingInsight ? '조회 중' : '캘린더 조회'}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 border-y border-white/10 text-center text-xs font-black text-slate-400">
          {weekdayLabels.map((label) => (
            <div key={label} className="py-2">{label}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 overflow-hidden rounded-md border border-white/10 md:overflow-visible md:rounded-none md:border-0">
          {calendarDays.map((date) => (
            <CalendarDayCell
              key={date.key}
              date={date}
              day={insight?.days[date.date]}
              isLoading={isLoadingInsight}
              onOpenAiBlock={setSelectedAiBlock}
              onOpenDay={setSelectedDay}
            />
          ))}
        </div>
      </section>

      {isLoadingInsight ? <InsightSkeleton /> : null}

      {insight ? <InsightAnalysisPanel insight={insight} /> : null}

      <AiBlockDetailModal block={selectedAiBlock} onClose={() => setSelectedAiBlock(null)} />
      <DayDetailModal
        day={selectedDay}
        onClose={() => setSelectedDay(null)}
        onOpenAiBlock={setSelectedAiBlock}
      />
    </div>
  )
}

function formatPlaceAddress(place: PlaceRankingItem) {
  return (
    place.location.fullAddress ||
    place.location.address ||
    place.location.roadAddress ||
    place.location.commonAddress ||
    '주소 미확인'
  )
}

function CalendarSelect({
  onChange,
  options,
  value,
}: {
  onChange: (value: string) => void
  options: CalendarSelectOption[]
  value: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const selectedOption = options.find((option) => option.value === value) ?? options[0]

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false)
        }
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((next) => !next)}
        aria-expanded={isOpen}
        className={`flex h-10 w-full min-w-0 items-center justify-between gap-3 rounded-md border bg-[#090d18] px-3 text-left text-sm font-black text-white outline-none transition hover:border-cyan-300/35 hover:bg-white/[0.035] focus:ring-4 focus:ring-cyan-300/10 lg:min-w-[7rem] ${
          isOpen ? 'border-cyan-300/70' : 'border-white/10'
        }`}
      >
        <span className="truncate">{selectedOption?.label ?? value}</span>
        <span className={`text-lg leading-none text-cyan-100/75 transition ${isOpen ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-[calc(100%+0.4rem)] z-50 max-h-64 w-full min-w-[8rem] overflow-y-auto rounded-md border border-cyan-300/25 bg-[#070d18] p-1 shadow-[0_18px_44px_rgba(0,0,0,0.48)]">
          {options.map((option) => {
            const isSelected = option.value === value

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
                className={`flex h-9 w-full items-center justify-between rounded px-3 text-left text-sm font-black transition ${
                  isSelected
                    ? 'bg-cyan-300/14 text-cyan-50'
                    : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <span>{option.label}</span>
                {isSelected ? <span className="text-[10px] text-cyan-100">선택</span> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function CalendarDayCell({
  date,
  day,
  isLoading,
  onOpenAiBlock,
  onOpenDay,
}: {
  date: CalendarDate
  day?: PlaceBookingInsightResponse['days'][string]
  isLoading: boolean
  onOpenAiBlock: (block: PlaceBookingInsightBlock) => void
  onOpenDay: (day: PlaceBookingInsightResponse['days'][string]) => void
}) {
  const isMuted = !date.isCurrentMonth
  const combinedBlocks = sortBookingBlocksByTime([
    ...(day?.actualBlocks ?? []),
    ...(day?.aiBlocks ?? []),
  ])
  const mobileVisibleBlocks = combinedBlocks.slice(0, 3)
  const desktopVisibleBlocks = combinedBlocks.slice(0, 4)
  const mobileOverflowCount = Math.max(combinedBlocks.length - mobileVisibleBlocks.length, 0)
  const desktopOverflowCount = Math.max(combinedBlocks.length - desktopVisibleBlocks.length, 0)
  const canOpenDay = Boolean(day && combinedBlocks.length)

  return (
    <div
      className={`relative min-h-[5.8rem] border border-white/10 bg-[#080f1d]/86 p-1 md:min-h-[8.75rem] md:rounded-none md:border-l-0 md:border-t-0 md:p-2 ${
        isMuted ? 'opacity-35' : ''
      } ${date.isToday ? 'z-10 border-cyan-300/45 md:border-l md:border-t' : ''}`}
    >
      {date.isToday ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 border-2 border-cyan-300/45"
        />
      ) : null}
      <div className="flex min-w-0 items-center justify-between gap-1">
        {canOpenDay && day ? (
          <button
            type="button"
            onClick={() => onOpenDay(day)}
            className={`rounded px-0.5 text-[11px] font-black transition hover:bg-white/10 md:text-sm ${
              date.isToday ? 'text-cyan-100' : 'text-slate-200'
            }`}
          >
            {date.day}
          </button>
        ) : (
          <span className={`text-[11px] font-black md:text-sm ${date.isToday ? 'text-cyan-100' : 'text-slate-200'}`}>
            {date.day}
          </span>
        )}
        {day?.isClosed ? (
          <span className="rounded-full bg-white/[0.06] px-1 py-0.5 text-[8px] font-black text-slate-500 md:px-2 md:text-[10px]">
            <span className="md:hidden">휴</span>
            <span className="hidden md:inline">휴무</span>
          </span>
        ) : null}
      </div>

      <div className="mt-1 grid gap-0.5 md:mt-2 md:gap-1">
        {isLoading && date.isCurrentMonth ? (
          <>
            <span className="h-3 animate-pulse rounded bg-white/[0.08] md:h-5" />
            <span className="h-3 w-2/3 animate-pulse rounded bg-white/[0.06] md:h-5" />
          </>
        ) : null}

        <div className="contents md:hidden">
          {!isLoading && mobileVisibleBlocks.map((block) => (
            <BookingBlockPill
              key={block.id}
              block={block}
              onOpenAiBlock={onOpenAiBlock}
            />
          ))}
        </div>

        <div className="hidden contents md:contents">
          {!isLoading && desktopVisibleBlocks.map((block) => (
            <BookingBlockPill
              key={block.id}
              block={block}
              onOpenAiBlock={onOpenAiBlock}
            />
          ))}
        </div>

        {!isLoading && mobileOverflowCount > 0 && day ? (
          <button
            type="button"
            onClick={() => onOpenDay(day)}
            className="w-fit rounded-full border border-white/[0.08] bg-white/[0.03] px-0.5 py-0 text-[6px] font-bold leading-[10px] text-cyan-100/65 transition hover:bg-cyan-300/10 md:px-1.5 md:py-0.5 md:text-[10px] md:font-black md:leading-none md:text-cyan-100"
          >
            <span className="md:hidden">+{mobileOverflowCount}</span>
          </button>
        ) : null}

        {!isLoading && desktopOverflowCount > 0 && day ? (
          <button
            type="button"
            onClick={() => onOpenDay(day)}
            className="hidden w-fit rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-black leading-none text-cyan-100 transition hover:bg-cyan-300/10 md:inline-flex"
          >
            +{desktopOverflowCount}개 더 보기
          </button>
        ) : null}
      </div>
    </div>
  )
}

function BookingBlockPill({
  block,
  onOpenAiBlock,
}: {
  block: PlaceBookingInsightBlock
  onOpenAiBlock: (block: PlaceBookingInsightBlock) => void
}) {
  const className =
    block.type === 'ai'
      ? 'flex items-center justify-center truncate rounded border border-dashed border-cyan-200/40 bg-cyan-300/[0.08] px-1 py-px text-center text-[9px] font-black leading-3 text-cyan-100 transition hover:bg-cyan-300/16 md:block md:px-2 md:py-1 md:text-left md:text-[11px] md:leading-4'
      : 'truncate rounded border border-cyan-300/20 bg-cyan-300/14 px-1 py-0.5 text-center text-[9px] font-black leading-3 text-cyan-50 md:px-2 md:py-1 md:text-left md:text-[11px] md:leading-4'

  if (block.type === 'ai') {
    return (
      <button
        type="button"
        onClick={() => onOpenAiBlock(block)}
        className={className}
        title={block.productName}
      >
        <span className="inline-flex items-center justify-center rounded-[3px] bg-cyan-200/20 px-0.5 text-[7px] font-black leading-[9px] text-cyan-100 md:hidden">
          AI
        </span>
        <span className="hidden md:inline">
          <span className="mr-1 rounded bg-cyan-200/20 px-1 text-[9px] leading-none">AI</span>
          {block.time}
        </span>
      </button>
    )
  }

  return (
    <span className={className} title={block.productName}>
      <span className="md:hidden">예약</span>
      <span className="hidden md:inline">{block.time}</span>
    </span>
  )
}

function InsightAnalysisPanel({ insight }: { insight: PlaceBookingInsightResponse }) {
  const accuracyItems = [
    insight.accuracy.recent7Days,
    insight.accuracy.recent4Weeks,
    insight.accuracy.monthToDate,
  ]
  const reservationDashboard = createReservationDashboardMock(insight)

  return (
    <section className="grid gap-4 rounded-md border border-cyan-300/18 bg-[#0b1727]/82 p-4 shadow-[0_0_34px_rgba(34,211,238,0.08)] md:p-5">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="이번 달 실예약" value={`${insight.summary.monthActualBookings}건`} />
        <MetricCard
          label="예상 추가 수요"
          value={formatBookingRange(
            insight.summary.monthExpectedAdditionalDemandMin,
            insight.summary.monthExpectedAdditionalDemandMax,
          )}
          tone="ai"
        />
        <MetricCard
          label="월말 예상 예약"
          value={formatBookingRange(
            insight.summary.monthExpectedFinalBookingsMin,
            insight.summary.monthExpectedFinalBookingsMax,
          )}
        />
        <MetricCard
          label="전월 대비"
          value={formatPercentMetric(insight.summary.monthExpectedVsPreviousMonthRate)}
          tone={getPercentTone(insight.summary.monthExpectedVsPreviousMonthRate)}
        />
        <MetricCard
          label="지난주 대비"
          value={formatPercentMetric(insight.summary.weekOverWeekRate)}
          tone={getPercentTone(insight.summary.weekOverWeekRate)}
        />
        <MetricCard label="이번 주 상태" value={insight.summary.statusLabel} tone={insight.summary.statusLabel === '주의' ? 'warning' : 'good'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
          <h3 className="text-base font-black text-white">월간 운영 분석</h3>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-300">{insight.summary.insight}</p>
          <WeeklyTrendChart items={insight.summary.weeklyTrend} />
          <OperationSignalGrid insight={insight} />
        </div>

        <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
          <h3 className="text-base font-black text-white">시간대 예측 적중률</h3>
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
          <ReservationDashboardGrid data={reservationDashboard} />
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
    <div className="fixed inset-0 z-[10020] grid place-items-center overflow-hidden bg-black/65 p-4">
      <button type="button" aria-label="AI 예약 상세 닫기" className="absolute inset-0 z-0" onClick={onClose} />
      <section
        className="relative z-10 max-h-[88dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-md border border-cyan-300/22 bg-[#080c16] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.55)] [-webkit-overflow-scrolling:touch] [touch-action:pan-y]"
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
          <button type="button" onClick={onClose} className="grid h-11 w-11 touch-manipulation place-items-center rounded-md border border-white/10 bg-white/[0.05] text-xl font-black text-white">
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
  tone?: MetricTone
  value: string
}) {
  return (
    <div className={`rounded-md border p-4 ${metricToneClass[tone]}`}>
      <p className="text-xs font-black text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  )
}

type MetricTone = 'default' | 'ai' | 'good' | 'warning' | 'danger'

const metricToneClass: Record<MetricTone, string> = {
  ai: 'border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-100',
  danger: 'border-rose-300/25 bg-rose-400/10 text-rose-100',
  default: 'border-cyan-300/18 bg-white/[0.035] text-cyan-100',
  good: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
  warning: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
}

type ReservationDashboardData = {
  goal: {
    aiExpected: number
    currentActual: number
    target: number
  }
  hourlyDeltas: Array<{
    current: number
    hour: string
    previous: number
  }>
  weekdayDeltas: Array<{
    current: number
    day: string
    previous: number
  }>
  weeklyComparison: Array<{
    currentActual: number
    currentExpected: number
    label: string
    previous: number
  }>
}

function ReservationDashboardGrid({ data }: { data: ReservationDashboardData }) {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <ReservationInsightCard title="전월 예약 흐름 비교">
        <MonthlyFlowComparison items={data.weeklyComparison} />
      </ReservationInsightCard>
      <ReservationInsightCard title="시간대 증감">
        <DeltaCompactList items={data.hourlyDeltas.map((item) => ({ ...item, label: item.hour }))} />
      </ReservationInsightCard>
      <ReservationInsightCard title="요일별 증감">
        <WeekdayDeltaBars items={data.weekdayDeltas} />
      </ReservationInsightCard>
      <ReservationInsightCard title="예약 예측 달성률">
        <GoalAchievement data={data.goal} />
      </ReservationInsightCard>
    </div>
  )
}

function ReservationInsightCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="min-h-[13.5rem] rounded-md border border-white/10 bg-[#080f1d]/70 p-3">
      <h4 className="text-sm font-black text-white">{title}</h4>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function MonthlyFlowComparison({ items }: { items: ReservationDashboardData['weeklyComparison'] }) {
  const maxValue = Math.max(
    ...items.flatMap((item) => [item.previous, item.currentActual + item.currentExpected]),
    1,
  )

  return (
    <div className="grid gap-2.5">
      {items.map((item) => {
        const currentTotal = item.currentActual + item.currentExpected
        const delta = calculateDeltaPercent(currentTotal, item.previous)

        return (
          <div key={item.label} className="grid gap-1">
            <div className="flex items-center justify-between gap-2 text-[11px] font-black">
              <span className="text-slate-300">{item.label}</span>
              <DeltaBadge value={delta} />
            </div>
            <div className="grid gap-1">
              <ComparisonBar label="지난달" maxValue={maxValue} tone="previous" value={item.previous} />
              <CurrentMonthComparisonBar
                actual={item.currentActual}
                expected={item.currentExpected}
                maxValue={maxValue}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CurrentMonthComparisonBar({
  actual,
  expected,
  maxValue,
}: {
  actual: number
  expected: number
  maxValue: number
}) {
  const total = actual + expected
  const actualPercent = Math.min(100, (actual / maxValue) * 100)
  const expectedPercent = Math.min(100 - actualPercent, (expected / maxValue) * 100)

  return (
    <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2rem] items-center gap-2 text-[10px] font-bold text-slate-500">
      <span>이번달</span>
      <span className="flex h-2 overflow-hidden rounded-full bg-white/10">
        <span className="block h-full bg-cyan-300" style={{ width: `${actualPercent}%` }} />
        {expected > 0 ? (
          <span className="block h-full bg-fuchsia-300" style={{ width: `${expectedPercent}%` }} />
        ) : null}
      </span>
      <span className="text-right text-slate-300">{total}</span>
    </div>
  )
}

function ComparisonBar({
  label,
  maxValue,
  tone,
  value,
}: {
  label: string
  maxValue: number
  tone: 'current' | 'previous'
  value: number
}) {
  const percent = Math.min(100, (value / maxValue) * 100)
  const colorClass = tone === 'current' ? 'bg-cyan-300' : 'bg-white/25'

  return (
    <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2rem] items-center gap-2 text-[10px] font-bold text-slate-500">
      <span>{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-white/10">
        <span className={`block h-full rounded-full ${colorClass}`} style={{ width: `${percent}%` }} />
      </span>
      <span className="text-right text-slate-300">{value}</span>
    </div>
  )
}

function DeltaCompactList({
  items,
}: {
  items: Array<{
    current: number
    label: string
    previous: number
  }>
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded border border-white/10 bg-white/[0.035] px-2 py-1.5">
          <p className="text-[11px] font-black text-slate-300">{item.label}</p>
          <DeltaBadge value={calculateDeltaPercent(item.current, item.previous)} />
        </div>
      ))}
    </div>
  )
}

function WeekdayDeltaBars({ items }: { items: ReservationDashboardData['weekdayDeltas'] }) {
  const maxAbsDelta = Math.max(
    ...items.map((item) => Math.abs(calculateDeltaPercent(item.current, item.previous) ?? 0)),
    1,
  )

  return (
    <div className="grid gap-2">
      {items.map((item) => {
        const delta = calculateDeltaPercent(item.current, item.previous)
        const width = delta === null ? 0 : Math.min(100, (Math.abs(delta) / maxAbsDelta) * 100)

        return (
          <div key={item.day} className="grid grid-cols-[1.5rem_minmax(0,1fr)_3.25rem] items-center gap-2 text-[11px] font-black">
            <span className="text-slate-300">{item.day}</span>
            <span className="h-2 overflow-hidden rounded-full bg-white/10">
              <span className={`block h-full rounded-full ${getDeltaColorClass(delta)}`} style={{ width: `${width}%` }} />
            </span>
            <span className={getDeltaTextClass(delta)}>{formatDeltaPercent(delta)}</span>
          </div>
        )
      })}
    </div>
  )
}

function GoalAchievement({ data }: { data: ReservationDashboardData['goal'] }) {
  const currentPercent = Math.min(120, Math.round((data.currentActual / data.target) * 100))
  const expectedPercent = Math.min(120, Math.round((data.aiExpected / data.target) * 100))
  const actualWidth = Math.min(100, currentPercent)
  const expectedAdditionalWidth = Math.max(0, Math.min(100 - actualWidth, expectedPercent - currentPercent))

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <GoalStat label="목표" value={`${data.target}건`} />
        <GoalStat label="실예약" value={`${data.currentActual}건`} />
        <GoalStat label="AI예상" value={`${data.aiExpected}건`} />
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] font-black text-slate-400">
          <span>0</span>
          <span className="text-cyan-100">{expectedPercent}%</span>
          <span>100%</span>
        </div>
        <div className="relative mt-2 flex h-3 overflow-hidden rounded-full bg-white/10">
          <span className="h-full bg-cyan-300" style={{ width: `${actualWidth}%` }} />
          {expectedAdditionalWidth > 0 ? (
            <span className="h-full bg-fuchsia-300" style={{ width: `${expectedAdditionalWidth}%` }} />
          ) : null}
          <span className="absolute inset-y-[-0.2rem] left-[83.33%] w-px bg-white/70" />
        </div>
        <p className="mt-2 text-xs font-bold text-slate-400">
          현재 {currentPercent}% · AI 예상 {expectedPercent}%
        </p>
      </div>
    </div>
  )
}

function GoalStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.035] px-2 py-2">
      <p className="text-[10px] font-black text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  )
}

function DeltaBadge({ value }: { value: number | null }) {
  return (
    <span className={`inline-flex text-[11px] font-black ${getDeltaTextClass(value)}`}>
      {formatDeltaPercent(value)}
    </span>
  )
}

function calculateDeltaPercent(current: number, previous: number) {
  if (previous <= 0) {
    return current > 0 ? 100 : null
  }

  return Math.round(((current - previous) / previous) * 100)
}

function formatDeltaPercent(value: number | null) {
  if (value === null || value === 0) {
    return '-'
  }

  return `${value > 0 ? '▲' : '▼'}${Math.abs(value)}%`
}

function getDeltaTextClass(value: number | null) {
  if (value === null || value === 0) {
    return 'text-slate-500'
  }

  return value > 0 ? 'text-rose-300' : 'text-blue-300'
}

function getDeltaColorClass(value: number | null) {
  if (value === null || value === 0) {
    return 'bg-slate-500'
  }

  return value > 0 ? 'bg-rose-300' : 'bg-blue-300'
}

function createReservationDashboardMock(insight: PlaceBookingInsightResponse): ReservationDashboardData {
  const goalTarget = Math.max(90, insight.summary.previousMonthActualBookings || 90)
  const aiExpected = Math.max(goalTarget, insight.summary.monthExpectedFinalBookingsMax)

  return {
    goal: {
      aiExpected,
      currentActual: insight.summary.monthActualBookings,
      target: goalTarget,
    },
    hourlyDeltas: [
      { hour: '10시', previous: 17, current: 19 },
      { hour: '11시', previous: 13, current: 12 },
      { hour: '12시', previous: 13, current: 17 },
      { hour: '13시', previous: 24, current: 25 },
      { hour: '14시', previous: 22, current: 18 },
      { hour: '15시', previous: 13, current: 15 },
      { hour: '16시', previous: 14, current: 15 },
      { hour: '17시', previous: 11, current: 12 },
      { hour: '18시', previous: 18, current: 22 },
    ],
    weekdayDeltas: [
      { day: '월', previous: 25, current: 27 },
      { day: '화', previous: 31, current: 30 },
      { day: '수', previous: 27, current: 31 },
      { day: '목', previous: 43, current: 44 },
      { day: '금', previous: 25, current: 31 },
      { day: '토', previous: 32, current: 30 },
    ],
    weeklyComparison: insight.summary.weeklyTrend.map((item, index) => ({
      currentActual: item.actualBookings,
      currentExpected: item.expectedAdditionalDemandMax,
      label: item.label,
      previous: [18, 19, 21, 20, 8][index] ?? Math.max(0, item.actualBookings - 1),
    })),
  }
}

function formatBookingRange(min: number, max: number) {
  if (min === max) {
    return `약 ${min}건`
  }

  return `약 ${min}~${max}건`
}

function formatPercentMetric(value: number | null) {
  return value === null ? '데이터 부족' : `${value}%`
}

function getPercentTone(value: number | null): MetricTone {
  if (value === null) {
    return 'default'
  }

  if (value >= 100) {
    return 'good'
  }

  if (value < 85) {
    return 'danger'
  }

  return 'warning'
}

function WeeklyTrendChart({ items }: { items: PlaceBookingInsightResponse['summary']['weeklyTrend'] }) {
  const maxValue = Math.max(...items.map((item) => item.expectedBookingsMax), 1)

  return (
    <div className="mt-4 rounded-md border border-white/10 bg-[#080f1d]/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-white">주차별 예약 추이</p>
        <div className="flex items-center gap-3 text-[10px] font-black text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-cyan-300" />
            실예약
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-fuchsia-300" />
            AI예상
          </span>
        </div>
      </div>
      <div className="mt-3 grid gap-3">
        {items.map((item) => {
          const actualPercent = Math.min(100, (item.actualBookings / maxValue) * 100)
          const additionalPercent = Math.min(
            100 - actualPercent,
            (item.expectedAdditionalDemandMax / maxValue) * 100,
          )

          return (
            <div key={`${item.startDate}-${item.endDate}`} className="grid gap-1">
              <div className="flex items-center justify-between gap-3 text-xs font-black">
                <span className="text-slate-300">
                  {item.label}
                  <span className="ml-2 text-[10px] text-slate-500">
                    {formatShortDate(item.startDate)}~{formatShortDate(item.endDate)}
                  </span>
                </span>
                <span className="text-cyan-100">
                  {formatBookingRange(item.expectedBookingsMin, item.expectedBookingsMax)}
                </span>
              </div>
              <div className="flex h-3 overflow-hidden rounded-full bg-white/10">
                <span className="h-full bg-cyan-300" style={{ width: `${actualPercent}%` }} />
                <span className="h-full bg-fuchsia-300" style={{ width: `${additionalPercent}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function OperationSignalGrid({ insight }: { insight: PlaceBookingInsightResponse }) {
  const signals = createOperationSignals(insight)

  return (
    <div className="mt-4 grid gap-2 md:grid-cols-2">
      {signals.map((signal) => (
        <div
          key={signal.label}
          className={`rounded-md border p-3 ${metricToneClass[signal.tone]}`}
        >
          <p className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-400">
            {signal.label}
          </p>
          <p className="mt-1 text-lg font-black text-white">{signal.value}</p>
          <p className="mt-1 break-keep text-xs font-bold leading-5 text-slate-300">
            {signal.description}
          </p>
        </div>
      ))}
    </div>
  )
}

function createOperationSignals(insight: PlaceBookingInsightResponse) {
  const trend = insight.summary.weeklyTrend
  const peakWeek = [...trend].sort(
    (left, right) => right.expectedBookingsMax - left.expectedBookingsMax,
  )[0]
  const aiDemandWeek = [...trend].sort(
    (left, right) => right.expectedAdditionalDemandMax - left.expectedAdditionalDemandMax,
  )[0]
  const aiShare =
    insight.summary.monthExpectedFinalBookingsMax > 0
      ? Math.round(
          (insight.summary.monthExpectedAdditionalDemandMax /
            insight.summary.monthExpectedFinalBookingsMax) *
            100,
        )
      : 0

  return [
    {
      label: '월말 페이스',
      value: formatPercentMetric(insight.summary.monthExpectedVsPreviousMonthRate),
      description:
        insight.summary.monthExpectedVsPreviousMonthRate === null
          ? '전월 실예약 표본이 없어 비교 기준을 만들 수 없습니다.'
          : `전월 실예약 ${insight.summary.previousMonthActualBookings}건 대비 월말 예상 예약 기준입니다.`,
      tone: getPercentTone(insight.summary.monthExpectedVsPreviousMonthRate),
    },
    {
      label: '이번 주 흐름',
      value: formatPercentMetric(insight.summary.weekOverWeekRate),
      description:
        insight.summary.weekOverWeekRate === null
          ? '지난주 예약 표본이 없어 비교 기준을 만들 수 없습니다.'
          : `지난주 ${insight.summary.lastWeekBookings}건 대비 이번 주 예상 예약 기준입니다.`,
      tone: getPercentTone(insight.summary.weekOverWeekRate),
    },
    {
      label: 'AI 예상 의존도',
      value: `${aiShare}%`,
      description:
        aiShare >= 20
          ? '월말 예상에서 아직 확정되지 않은 AI 예상 수요 비중이 높습니다.'
          : '월말 예상 대부분이 이미 확인된 실예약 기반입니다.',
      tone: aiShare >= 20 ? 'warning' : 'default',
    },
    {
      label: '피크 주차',
      value: peakWeek ? `${peakWeek.label} ${formatBookingRange(peakWeek.expectedBookingsMin, peakWeek.expectedBookingsMax)}` : '데이터 부족',
      description: peakWeek
        ? `${formatShortDate(peakWeek.startDate)}~${formatShortDate(peakWeek.endDate)} 구간이 이번 달 가장 강한 예약 흐름입니다.`
        : '주차별 예약 추이를 만들 수 있는 데이터가 부족합니다.',
      tone: 'good',
    },
    {
      label: 'AI 수요 보강 구간',
      value: aiDemandWeek
        ? `${aiDemandWeek.label} ${formatBookingRange(
            aiDemandWeek.expectedAdditionalDemandMin,
            aiDemandWeek.expectedAdditionalDemandMax,
          )}`
        : '데이터 부족',
      description: aiDemandWeek
        ? '실예약 외에 추가 유입 가능성이 가장 크게 잡힌 주차입니다.'
        : 'AI 예상 수요를 계산할 수 있는 예약 가능 슬롯이 부족합니다.',
      tone: 'ai',
    },
    {
      label: '예측 신뢰 확인',
      value: `${insight.accuracy.recent4Weeks.percent}%`,
      description: `최근 4주 기준 ${insight.accuracy.recent4Weeks.matched}/${insight.accuracy.recent4Weeks.total}개 시간대가 실제 예약과 맞았습니다.`,
      tone: insight.accuracy.recent4Weeks.percent >= 70 ? 'good' : 'warning',
    },
  ] satisfies Array<{
    description: string
    label: string
    tone: MetricTone
    value: string
  }>
}

function formatShortDate(value: string) {
  return value.slice(5).replace('-', '.')
}

function sortBookingBlocksByTime(blocks: PlaceBookingInsightBlock[]) {
  return [...blocks].sort((left, right) => {
    const timeCompare = parseTimeToMinutes(left.time) - parseTimeToMinutes(right.time)

    if (timeCompare !== 0) {
      return timeCompare
    }

    if (left.type === right.type) {
      return left.id.localeCompare(right.id)
    }

    return left.type === 'actual' ? -1 : 1
  })
}

function parseTimeToMinutes(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})$/)

  if (!match) {
    return Number.MAX_SAFE_INTEGER
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return Number.MAX_SAFE_INTEGER
  }

  return hours * 60 + minutes
}

async function requestBookingStatus(place: PlaceRankingItem, date: string) {
  const response = await fetch('/api/place-ranking/booking-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bookingBusinessId: place.actions.bookingBusinessId,
      bookingUrl: place.actions.bookingUrl,
      date,
    }),
  })
  const body = (await response.json()) as PlaceBookingStatusResponse | PlaceRankingErrorBody

  if (!response.ok) {
    throw new Error((body as PlaceRankingErrorBody).message ?? '예약상품을 불러오지 못했습니다.')
  }

  return body as PlaceBookingStatusResponse
}

async function requestRankings(keyword: string) {
  const response = await fetch('/api/place-ranking/rankings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      keyword,
      limit: 75,
    }),
  })
  const body = (await response.json()) as PlaceRankingResponse | PlaceRankingErrorBody

  if (!response.ok) {
    throw new Error((body as PlaceRankingErrorBody).message ?? '플레이스 검색에 실패했습니다.')
  }

  return body as PlaceRankingResponse
}

async function requestBookingInsight(
  place: PlaceRankingItem,
  product: PlaceBookingProduct,
  yearMonth: string,
) {
  const response = await fetch('/api/place-ranking/booking-insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bookingBusinessId: place.actions.bookingBusinessId,
      bookingUrl: place.actions.bookingUrl,
      productId: product.id,
      productName: product.name,
      yearMonth,
    }),
  })
  const body = (await response.json()) as PlaceBookingInsightResponse | PlaceRankingErrorBody

  if (!response.ok) {
    throw new Error((body as PlaceRankingErrorBody).message ?? 'AI 예약 수요 캘린더 조회에 실패했습니다.')
  }

  return body as PlaceBookingInsightResponse
}

function DayDetailModal({
  day,
  onClose,
  onOpenAiBlock,
}: {
  day: PlaceBookingInsightResponse['days'][string] | null
  onClose: () => void
  onOpenAiBlock: (block: PlaceBookingInsightBlock) => void
}) {
  useBodyScrollLock(Boolean(day))

  if (!day) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-[10020] grid place-items-center overflow-hidden bg-black/65 p-4">
      <button type="button" aria-label="예약 목록 닫기" className="absolute inset-0 z-0" onClick={onClose} />
      <section
        className="relative z-10 max-h-[88dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-md border border-cyan-300/22 bg-[#080c16] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.55)] [-webkit-overflow-scrolling:touch] [touch-action:pan-y]"
        data-aiva-scroll-lock-allow="true"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">
              Daily Schedule
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">{day.date}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 touch-manipulation place-items-center rounded-md border border-white/10 bg-white/[0.05] text-xl font-black text-white">
            ×
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          <ScheduleList title="실예약" blocks={sortBookingBlocksByTime(day.actualBlocks)} type="actual" />
          <ScheduleList
            title="AI 예측"
            blocks={sortBookingBlocksByTime(day.aiBlocks)}
            type="ai"
            onOpenAiBlock={onOpenAiBlock}
          />
        </div>
      </section>
    </div>,
    document.body,
  )
}

function ScheduleList({
  blocks,
  onOpenAiBlock,
  title,
  type,
}: {
  blocks: PlaceBookingInsightBlock[]
  onOpenAiBlock?: (block: PlaceBookingInsightBlock) => void
  title: string
  type: 'actual' | 'ai'
}) {
  return (
    <div>
      <p className="text-sm font-black text-white">{title}</p>
      <div className="mt-2 grid gap-2">
        {blocks.length ? blocks.map((block) => {
          const className = `rounded-md border px-3 py-2 text-left text-sm font-black ${
            type === 'ai'
              ? 'border-dashed border-cyan-200/40 bg-cyan-300/[0.08] text-cyan-100 transition hover:bg-cyan-300/16'
              : 'border-cyan-300/20 bg-cyan-300/14 text-cyan-50'
          }`
          const content = (
            <>
              {type === 'ai' ? <span className="mr-2 rounded bg-cyan-200/20 px-1.5 py-0.5 text-[10px]">AI</span> : null}
              {block.time}
              {block.productName ? <span className="ml-2 text-xs text-slate-400">{block.productName}</span> : null}
            </>
          )

          if (type === 'ai' && onOpenAiBlock) {
            return (
              <button
                key={block.id}
                type="button"
                onClick={() => onOpenAiBlock(block)}
                className={`${className} appearance-none`}
              >
                {content}
              </button>
            )
          }

          return (
            <div key={block.id} className={className}>
              {content}
            </div>
          )
        }) : (
          <p className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold text-slate-500">
            표시할 예약이 없습니다.
          </p>
        )}
      </div>
    </div>
  )
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

function getYearOptions() {
  const currentYear = Number(getCurrentYearMonth().slice(0, 4))

  return Array.from({ length: 7 }, (_, index) => String(currentYear - 3 + index))
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
