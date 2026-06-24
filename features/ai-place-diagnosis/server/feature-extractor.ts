import { createHash } from 'crypto'
import type { PlaceRankingItem } from '@/features/place-ranking/types'
import type {
  AiPlaceDiagnosisBookingProduct,
  AiPlaceDiagnosisMetrics,
  AiPlaceDiagnosisPlaceProfile,
  AiPlaceFeatureSet,
  AiPlaceFieldStatus,
  AiPlaceFieldStatusMap,
  AiPlaceNormalizedSnapshot,
} from '../types'

export function createNormalizedSnapshot({
  keyword,
  place,
  profile,
  products,
}: {
  keyword: string
  place: PlaceRankingItem
  profile: AiPlaceDiagnosisPlaceProfile
  products: AiPlaceDiagnosisBookingProduct[]
}) {
  const metrics = createMetrics(place)
  const reviewSnippets = place.reviews.snippets.map((snippet) => snippet.text).filter(Boolean)
  const reviewImages = place.reviews.images.map((image) => image.imageUrl).filter(Boolean)
  const imageUrls = [place.images.mainImageUrl, ...place.images.imageUrls, ...profile.imageUrls]
    .filter((value): value is string => Boolean(value))
  const websiteUrl = profile.websiteUrl ?? ''
  const normalized: AiPlaceNormalizedSnapshot = {
    placeId: place.id,
    name: place.name,
    category: place.category,
    address:
      place.location.fullAddress ||
      place.location.address ||
      place.location.roadAddress ||
      place.location.commonAddress ||
      '',
    imageUrl: place.images.mainImageUrl,
    profile,
    metrics,
    bookingProducts: products,
    reviewSnippets,
    reviewImages,
    imageUrls,
    hashtags: place.hashtags,
    options: place.options,
    conversion: {
      hasBooking: place.actions.hasBooking,
      hasTalktalk: Boolean(place.actions.talktalkUrl),
      hasCoupon: place.benefits.hasCoupon,
      couponCount: place.benefits.couponCount,
      hasNPay: place.badges.includes('네이버페이') || Boolean(profile.nPayStatus),
      hasPhone: Boolean(place.actions.phone || profile.phone),
      hasRoute: Boolean(place.actions.routeUrl),
      hasWebsite: Boolean(websiteUrl),
      hasInstagram: websiteUrl.includes('instagram.com'),
    },
  }
  const fieldStatus = createFieldStatus(normalized)
  const features = extractAiPlaceFeatures({ keyword, normalized })
  const dataCompleteness = calculateDataCompleteness(fieldStatus)
  const collectorErrorCount = Object.values(fieldStatus).filter((status) => status === 'ERROR').length
  const snapshotHash = createSnapshotHash({
    normalized,
    fieldStatus,
    features,
  })

  return {
    normalized,
    fieldStatus,
    features,
    dataCompleteness,
    collectorErrorCount,
    snapshotHash,
  }
}

export function extractAiPlaceFeatures({
  keyword,
  normalized,
}: {
  keyword: string
  normalized: AiPlaceNormalizedSnapshot
}): AiPlaceFeatureSet {
  const products = normalized.bookingProducts
  const treatmentMenus = products.flatMap((product) =>
    (product.treatmentMenuCategories ?? []).flatMap((category) => category.menus),
  )
  const productDescriptions = [
    ...products.map((product) => product.description.trim()),
    ...treatmentMenus.map((menu) => menu.description.trim()),
  ].filter(Boolean)
  const productCount = products.length
  const serviceItemCount = Math.max(productCount, treatmentMenus.length)
  const reviewSnippetTexts = normalized.reviewSnippets
  const lowerKeyword = keyword.toLowerCase()
  const reviewSnippetKeywordMentions = reviewSnippetTexts.filter((text) =>
    text.toLowerCase().includes(lowerKeyword) || keyword.split(/\s+/).some((part) => part && text.includes(part)),
  ).length
  const reviewSnippetSpecificityScore = calculateSnippetSpecificity(reviewSnippetTexts)

  return {
    review: {
      visitorReviewCount: normalized.metrics.totalReviewCount,
      blogReviewCount: normalized.metrics.blogCafeReviewCount,
      bookingReviewCount: normalized.metrics.bookingReviewCount,
      reviewSnippetTexts,
      reviewSnippetKeywordMentions,
      reviewSnippetSpecificityScore,
      reviewImageCount: normalized.reviewImages.length,
    },
    service: {
      hasIntroduction: Boolean(normalized.profile.introduction),
      introductionLength: normalized.profile.introduction.length,
      hasPromotion: Boolean(normalized.profile.promotion),
      promotionLength: normalized.profile.promotion.length,
      bookingProductCount: productCount,
      productDescriptionCoverage: serviceItemCount ? Math.min(1, productDescriptions.length / serviceItemCount) : 0,
      productAverageDescriptionLength: productDescriptions.length
        ? average(productDescriptions.map((description) => description.length))
        : 0,
      priceCoverage: serviceItemCount
        ? Math.min(
            1,
            (products.filter((product) => product.price !== null || product.minPrice !== null || product.maxPrice !== null)
              .length +
              treatmentMenus.filter((menu) => menu.price !== null || menu.normalPrice !== null).length) /
              serviceItemCount,
          )
        : 0,
      durationCoverage: serviceItemCount
        ? Math.min(
            1,
            (products.filter(
              (product) =>
                product.inferredDurationMinutes !== null ||
                product.minBookingTime !== null ||
                product.maxBookingTime !== null,
            ).length +
              treatmentMenus.filter((menu) => menu.serviceDurationMinutes !== null || menu.description.includes('시술 시간'))
                .length) /
              serviceItemCount,
          )
        : 0,
      precautionCoverage: productCount
        ? products.filter((product) => product.precautions.length > 0).length / productCount
        : 0,
      productImageCount: products.reduce((sum, product) => sum + product.imageUrls.length, 0),
    },
    local: {
      hasAddress: Boolean(normalized.address),
      hasLocationGuide: Boolean(normalized.profile.locationGuide),
      locationGuideLength: normalized.profile.locationGuide.length,
      keywordRegionMentioned: keyword
        .split(/\s+/)
        .filter((part) => part.length >= 2)
        .some((part) => normalized.address.includes(part) || normalized.profile.locationGuide.includes(part)),
      hasRoute: normalized.conversion.hasRoute,
    },
    content: {
      imageCount: Math.max(normalized.metrics.imageCount, normalized.imageUrls.length),
      imageUrlCount: normalized.imageUrls.length,
      hashtagCount: normalized.hashtags.length,
      optionCount: normalized.options.length,
      hasWebsite: normalized.conversion.hasWebsite,
      hasInstagram: normalized.conversion.hasInstagram,
    },
    conversion: {
      ...normalized.conversion,
      bookingProductCount: productCount,
    },
  }
}

export function createFieldStatus(normalized: AiPlaceNormalizedSnapshot): AiPlaceFieldStatusMap {
  return {
    name: statusForValue(normalized.name),
    category: statusForValue(normalized.category),
    address: statusForValue(normalized.address),
    introduction: statusForValue(normalized.profile.introduction),
    promotion: statusForValue(normalized.profile.promotion),
    locationGuide: statusForValue(normalized.profile.locationGuide),
    amenities: statusForArray(normalized.profile.amenities),
    website: statusForValue(normalized.profile.websiteUrl),
    phone: statusForValue(normalized.profile.phone),
    images: statusForArray(normalized.imageUrls),
    visitorReviews: normalized.metrics.totalReviewCount > 0 ? 'PRESENT' : 'ABSENT',
    blogReviews: normalized.metrics.blogCafeReviewCount > 0 ? 'PRESENT' : 'ABSENT',
    bookingReviews: normalized.metrics.bookingReviewCount > 0 ? 'PRESENT' : 'ABSENT',
    reviewSnippets: statusForArray(normalized.reviewSnippets),
    reviewImages: statusForArray(normalized.reviewImages),
    booking: normalized.conversion.hasBooking ? 'PRESENT' : 'ABSENT',
    bookingProducts: normalized.conversion.hasBooking
      ? statusForArray(normalized.bookingProducts)
      : 'ABSENT',
    talktalk: normalized.conversion.hasTalktalk ? 'PRESENT' : 'ABSENT',
    coupon: normalized.conversion.hasCoupon ? 'PRESENT' : 'ABSENT',
    naverPay: normalized.conversion.hasNPay ? 'PRESENT' : 'ABSENT',
    route: normalized.conversion.hasRoute ? 'PRESENT' : 'ABSENT',
    newsPosts: 'UNAVAILABLE',
    instagramPosts: 'UNAVAILABLE',
    fullReviewTexts: 'UNAVAILABLE',
    recentMonthlyReviews: 'UNAVAILABLE',
    imageQualityVision: 'UNAVAILABLE',
  }
}

export function calculateDataCompleteness(fieldStatus: AiPlaceFieldStatusMap) {
  const scorableStatuses = Object.values(fieldStatus).filter((status) => status !== 'UNAVAILABLE')

  if (!scorableStatuses.length) {
    return 0
  }

  const presentCount = scorableStatuses.filter((status) => status === 'PRESENT').length
  const errorCount = scorableStatuses.filter((status) => status === 'ERROR').length
  const baseScore = (presentCount / scorableStatuses.length) * 100

  return clamp(Math.round(baseScore - errorCount * 6), 0, 100)
}

export function createSnapshotHash(value: unknown) {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

export function createMetrics(place: PlaceRankingItem): AiPlaceDiagnosisMetrics {
  return {
    totalReviewCount: place.reviews.totalReviewCount,
    blogCafeReviewCount: place.reviews.blogCafeReviewCount,
    bookingReviewCount: place.reviews.bookingReviewCount,
    imageCount: place.images.imageCount,
    hashtagCount: place.hashtags.length,
    reviewSnippetCount: place.reviews.snippets.length,
    hasBooking: place.actions.hasBooking,
    hasTalktalk: Boolean(place.actions.talktalkUrl),
    hasCoupon: place.benefits.hasCoupon,
    hasNPay: place.badges.includes('네이버페이'),
  }
}

function calculateSnippetSpecificity(snippets: string[]) {
  if (!snippets.length) {
    return 0
  }

  const specificWords = [
    '속눈썹',
    '펌',
    '연장',
    '자연',
    '유지',
    '상담',
    '눈매',
    '디자인',
    '꼼꼼',
    '재방문',
    '역',
    '주차',
  ]
  const genericWords = ['좋아요', '친절', '만족', '추천']
  const scores = snippets.map((snippet) => {
    const specificCount = specificWords.filter((word) => snippet.includes(word)).length
    const genericCount = genericWords.filter((word) => snippet.includes(word)).length
    const lengthScore = Math.min(snippet.length / 60, 1)

    return clamp(specificCount * 0.22 + lengthScore * 0.25 - genericCount * 0.04, 0, 1)
  })

  return Math.round(average(scores) * 100) / 100
}

function statusForValue(value: unknown): AiPlaceFieldStatus {
  return value === null || value === undefined || value === '' ? 'ABSENT' : 'PRESENT'
}

function statusForArray(value: unknown[]): AiPlaceFieldStatus {
  return value.length > 0 ? 'PRESENT' : 'ABSENT'
}

function average(values: number[]) {
  if (!values.length) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}
