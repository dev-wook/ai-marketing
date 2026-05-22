import { NaverApiError } from '@/lib/naver'
import type { RouteErrorResponse } from '@/lib/api/route-response'

export function toNaverSearchErrorResponse(error: unknown, fallbackMessage: string): RouteErrorResponse {
  if (error instanceof NaverApiError) {
    if (error.status === 400) {
      return {
        status: 400,
        message: '검색어를 다시 확인해주세요.',
      }
    }

    if (error.status === 401 || error.status === 403) {
      return {
        status: 500,
        message: '현재 네이버 검색 연결 상태가 원활하지 않습니다. 잠시 후 다시 시도해주세요.',
      }
    }

    if (error.status === 404) {
      return {
        status: 500,
        message: '현재 검색 요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.',
      }
    }

    if (error.status === 429) {
      return {
        status: 429,
        message: '현재 검색 요청이 많습니다. 잠시 후 다시 시도해주세요.',
      }
    }
  }

  if (error instanceof Error) {
    console.error('Naver search route error', {
      message: error.message,
      stack: error.stack,
    })
  }

  return {
    status: 500,
    message: fallbackMessage,
  }
}
