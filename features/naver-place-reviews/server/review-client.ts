import type { NaverReviewType, NaverReviewWarningCode } from '../types'
import { createNaverPlaceReviewUrl } from './review-url'

export type NaverReviewFetchResult =
  | {
      ok: true
      status: number
      html: string
      sourceUrl: string
    }
  | {
      ok: false
      status: number | null
      sourceUrl: string
      warning: NaverReviewWarningCode
    }

const requestTimeoutMs = 4500
const userAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

export async function fetchNaverReviewPage({
  placeId,
  type,
}: {
  placeId: string
  type: NaverReviewType
}): Promise<NaverReviewFetchResult> {
  const sourceUrl = createNaverPlaceReviewUrl(placeId, type)

  try {
    const response = await fetchWithTimeout(sourceUrl)

    if (response.status === 403) {
      return { ok: false, status: response.status, sourceUrl, warning: 'NAVER_REQUEST_FORBIDDEN' }
    }

    if (response.status === 429) {
      return { ok: false, status: response.status, sourceUrl, warning: 'NAVER_REQUEST_RATE_LIMITED' }
    }

    if (!response.ok) {
      return { ok: false, status: response.status, sourceUrl, warning: 'NAVER_RESPONSE_INVALID' }
    }

    return {
      ok: true,
      status: response.status,
      html: await response.text(),
      sourceUrl,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, status: null, sourceUrl, warning: 'NAVER_REQUEST_TIMEOUT' }
    }

    return { ok: false, status: null, sourceUrl, warning: 'NAVER_RESPONSE_INVALID' }
  }
}

function fetchWithTimeout(url: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs)

  return fetch(url, {
    method: 'GET',
    headers: {
      accept: 'text/html,application/json',
      'accept-language': 'ko-KR,ko;q=0.9',
      'user-agent': userAgent,
    },
    signal: controller.signal,
    cache: 'no-store',
  }).finally(() => {
    clearTimeout(timer)
  })
}
