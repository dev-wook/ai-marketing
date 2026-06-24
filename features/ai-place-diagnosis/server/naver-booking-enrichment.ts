import { collectNaverBookingStatus } from '@/features/place-ranking/server/naver-booking-status'
import type {
  AiPlaceDiagnosisBookingProduct,
  AiPlaceDiagnosisDataSource,
  AiPlaceDiagnosisPlaceProfile,
} from '../types'

type BookingIdentity = {
  businessId: string
  businessTypeId: number
  referer: string
}

type BookingBusinessGraphQlResponse = {
  data?: {
    business?: RawBookingBusiness
  }
  errors?: Array<{ message?: string }>
}

type BookingProductDetailGraphQlResponse = {
  data?: {
    bizItem?: RawBookingProductDetail
  }
  errors?: Array<{ message?: string }>
}

type BookingOptionGraphQlResponse = {
  data?: {
    option?: RawBookingOptionCategory[]
  }
  errors?: Array<{ message?: string }>
}

type RawBookingBusiness = {
  businessId?: string
  placeId?: string
  name?: string
  desc?: string
  promotionDesc?: string
  placeCategoryName?: string
  addressJson?: {
    detail?: string
    address?: string
    roadAddr?: string
    jibun?: string
  } | null
  businessAmenityJson?: Array<{
    amenityCategory?: string
    amenityCode?: string
  }> | null
  nPayRegStatusCode?: string
  isNaverTalkRelated?: boolean
  phoneInformationJson?: {
    reprPhone?: string
  } | null
  websiteUrl?: string | null
  businessResources?: Array<{
    resourceUrl?: string
    resourceTypeCode?: string
  }>
}

type RawBookingProductDetail = {
  bizItemId?: string
  name?: string
  desc?: string
  price?: number | null
  minMaxPrice?: {
    minPrice?: number | null
    maxPrice?: number | null
  } | null
  minBookingTime?: number | null
  maxBookingTime?: number | null
  bookingTimeUnitCode?: string
  minBookingCount?: number
  maxBookingCount?: number
  extraDescJson?: Array<{
    title?: string
    context?: string
  }> | null
  bookingPrecautionJson?: Array<{
    title?: string | null
    desc?: string | null
  }> | null
  additionalPropertyJson?: {
    runningTime?: string | number | null
  } | null
  resources?: Array<{
    resourceUrl?: string
  }>
}

type RawBookingOptionCategory = {
  id?: string
  categoryId?: string
  name?: string
  categoryTypeCode?: string
  selectionTypeCode?: string
  isImp?: boolean
  options?: RawBookingTreatmentMenu[]
}

type RawBookingTreatmentMenu = {
  id?: string
  optionId?: string
  desc?: string
  discountRate?: number | null
  isFree?: boolean
  isSoldOut?: boolean
  categoryId?: string
  categoryName?: string
  categoryTypeCode?: string
  minBookingCount?: number
  maxBookingCount?: number
  name?: string
  normalPrice?: number | null
  price?: number | null
  priceDesc?: string | null
  serviceDuration?: number | null
  titleImageUrl?: string | null
}

export type NaverBookingEnrichment = {
  profile: AiPlaceDiagnosisPlaceProfile
  products: AiPlaceDiagnosisBookingProduct[]
  dataSources: AiPlaceDiagnosisDataSource[]
}

const naverBookingGraphQlUrl = 'https://m.booking.naver.com/graphql'

const bookingBusinessQuery = `
  query business($businessParams: BusinessParams) {
    business(input: $businessParams) {
      businessId
      placeId
      name
      desc
      promotionDesc
      placeCategoryName
      addressJson
      businessAmenityJson
      nPayRegStatusCode
      isNaverTalkRelated
      phoneInformationJson
      websiteUrl
      businessResources {
        resourceUrl
        resourceTypeCode
      }
    }
  }
`

const bookingProductDetailQuery = `
  query bizItem($bizItemParams: BizItemParams) {
    bizItem(input: $bizItemParams) {
      businessId
      bizItemId
      name
      desc
      price
      minMaxPrice {
        minPrice
        maxPrice
      }
      minBookingTime
      maxBookingTime
      bookingTimeUnitCode
      minBookingCount
      maxBookingCount
      extraDescJson
      bookingPrecautionJson {
        title
        desc
      }
      additionalPropertyJson {
        runningTime
      }
      resources {
        resourceUrl
      }
    }
  }
`

const bookingOptionQuery = `
  query option($input: OptionParams) {
    option(input: $input) {
      id
      categoryId
      name
      categoryTypeCode
      selectionTypeCode
      isImp
      options {
        id
        optionId
        desc
        discountRate
        isFree
        isSoldOut
        categoryId
        categoryName
        categoryTypeCode
        minBookingCount
        maxBookingCount
        name
        normalPrice
        price
        priceDesc
        serviceDuration
        titleImageUrl
      }
    }
  }
`

const emptyProfile: AiPlaceDiagnosisPlaceProfile = {
  introduction: '',
  promotion: '',
  locationGuide: '',
  amenities: [],
  imageUrls: [],
}

export async function collectNaverBookingEnrichment({
  bookingUrl,
  bookingBusinessId,
}: {
  bookingUrl?: string
  bookingBusinessId?: string
}): Promise<NaverBookingEnrichment> {
  const identity = resolveBookingIdentity({ bookingUrl, bookingBusinessId })
  const dataSources: AiPlaceDiagnosisDataSource[] = []
  const status = await collectNaverBookingStatus({
    bookingUrl,
    bookingBusinessId: identity.businessId,
  })
  const profile = await collectBusinessProfile(identity, dataSources)
  const productDetails = await Promise.all(
    status.products.map(async (product) => ({
      productId: product.id,
      detail: await collectProductDetail(identity, product.id, dataSources),
      treatmentMenuCategories: await collectProductTreatmentMenus(identity, product.id, dataSources),
    })),
  )
  const treatmentMenuCount = productDetails.reduce(
    (sum, item) =>
      sum +
      item.treatmentMenuCategories.reduce((categorySum, category) => categorySum + category.menus.length, 0),
    0,
  )

  dataSources.push({
    key: 'bookingProducts',
    label: '예약상품',
    status: status.products.length ? 'collected' : 'missing',
    count: status.products.length,
    message: status.products.length
      ? `예약상품 ${status.products.length}개를 자동 수집했습니다.`
      : '예약상품을 찾지 못했습니다.',
  })
  dataSources.push({
    key: 'bookingTreatmentMenus',
    label: '시술 메뉴',
    status: treatmentMenuCount ? 'collected' : status.products.length ? 'partial' : 'missing',
    count: treatmentMenuCount,
    message: treatmentMenuCount
      ? `예약상품 상세에서 시술 메뉴 ${treatmentMenuCount}개를 자동 수집했습니다.`
      : '예약상품 상세에서 시술 메뉴를 찾지 못했습니다.',
  })

  return {
    profile,
    products: status.products.map((product) => {
      const productDetail = productDetails.find((item) => item.productId === product.id)
      const detail = productDetail?.detail ?? null
      const durations = product.slots
        .map((slot) => slot.duration)
        .filter((duration) => duration > 0)
      const inferredDuration = durations[0] ?? null

      return {
        id: product.id,
        name: detail?.name || product.name,
        description: detail?.description || product.description,
        detailUrl: createProductDetailUrl(identity, product.id),
        price: detail?.price ?? null,
        minPrice: detail?.minPrice ?? null,
        maxPrice: detail?.maxPrice ?? null,
        minBookingCount: detail?.minBookingCount ?? product.minBookingCount,
        maxBookingCount: detail?.maxBookingCount ?? product.maxBookingCount,
        minBookingTime: detail?.minBookingTime ?? null,
        maxBookingTime: detail?.maxBookingTime ?? null,
        inferredDurationMinutes: inferredDuration,
        totalSlots: product.summary.totalSlots,
        availableSlots: product.summary.availableSlots,
        bookedSlots: product.summary.bookedSlots,
        firstAvailableTime: product.summary.firstAvailableTime,
        timeUnitCode: detail?.timeUnitCode ?? product.timeUnitCode,
        precautions: detail?.precautions ?? [],
        extraDescriptions: detail?.extraDescriptions ?? [],
        imageUrls: detail?.imageUrls ?? [],
        treatmentMenuCategories: productDetail?.treatmentMenuCategories ?? [],
      }
    }),
    dataSources,
  }
}

async function collectBusinessProfile(
  identity: BookingIdentity,
  dataSources: AiPlaceDiagnosisDataSource[],
) {
  try {
    const body = await requestBookingGraphQl<BookingBusinessGraphQlResponse>({
      operationName: 'business',
      query: bookingBusinessQuery,
      variables: {
        businessParams: {
          businessId: identity.businessId,
          lang: 'ko',
          projections: 'RESOURCE,BUSINESS-AMENITY,BRAND-DISPLAY,BUSINESS_DETAIL',
        },
      },
      referer: identity.referer,
    })
    const business = body.data?.business
    const profile = mapBusinessProfile(business)

    dataSources.push({
      key: 'bookingBusiness',
      label: '플레이스 소개/상세정보',
      status: profile.introduction || profile.promotion ? 'collected' : 'partial',
      count: [profile.introduction, profile.promotion, profile.locationGuide].filter(Boolean).length,
      message:
        profile.introduction || profile.promotion
          ? '네이버 예약 business 정보에서 소개글과 상세 신호를 자동 수집했습니다.'
          : '소개글은 비어 있지만 예약 business 기본 정보는 조회했습니다.',
    })

    return profile
  } catch (error) {
    dataSources.push({
      key: 'bookingBusiness',
      label: '플레이스 소개/상세정보',
      status: 'failed',
      message: error instanceof Error ? error.message : '플레이스 상세정보 수집에 실패했습니다.',
    })

    return emptyProfile
  }
}

async function collectProductDetail(
  identity: BookingIdentity,
  productId: string,
  dataSources: AiPlaceDiagnosisDataSource[],
) {
  try {
    const body = await requestBookingGraphQl<BookingProductDetailGraphQlResponse>({
      operationName: 'bizItem',
      query: bookingProductDetailQuery,
      variables: {
        bizItemParams: {
          businessId: identity.businessId,
          bizItemId: productId,
          lang: 'ko',
          projections: 'RESOURCE,MIN_MAX_PRICE,AVAILABLE_START_DATE,BIZ_ITEM_DETAIL',
        },
      },
      referer: `${identity.referer}/items/${productId}`,
    })

    return mapProductDetail(body.data?.bizItem)
  } catch (error) {
    dataSources.push({
      key: `bookingProduct:${productId}`,
      label: '예약상품 상세',
      status: 'failed',
      message:
        error instanceof Error
          ? `${productId} 예약상품 상세 수집 실패: ${error.message}`
          : `${productId} 예약상품 상세 수집에 실패했습니다.`,
    })

    return null
  }
}

async function collectProductTreatmentMenus(
  identity: BookingIdentity,
  productId: string,
  dataSources: AiPlaceDiagnosisDataSource[],
) {
  try {
    const body = await requestBookingGraphQl<BookingOptionGraphQlResponse>({
      operationName: 'option',
      query: bookingOptionQuery,
      variables: {
        input: {
          businessId: identity.businessId,
          bizItemId: productId,
          startDate: getTodayInKorea(),
          lang: 'ko',
        },
      },
      referer: createProductDetailUrl(identity, productId),
    })

    return mapTreatmentMenuCategories(body.data?.option)
  } catch (error) {
    dataSources.push({
      key: `bookingTreatmentMenus:${productId}`,
      label: '시술 메뉴',
      status: 'failed',
      message:
        error instanceof Error
          ? `${productId} 시술 메뉴 수집 실패: ${error.message}`
          : `${productId} 시술 메뉴 수집에 실패했습니다.`,
    })

    return []
  }
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

function mapBusinessProfile(business?: RawBookingBusiness): AiPlaceDiagnosisPlaceProfile {
  if (!business) {
    return emptyProfile
  }

  return {
    introduction: asString(business.desc),
    promotion: asString(business.promotionDesc),
    locationGuide: asString(business.addressJson?.detail),
    amenities: (business.businessAmenityJson ?? [])
      .map((amenity) => asString(amenity.amenityCode))
      .filter(Boolean),
    websiteUrl: asString(business.websiteUrl) || undefined,
    phone: asString(business.phoneInformationJson?.reprPhone) || undefined,
    imageUrls: (business.businessResources ?? [])
      .map((resource) => asString(resource.resourceUrl))
      .filter(Boolean),
    nPayStatus: asString(business.nPayRegStatusCode) || undefined,
  }
}

function mapProductDetail(detail?: RawBookingProductDetail | null) {
  if (!detail) {
    return null
  }

  return {
    id: asString(detail.bizItemId),
    name: asString(detail.name),
    description: asString(detail.desc),
    price: toNullableNumber(detail.price),
    minPrice: toNullableNumber(detail.minMaxPrice?.minPrice),
    maxPrice: toNullableNumber(detail.minMaxPrice?.maxPrice),
    minBookingCount: toNumberOrDefault(detail.minBookingCount, 1),
    maxBookingCount: toNumberOrDefault(detail.maxBookingCount, 1),
    minBookingTime: toNullableNumber(detail.minBookingTime),
    maxBookingTime: toNullableNumber(detail.maxBookingTime),
    timeUnitCode: asString(detail.bookingTimeUnitCode) || undefined,
    precautions: (detail.bookingPrecautionJson ?? [])
      .map((precaution) => [precaution.title, precaution.desc].map(asString).filter(Boolean).join(': '))
      .filter(Boolean),
    extraDescriptions: (detail.extraDescJson ?? [])
      .map((extra) => [extra.title, extra.context].map(asString).filter(Boolean).join(': '))
      .filter(Boolean),
    imageUrls: (detail.resources ?? [])
      .map((resource) => asString(resource.resourceUrl))
      .filter(Boolean),
  }
}

function mapTreatmentMenuCategories(categories?: RawBookingOptionCategory[] | null) {
  return (categories ?? [])
    .map((category) => ({
      id: asString(category.categoryId || category.id),
      name: asString(category.name),
      categoryTypeCode: asString(category.categoryTypeCode),
      selectionTypeCode: asString(category.selectionTypeCode),
      menus: (category.options ?? [])
        .map((menu) => ({
          id: asString(menu.optionId || menu.id),
          name: asString(menu.name),
          description: asString(menu.desc),
          normalPrice: toNullableNumber(menu.normalPrice),
          price: toNullableNumber(menu.price),
          priceDescription: asString(menu.priceDesc),
          discountRate: toNullableNumber(menu.discountRate),
          serviceDurationMinutes: toNullableNumber(menu.serviceDuration),
          isSoldOut: Boolean(menu.isSoldOut),
          isFree: Boolean(menu.isFree),
        }))
        .filter((menu) => menu.id && menu.name),
    }))
    .filter((category) => category.id && category.name && category.menus.length)
}

function createProductDetailUrl(identity: BookingIdentity, productId: string) {
  return `${identity.referer.replace(/\/$/, '')}/items/${productId}`
}

function getTodayInKorea() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
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

function asString(value: unknown) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const numberValue = Number(value)

  return Number.isFinite(numberValue) ? numberValue : null
}

function toNumberOrDefault(value: unknown, fallback: number) {
  return toNullableNumber(value) ?? fallback
}
