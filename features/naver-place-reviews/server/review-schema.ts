import type { NaverReviewRequestType, NaverReviewType } from '../types'

const placeIdPattern = /^\d+$/
const maxPlaceIdLength = 32
const maxCursorLength = 512
const defaultLimit = 10
const maxLimit = 30

export type ParsedReviewSearchParams = {
  placeId: string
  type: NaverReviewRequestType
  includeItems: boolean
  limit: number
  cursor?: string
}

export type ParsedReviewBatchBody = {
  placeIds: string[]
  types: NaverReviewType[]
  includeItems: false
  limit: number
}

export function parseReviewSearchParams(params: URLSearchParams): ParsedReviewSearchParams {
  const placeId = params.get('placeId')?.trim() ?? ''
  const type = normalizeReviewRequestType(params.get('type') ?? 'all')
  const includeItems = params.get('includeItems') === 'true'
  const limit = normalizeLimit(params.get('limit'))
  const cursor = params.get('cursor')?.trim() || undefined

  assertValidPlaceId(placeId)

  if (cursor && cursor.length > maxCursorLength) {
    throw new ReviewRequestValidationError('cursor 값이 너무 깁니다.', 'INVALID_CURSOR')
  }

  return {
    placeId,
    type,
    includeItems,
    limit,
    cursor,
  }
}

export function parseReviewBatchBody(body: unknown): ParsedReviewBatchBody {
  const record = isRecord(body) ? body : {}
  const rawPlaceIds = Array.isArray(record.placeIds) ? record.placeIds : []
  const placeIds = Array.from(new Set(rawPlaceIds.map((item) => String(item ?? '').trim())))
    .filter(Boolean)
    .slice(0, 30)
  const rawTypes = Array.isArray(record.types) ? record.types : ['visitor', 'blog']
  const types = Array.from(new Set(rawTypes.map((item) => normalizeReviewType(String(item)))))

  if (placeIds.length === 0) {
    throw new ReviewRequestValidationError('조회할 플레이스 ID를 입력해주세요.', 'INVALID_PLACE_ID')
  }

  placeIds.forEach(assertValidPlaceId)

  return {
    placeIds,
    types: types.length ? types : ['visitor', 'blog'],
    includeItems: false,
    limit: normalizeLimit(record.limit),
  }
}

export function assertValidPlaceId(placeId: string) {
  if (!placeId || !placeIdPattern.test(placeId) || placeId.length > maxPlaceIdLength) {
    throw new ReviewRequestValidationError('유효한 플레이스 ID를 입력해주세요.', 'INVALID_PLACE_ID')
  }
}

export class ReviewRequestValidationError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message)
  }
}

function normalizeReviewRequestType(value: string): NaverReviewRequestType {
  if (value === 'all') {
    return value
  }

  return normalizeReviewType(value)
}

function normalizeReviewType(value: string): NaverReviewType {
  if (value === 'visitor' || value === 'blog') {
    return value
  }

  throw new ReviewRequestValidationError('리뷰 타입은 visitor, blog, all만 사용할 수 있습니다.', 'INVALID_REVIEW_TYPE')
}

function normalizeLimit(value: unknown) {
  const parsed = Number(value ?? defaultLimit)

  if (!Number.isFinite(parsed)) {
    return defaultLimit
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), maxLimit)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
