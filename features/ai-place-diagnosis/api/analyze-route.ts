import { NextResponse } from 'next/server'
import { GeminiApiError, getGeminiErrorMetadata } from '@/lib/gemini'
import type { AiPlaceDiagnosisRequest } from '../types'
import { diagnoseAiPlace } from '../server/diagnose-place'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AiPlaceDiagnosisRequest

    return NextResponse.json(await diagnoseAiPlace(body))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 플레이스 진단에 실패했습니다.'

    if (error instanceof Error) {
      console.error('AI place diagnosis error', {
        message: error.message,
        stack: error.stack,
        ...(error instanceof GeminiApiError
          ? { metadata: getGeminiErrorMetadata(error) }
          : {}),
      })
    }

    const isInputError =
      message.includes('입력') ||
      message.includes('URL') ||
      message.includes('찾지 못했습니다') ||
      message.includes('진단할 수 있습니다')

    return NextResponse.json(
      {
        message: isInputError
          ? message
          : 'AI 플레이스 진단 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
        debug:
          error instanceof Error
            ? {
                provider: error instanceof GeminiApiError ? 'gemini' : 'ai-place-diagnosis',
                message: error.message,
                createdAt: new Date().toISOString(),
              }
            : undefined,
      },
      { status: isInputError ? 400 : 500 },
    )
  }
}
