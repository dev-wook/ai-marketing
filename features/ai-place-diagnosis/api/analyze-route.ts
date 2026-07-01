import { NextResponse } from 'next/server'
import {
  GeminiApiError,
  GeminiRateLimitError,
  getGeminiErrorMetadata,
} from '@/lib/gemini'
import type { AiPlaceDiagnosisRequest } from '../types'
import { diagnoseAiPlace } from '../server/diagnose-place'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AiPlaceDiagnosisRequest

    return NextResponse.json(await diagnoseAiPlace(body))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 플레이스 진단에 실패했습니다.'
    const geminiMetadata =
      error instanceof GeminiApiError
        ? getGeminiErrorMetadata(error)
        : error instanceof GeminiRateLimitError
          ? error.metadata
          : null

    if (error instanceof Error) {
      console.error('AI place diagnosis error', {
        message: error.message,
        stack: error.stack,
        ...(geminiMetadata ? { metadata: geminiMetadata } : {}),
      })
    }

    const isInputError =
      message.includes('입력') ||
      message.includes('URL') ||
      message.includes('찾지 못했습니다') ||
      message.includes('진단할 수 있습니다')
    const isGeminiRateLimit =
      error instanceof GeminiRateLimitError ||
      (error instanceof GeminiApiError && error.status === 429)
    const retryAfterMs =
      geminiMetadata && 'retryAfterMs' in geminiMetadata
        ? geminiMetadata.retryAfterMs
        : undefined
    const availableAt =
      geminiMetadata && 'availableAt' in geminiMetadata
        ? geminiMetadata.availableAt
        : retryAfterMs
          ? new Date(Date.now() + retryAfterMs).toISOString()
          : undefined

    return NextResponse.json(
      {
        message: isInputError
          ? message
          : isGeminiRateLimit
            ? createGeminiRateLimitMessage(retryAfterMs)
            : 'AI 플레이스 진단 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
        retryAfterMs,
        availableAt,
        debug:
          error instanceof Error
            ? {
                provider:
                  error instanceof GeminiApiError || error instanceof GeminiRateLimitError
                    ? 'gemini'
                    : 'ai-place-diagnosis',
                message: error.message,
                metadata: geminiMetadata ?? undefined,
                createdAt: new Date().toISOString(),
              }
            : undefined,
      },
      { status: isInputError ? 400 : isGeminiRateLimit ? 429 : 500 },
    )
  }
}

function createGeminiRateLimitMessage(retryAfterMs?: number) {
  if (!retryAfterMs || retryAfterMs <= 0) {
    return 'Gemini API 사용량이 일시적으로 많습니다. 잠시 후 다시 시도해주세요.'
  }

  return `Gemini API 사용량이 일시적으로 많습니다. 약 ${formatRetryAfter(retryAfterMs)} 후 다시 이용할 수 있습니다.`
}

function formatRetryAfter(value: number) {
  const seconds = Math.max(1, Math.ceil(value / 1000))

  if (seconds < 60) {
    return `${seconds}초`
  }

  return `${Math.ceil(seconds / 60)}분`
}
