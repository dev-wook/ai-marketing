import { NextResponse } from 'next/server'
import {
  createTrackedKeyword,
  deleteTrackedKeyword,
  updateTrackedKeyword,
} from '../server/place-tracking-repository'

type KeywordRequest = {
  action?: 'create' | 'update' | 'delete'
  id?: number
  placeId?: number
  keyword?: string
}

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as KeywordRequest
    const action = body.action ?? 'create'

    if (action === 'create') {
      const keyword = normalizeKeyword(body.keyword ?? '')

      if (!body.placeId || !keyword) {
        return NextResponse.json({ message: '키워드를 입력해주세요.' }, { status: 400 })
      }

      return NextResponse.json({
        keyword: await createTrackedKeyword({
          placeId: Number(body.placeId),
          keyword,
        }),
      })
    }

    if (action === 'update') {
      const keyword = normalizeKeyword(body.keyword ?? '')

      if (!body.id || !keyword) {
        return NextResponse.json({ message: '키워드를 입력해주세요.' }, { status: 400 })
      }

      await updateTrackedKeyword({
        id: Number(body.id),
        keyword,
      })

      return NextResponse.json({ ok: true })
    }

    if (action === 'delete') {
      await deleteTrackedKeyword(Number(body.id))

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ message: '지원하지 않는 요청입니다.' }, { status: 400 })
  } catch (error) {
    if (error instanceof Error) {
      console.error('Place tracking keyword error', {
        message: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      {
        message: '키워드 처리 중 문제가 발생했습니다.',
        debug:
          error instanceof Error
            ? {
                provider: 'place-tracking',
                message: error.message,
                createdAt: new Date().toISOString(),
              }
            : undefined,
      },
      { status: 500 },
    )
  }
}

function normalizeKeyword(keyword: string) {
  return keyword.trim().replace(/\s+/g, ' ')
}
