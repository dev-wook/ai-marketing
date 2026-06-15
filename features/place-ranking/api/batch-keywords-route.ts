import { NextResponse } from 'next/server'
import {
  addPlaceRankingBatchKeyword,
  readPlaceRankingBatchKeywords,
  removePlaceRankingBatchKeyword,
} from '../server/batch-keyword-service'

type CreateBatchKeywordRequest = {
  keyword?: string
}

type DeleteBatchKeywordRequest = {
  id?: number
}

export const runtime = 'nodejs'

export async function GET() {
  try {
    const keywords = await readPlaceRankingBatchKeywords()

    return NextResponse.json({ keywords })
  } catch (error) {
    return createBatchKeywordErrorResponse(error, '배치 키워드 목록 조회 중 문제가 발생했습니다.')
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateBatchKeywordRequest
    const keyword = await addPlaceRankingBatchKeyword(body.keyword ?? '')

    return NextResponse.json({ keyword })
  } catch (error) {
    return createBatchKeywordErrorResponse(error, '배치 키워드 추가 중 문제가 발생했습니다.')
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as DeleteBatchKeywordRequest

    await removePlaceRankingBatchKeyword(Number(body.id))

    return NextResponse.json({ ok: true })
  } catch (error) {
    return createBatchKeywordErrorResponse(error, '배치 키워드 삭제 중 문제가 발생했습니다.')
  }
}

function createBatchKeywordErrorResponse(error: unknown, message: string) {
  if (error instanceof Error) {
    console.error('Place ranking batch keyword error', {
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
              provider: 'supabase',
              message: error.message,
              createdAt: new Date().toISOString(),
            }
          : undefined,
    },
    { status: 500 },
  )
}
