import { NextResponse, type NextRequest } from 'next/server'
import { getAuthUserFromRequest } from '@/features/auth/server/session'
import {
  deactivateAiPlaceKeyword,
  listAiPlaceKeywords,
  upsertAiPlaceKeyword,
} from '../server/repository'

type CreateKeywordRequest = {
  keyword?: string
}

type DeleteKeywordRequest = {
  id?: string
}

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  if (!getAuthUserFromRequest(request)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  try {
    return NextResponse.json({
      keywords: await listAiPlaceKeywords({ activeOnly: true }),
    })
  } catch (error) {
    return createKeywordErrorResponse(error, 'AI 진단 기준 키워드 조회 중 문제가 발생했습니다.')
  }
}

export async function POST(request: NextRequest) {
  if (!getAuthUserFromRequest(request)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as CreateKeywordRequest
    const keyword = normalizeKeyword(body.keyword ?? '')

    if (!keyword) {
      return NextResponse.json({ message: '키워드를 입력해주세요.' }, { status: 400 })
    }

    return NextResponse.json({
      keyword: await upsertAiPlaceKeyword(keyword),
    })
  } catch (error) {
    return createKeywordErrorResponse(error, 'AI 진단 기준 키워드 추가 중 문제가 발생했습니다.')
  }
}

export async function DELETE(request: NextRequest) {
  if (!getAuthUserFromRequest(request)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as DeleteKeywordRequest

    if (!body.id) {
      return NextResponse.json({ message: '삭제할 키워드 정보가 올바르지 않습니다.' }, { status: 400 })
    }

    await deactivateAiPlaceKeyword(body.id)

    return NextResponse.json({ ok: true })
  } catch (error) {
    return createKeywordErrorResponse(error, 'AI 진단 기준 키워드 삭제 중 문제가 발생했습니다.')
  }
}

function createKeywordErrorResponse(error: unknown, message: string) {
  if (error instanceof Error) {
    console.error('AI place benchmark keyword error', {
      message: error.message,
      stack: error.stack,
    })
  }

  return NextResponse.json(
    {
      message,
      debug:
        error instanceof Error
          ? {
              provider: 'ai-place-keywords',
              message: error.message,
              createdAt: new Date().toISOString(),
            }
          : undefined,
    },
    { status: 500 },
  )
}

function normalizeKeyword(keyword: string) {
  return keyword.trim().replace(/\s+/g, ' ')
}
