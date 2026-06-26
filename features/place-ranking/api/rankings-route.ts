import { NextResponse } from 'next/server'
import { collectNaverPlaceRankings } from '../server/naver-place-rankings'
import { attachPreviousRankChanges } from '../server/ranking-snapshot-service'

type PlaceRankingRequest = {
  keyword?: string
  limit?: number
}

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PlaceRankingRequest
    const keyword = body.keyword?.trim() ?? ''

    if (!keyword) {
      return NextResponse.json({ message: '조회할 키워드를 입력해주세요.' }, { status: 400 })
    }

    const result = await collectNaverPlaceRankings({
      keyword,
      limit: body.limit,
    })

    try {
      return NextResponse.json(await attachPreviousRankChanges(result))
    } catch (snapshotError) {
      if (snapshotError instanceof Error) {
        console.error('Place ranking previous snapshot comparison error', {
          message: snapshotError.message,
          stack: snapshotError.stack,
        })
      }

      return NextResponse.json(result)
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('Naver place ranking error', {
        message: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      {
        message:
          '네이버 플레이스 순위 조회 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
        debug:
          error instanceof Error
            ? {
                provider: 'naver-mobile-fusion-search',
                message: error.message,
                createdAt: new Date().toISOString(),
              }
            : undefined,
      },
      { status: 500 },
    )
  }
}
