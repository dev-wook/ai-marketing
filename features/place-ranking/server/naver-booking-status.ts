import type {
  PlaceBookingProduct,
  PlaceBookingSlot,
  PlaceBookingStatusResponse,
} from '../types'

type BookingIdentity = {
  businessId: string
  businessTypeId: number
  referer: string
}

type SearchBizItemGraphQlResponse = {
  data?: {
    searchBizItem?: {
      bizItems?: RawBookingProduct[]
    }
  }
  errors?: Array<{ message?: string }>
}

type ScheduleGraphQlResponse = {
  data?: {
    schedule?: {
      bizItemSchedule?: {
        hourly?: RawBookingScheduleSlot[]
      }
    }
  }
  errors?: Array<{ message?: string }>
}

type RawBookingProduct = {
  bizItemId?: string | number
  name?: string
  desc?: string
  isClosedBooking?: boolean
  isClosedBookingUser?: boolean
  bookingTimeUnitCode?: string
  minBookingCount?: number
  maxBookingCount?: number
}

type RawBookingScheduleSlot = {
  unitStartDateTime?: string
  unitStartTime?: string
  duration?: number
  isBusinessDay?: boolean
  isHoliday?: boolean
  isUnitBusinessDay?: boolean
  isSaleDay?: boolean
  isUnitSaleDay?: boolean
  stock?: number | null
  unitStock?: number | null
  bookingCount?: number | null
  occupiedBookingCount?: number | null
  unitBookingCount?: number | null
  minBookingCount?: number | null
  maxBookingCount?: number | null
}

const naverBookingGraphQlUrl = 'https://m.booking.naver.com/graphql'

const searchBizItemQuery = `
  query searchBizItem($bizItemSearchParams: BizItemSearchParams) {
    searchBizItem(input: $bizItemSearchParams) {
      id
      bizItems {
        businessId
        bizItemId
        name
        desc
        isClosedBooking
        isClosedBookingUser
        bookingTimeUnitCode
        minBookingCount
        maxBookingCount
      }
    }
  }
`

const scheduleQuery = `
  query schedule($scheduleParams: ScheduleParams) {
    schedule(input: $scheduleParams) {
      bizItemSchedule {
        hourly {
          unitStartDateTime
          unitStartTime
          duration
          isBusinessDay
          isHoliday
          isUnitBusinessDay
          isSaleDay
          isUnitSaleDay
          stock
          unitStock
          bookingCount
          occupiedBookingCount
          unitBookingCount
          minBookingCount
          maxBookingCount
        }
      }
    }
  }
`

export async function collectNaverBookingStatus({
  bookingUrl,
  bookingBusinessId,
  date,
}: {
  bookingUrl?: string
  bookingBusinessId?: string
  date?: string
}): Promise<PlaceBookingStatusResponse> {
  const identity = resolveBookingIdentity({ bookingUrl, bookingBusinessId })
  const targetDate = normalizeDate(date)
  const products = await fetchBookingProducts(identity)
  const activeProducts = products.filter((product) => !product.isClosedBooking)
  const normalizedProducts = await Promise.all(
    activeProducts.map(async (product) => {
      const productId = asString(product.bizItemId)
      const slots = await fetchBookingSchedule({
        identity,
        productId,
        date: targetDate,
      })

      return mapProduct(product, slots)
    }),
  )

  return {
    businessId: identity.businessId,
    businessTypeId: identity.businessTypeId,
    date: targetDate,
    products: normalizedProducts.filter((product) => product.id),
  }
}

function resolveBookingIdentity({
  bookingUrl,
  bookingBusinessId,
}: {
  bookingUrl?: string
  bookingBusinessId?: string
}): BookingIdentity {
  const parsed = parseBookingUrl(bookingUrl)
  const businessId = bookingBusinessId?.trim() || parsed?.businessId || ''
  const businessTypeId = parsed?.businessTypeId ?? 13

  if (!businessId) {
    throw new Error('예약 정보를 조회할 수 있는 예약 URL이 없습니다.')
  }

  return {
    businessId,
    businessTypeId,
    referer:
      bookingUrl?.trim() ||
      `https://m.booking.naver.com/booking/${businessTypeId}/bizes/${businessId}`,
  }
}

function parseBookingUrl(value?: string) {
  if (!value) {
    return null
  }

  try {
    const url = new URL(value)
    const match = url.pathname.match(/\/booking\/(\d+)\/bizes\/(\d+)/)

    if (!match) {
      return null
    }

    return {
      businessTypeId: Number(match[1]),
      businessId: match[2],
    }
  } catch {
    return null
  }
}

async function fetchBookingProducts(identity: BookingIdentity) {
  const body = await requestBookingGraphQl<SearchBizItemGraphQlResponse>({
    operationName: 'searchBizItem',
    query: searchBizItemQuery,
    variables: {
      bizItemSearchParams: {
        businessId: identity.businessId,
      },
    },
    referer: identity.referer,
  })

  return body.data?.searchBizItem?.bizItems ?? []
}

async function fetchBookingSchedule({
  identity,
  productId,
  date,
}: {
  identity: BookingIdentity
  productId: string
  date: string
}) {
  if (!productId) {
    return []
  }

  const body = await requestBookingGraphQl<ScheduleGraphQlResponse>({
    operationName: 'schedule',
    query: scheduleQuery,
    variables: {
      scheduleParams: {
        businessTypeId: identity.businessTypeId,
        businessId: identity.businessId,
        bizItemId: productId,
        startDateTime: `${date}T00:00:00`,
        endDateTime: `${date}T23:59:59`,
        fixedTime: true,
        includesHolidaySchedules: true,
      },
    },
    referer: `${identity.referer}/items/${productId}`,
  })

  return body.data?.schedule?.bizItemSchedule?.hourly ?? []
}

async function requestBookingGraphQl<T>({
  operationName,
  query,
  variables,
  referer,
}: {
  operationName: string
  query: string
  variables: Record<string, unknown>
  referer: string
}) {
  const response = await fetch(naverBookingGraphQlUrl, {
    method: 'POST',
    headers: {
      accept: '*/*',
      'content-type': 'application/json',
      origin: 'https://m.booking.naver.com',
      referer,
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({
      operationName,
      query,
      variables,
    }),
  })
  const body = (await response.json()) as T & { errors?: Array<{ message?: string }> }

  if (!response.ok || body.errors?.length) {
    throw new Error(
      body.errors?.[0]?.message ||
        `Naver Booking GraphQL request failed with status ${response.status}`,
    )
  }

  return body
}

function mapProduct(
  product: RawBookingProduct,
  rawSlots: RawBookingScheduleSlot[],
): PlaceBookingProduct {
  const slots = rawSlots.map(mapSlot).filter((slot) => slot.time)
  const availableSlots = slots.filter((slot) => slot.status === 'available').length
  const bookedSlots = slots.filter((slot) => slot.status === 'booked').length
  const closedSlots = slots.filter((slot) => slot.status === 'closed').length

  return {
    id: asString(product.bizItemId),
    name: asString(product.name) || '예약 상품',
    description: asString(product.desc),
    isClosed: Boolean(product.isClosedBooking),
    minBookingCount: toNumberOrDefault(product.minBookingCount, 1),
    maxBookingCount: toNumberOrDefault(product.maxBookingCount, 1),
    timeUnitCode: asString(product.bookingTimeUnitCode) || undefined,
    summary: {
      totalSlots: slots.length,
      availableSlots,
      bookedSlots,
      closedSlots,
      firstAvailableTime:
        slots.find((slot) => slot.status === 'available')?.time ?? null,
    },
    slots,
  }
}

function mapSlot(slot: RawBookingScheduleSlot): PlaceBookingSlot {
  const remaining = calculateRemaining(slot)
  const hasBooking = toNumberOrDefault(slot.unitBookingCount, 0) > 0
  const isOpen =
    slot.isBusinessDay !== false &&
    slot.isHoliday !== true &&
    slot.isUnitBusinessDay !== false &&
    slot.isSaleDay !== false &&
    slot.isUnitSaleDay !== false
  const status = hasBooking ? 'booked' : remaining > 0 && isOpen ? 'available' : 'closed'
  const statusReason = hasBooking
    ? 'actual_booking'
    : remaining > 0 && isOpen
      ? 'available'
      : !isOpen
        ? 'off_hours'
        : 'manual_block_or_full'

  return {
    time: formatTime(slot.unitStartTime || slot.unitStartDateTime),
    startDateTime: asString(slot.unitStartDateTime || slot.unitStartTime),
    duration: toNumberOrDefault(slot.duration, 0),
    remaining,
    bookingCount: toNumberOrDefault(slot.bookingCount, 0),
    unitBookingCount: toNumberOrDefault(slot.unitBookingCount, 0),
    status,
    statusReason,
  }
}

function calculateRemaining(slot: RawBookingScheduleSlot) {
  const unitStock = toNumberOrDefault(slot.unitStock, 0)
  const stock =
    slot.stock === null || slot.stock === undefined
      ? unitStock
      : toNumberOrDefault(slot.stock, 0) -
        toNumberOrDefault(slot.bookingCount, 0) -
        toNumberOrDefault(slot.occupiedBookingCount, 0)
  const unit = unitStock - toNumberOrDefault(slot.unitBookingCount, 0)
  const max = toNumberOrDefault(slot.maxBookingCount, unitStock)

  return Math.max(0, Math.min(stock, unit, max))
}

function normalizeDate(value?: string) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const now = new Date()
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  return formatter.format(now)
}

function formatTime(value?: string) {
  const matched = asString(value).match(/T?(\d{2}):(\d{2})/)

  return matched ? `${matched[1]}:${matched[2]}` : ''
}

function asString(value: unknown) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function toNumberOrDefault(value: unknown, fallback: number) {
  const numberValue = Number(value)

  return Number.isFinite(numberValue) ? numberValue : fallback
}
