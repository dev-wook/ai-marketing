import { GeminiApiError } from '@/lib/gemini'

export type BlogPostingErrorResponse = {
  status: number
  message: string
  debug?: {
    provider: string
    status?: number
    statusText?: string
    message: string
    body?: unknown
    createdAt: string
  }
}

export function toBlogPostingErrorResponse(error: unknown): BlogPostingErrorResponse {
  if (error instanceof GeminiApiError) {
    const debug = {
      provider: 'gemini',
      status: error.status,
      statusText: error.statusText,
      message: error.message,
      body: safelyParseJson(error.body),
      createdAt: new Date().toISOString(),
    }

    if (error.status === 400) {
      return {
        status: 400,
        message: '입력한 키워드를 다시 확인해주세요.',
        debug,
      }
    }

    if (error.status === 401 || error.status === 403) {
      return {
        status: 500,
        message: '현재 AI 연결 상태가 원활하지 않습니다. 잠시 후 다시 시도해주세요.',
        debug,
      }
    }

    if (error.status === 404) {
      return {
        status: 500,
        message: '현재 요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.',
        debug,
      }
    }

    if (error.status === 429) {
      return {
        status: 429,
        message: '현재 요청이 많습니다. 잠시 후 다시 시도해주세요.',
        debug,
      }
    }

    if (error.status === 500 || error.status === 503) {
      return {
        status: 503,
        message: '현재 AI 원고 작성이 지연되고 있습니다. 잠시 후 다시 시도해주세요.',
        debug,
      }
    }
  }

  if (error instanceof Error) {
    console.error('Blog posting error', {
      message: error.message,
      stack: error.stack,
    })
  }

  return {
    status: 500,
    message: '블로그 원고 작성 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
    debug:
      error instanceof Error
        ? {
            provider: 'aiva',
            message: error.message,
            createdAt: new Date().toISOString(),
          }
        : undefined,
  }
}

function safelyParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}
