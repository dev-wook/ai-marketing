import type {
  AiPlaceBenchmarkProfileSummary,
  AiPlaceDiagnosisScore,
  AiPlaceDiagnosisScoreKey,
  AiPlaceFeatureSet,
  AiPlaceFieldStatusMap,
} from '../types'

export const aiPlaceScoreDefinitions: Array<{
  key: AiPlaceDiagnosisScoreKey
  label: string
  maxScore: number
}> = [
  { key: 'intentAndService', label: '검색 의도 및 서비스 적합도', maxScore: 20 },
  { key: 'serviceInformation', label: '서비스 정보 완성도', maxScore: 25 },
  { key: 'localEntity', label: '지역·위치·엔티티 명확성', maxScore: 15 },
  { key: 'contentRichness', label: '콘텐츠 정보량', maxScore: 15 },
  { key: 'conversion', label: '예약·문의·전환 편의성', maxScore: 10 },
  { key: 'differentiation', label: '고유 정보 및 차별성', maxScore: 15 },
]

export type SemanticDiagnosisScores = Partial<Record<
  'queryIntentMatch' | 'serviceClarity' | 'localEntityClarity' | 'differentiation',
  number
>>

export function scoreAiPlace({
  benchmarkProfile,
  dataCompleteness,
  features,
  fieldStatus,
  keyword,
  semanticScores = {},
}: {
  benchmarkProfile: AiPlaceBenchmarkProfileSummary
  dataCompleteness: number
  features: AiPlaceFeatureSet
  fieldStatus: AiPlaceFieldStatusMap
  keyword: string
  semanticScores?: SemanticDiagnosisScores
}) {
  const semantic = normalizeSemanticScores(semanticScores)
  const scores: AiPlaceDiagnosisScore[] = [
    createScore('intentAndService', {
      score:
        boolScore(keywordServiceMentioned({ keyword, features }), 5) +
        boolScore(features.service.bookingProductCount > 0, 3) +
        ratioScore(features.service.productDescriptionCoverage, 5) +
        ratioScore(Math.min(features.service.productAverageDescriptionLength / 140, 1), 2) +
        boolScore(features.service.hasIntroduction, 2) +
        semantic.queryIntentMatch,
      reason: '키워드 서비스와 예약상품/소개글의 연결성을 기준으로 평가했습니다.',
    }),
    createScore('serviceInformation', {
      score:
        boolScore(features.service.hasIntroduction, 4) +
        ratioScore(Math.min(features.service.introductionLength / 180, 1), 4) +
        ratioScore(features.service.productDescriptionCoverage, 5) +
        ratioScore(features.service.priceCoverage, 3) +
        ratioScore(features.service.durationCoverage, 3) +
        ratioScore(features.service.precautionCoverage, 3) +
        Math.min(features.service.productAverageDescriptionLength / 140, 1) * 3 +
        semantic.serviceClarity,
      reason: '소개글, 예약상품 설명, 가격, 소요시간, 주의사항의 완성도를 기준으로 평가했습니다.',
    }),
    createScore('localEntity', {
      score:
        boolScore(features.local.hasAddress, 3) +
        boolScore(features.local.hasLocationGuide, 3) +
        ratioScore(Math.min(features.local.locationGuideLength / 120, 1), 2) +
        boolScore(features.local.keywordRegionMentioned, 2) +
        boolScore(features.local.hasRoute, 1) +
        semantic.localEntityClarity,
      reason: '주소, 오시는 길, 지역명 연결성, 길찾기 신호를 기준으로 평가했습니다.',
    }),
    createScore('contentRichness', {
      score:
        ratioScore(Math.min(features.content.imageCount / 30, 1), 4) +
        ratioScore(Math.min(features.service.productImageCount / 8, 1), 3) +
        ratioScore(Math.min(features.content.optionCount / 8, 1), 2) +
        ratioScore(Math.min(features.content.hashtagCount / 8, 1), 2) +
        boolScore(features.content.hasWebsite, 1) +
        boolScore(features.content.hasInstagram, 1) +
        boolScore(features.service.hasPromotion, 2),
      reason: '이미지 단순 개수는 낮게 보고, 상품 이미지와 소개/홍보/외부 채널 신호를 함께 평가했습니다.',
    }),
    createScore('conversion', {
      score:
        boolScore(features.conversion.hasBooking, 2) +
        ratioScore(Math.min(features.conversion.bookingProductCount / 5, 1), 1.2) +
        ratioScore(Math.min(features.conversion.bookingPolicyDescriptionCount / 2, 1), 0.8) +
        boolScore(features.conversion.hasTalktalk, 1) +
        boolScore(features.conversion.hasPhone, 1) +
        boolScore(features.conversion.hasWebsite, 1) +
        boolScore(features.conversion.hasNPay, 1) +
        boolScore(features.conversion.hasCoupon, 1) +
        boolScore(features.conversion.hasRoute, 1),
      reason: '예약, 예약상품 구조, 예약금/취소 안내, 문의, 전화, 웹사이트, 네이버페이, 쿠폰 같은 전환 편의 신호를 낮은 배점으로 평가했습니다.',
    }),
    createScore('differentiation', {
      score:
        boolScore(features.service.productAverageDescriptionLength >= 80, 4) +
        boolScore(features.service.hasIntroduction && features.service.introductionLength >= 120, 4) +
        ratioScore(features.service.productDescriptionCoverage, 3) +
        ratioScore(Math.min(features.content.imageUrlCount / 8, 1), 2) +
        semantic.differentiation +
        benchmarkSignalBonus(benchmarkProfile),
      reason: '설명 길이, 소개글, 상품 설명, 콘텐츠 근거, AI가 해석한 차별성 신호를 기준으로 평가했습니다.',
    }),
  ]
  const totalScore = Math.round(scores.reduce((sum, score) => sum + score.score, 0))
  const benchmarkPercentile = estimateBenchmarkPercentile({
    totalScore,
    benchmarkProfile,
    dataCompleteness,
  })

  return {
    totalScore,
    scores,
    categories: Object.fromEntries(scores.map((score) => [score.key, score.score])) as Record<
      AiPlaceDiagnosisScoreKey,
      number
    >,
    score: {
      absolute: totalScore,
      dataConfidence: dataCompleteness,
      benchmarkPercentile,
    },
    defaultImprovements: createDefaultImprovements({ fieldStatus, features }),
  }
}

function createScore(
  key: AiPlaceDiagnosisScoreKey,
  {
    reason,
    score,
  }: {
    reason: string
    score: number
  },
): AiPlaceDiagnosisScore {
  const definition = aiPlaceScoreDefinitions.find((item) => item.key === key)

  if (!definition) {
    throw new Error(`Unknown score key: ${key}`)
  }

  return {
    ...definition,
    score: clamp(Math.round(score), 0, definition.maxScore),
    reason,
  }
}

function normalizeSemanticScores(scores: SemanticDiagnosisScores) {
  return {
    queryIntentMatch: semanticScore(scores.queryIntentMatch),
    serviceClarity: semanticScore(scores.serviceClarity),
    localEntityClarity: semanticScore(scores.localEntityClarity),
    differentiation: semanticScore(scores.differentiation),
  }
}

function semanticScore(value: unknown) {
  const numberValue = typeof value === 'number' ? value : 0

  return clamp(numberValue, 0, 5)
}

function boolScore(value: boolean, maxScore: number) {
  return value ? maxScore : 0
}

function ratioScore(value: number, maxScore: number) {
  return clamp(value, 0, 1) * maxScore
}

function keywordServiceMentioned({
  features,
  keyword,
}: {
  features: AiPlaceFeatureSet
  keyword: string
}) {
  const serviceTerms = keyword.split(/\s+/).filter((part) => /속눈썹|펌|연장|뷰티/.test(part))

  if (!serviceTerms.length) {
    return true
  }

  return features.service.hasIntroduction || features.service.bookingProductCount > 0
}

function benchmarkSignalBonus(benchmarkProfile: AiPlaceBenchmarkProfileSummary) {
  return benchmarkProfile.status === 'ACTIVE' && benchmarkProfile.signalSummary.strongSignals.length
    ? 1
    : 0
}

function estimateBenchmarkPercentile({
  benchmarkProfile,
  dataCompleteness,
  totalScore,
}: {
  benchmarkProfile: AiPlaceBenchmarkProfileSummary
  dataCompleteness: number
  totalScore: number
}) {
  if (benchmarkProfile.status !== 'ACTIVE') {
    return null
  }

  const confidenceAdjustment = dataCompleteness < 50 ? -8 : dataCompleteness >= 80 ? 4 : 0

  return clamp(Math.round(totalScore + confidenceAdjustment), 1, 99)
}

function createDefaultImprovements({
  features,
  fieldStatus,
}: {
  features: AiPlaceFeatureSet
  fieldStatus: AiPlaceFieldStatusMap
}) {
  const improvements: string[] = []

  if (fieldStatus.introduction !== 'PRESENT') {
    improvements.push('소개글 첫 문장에 지역, 대표 서비스, 추천 대상을 명확히 작성하세요.')
  }

  if (features.service.productDescriptionCoverage < 0.8) {
    improvements.push('예약상품 설명에 추천 대상, 결과 특징, 가격, 소요시간, 주의사항을 보강하세요.')
  }

  if (!features.local.hasLocationGuide) {
    improvements.push('오시는 길에 역명, 출구, 건물명, 층수, 주차 정보를 구체적으로 추가하세요.')
  }

  if (!features.conversion.hasBooking) {
    improvements.push('가능하다면 네이버 예약상품을 등록해 AI가 서비스 구조를 이해할 수 있게 만드세요.')
  }

  if (features.conversion.hasBooking && features.conversion.bookingPolicyDescriptionCount === 0) {
    improvements.push('예약금, 변경/취소, 노쇼 기준처럼 예약 전 확인해야 할 운영 안내를 명확히 추가하세요.')
  }

  return improvements.slice(0, 5)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
