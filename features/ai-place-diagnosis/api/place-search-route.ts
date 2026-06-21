import { NextResponse } from 'next/server'
import { collectNaverPlaceRankings } from '@/features/place-ranking/server/naver-place-rankings'
import type {
  AiPlaceDiagnosisPlaceSearchRequest,
  AiPlaceDiagnosisPlaceSearchResponse,
} from '../types'

const searchLimit = 50
const maxVisibleResults = 12

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AiPlaceDiagnosisPlaceSearchRequest
    const query = body.query?.trim() ?? ''

    if (!query) {
      return NextResponse.json({ message: '검색할 플레이스명을 입력해주세요.' }, { status: 400 })
    }

    const rankings = await collectNaverPlaceRankings({
      keyword: query,
      limit: searchLimit,
    })
    const response: AiPlaceDiagnosisPlaceSearchResponse = {
      query,
      collectedAt: rankings.collectedAt,
      items: rankings.items.slice(0, maxVisibleResults).map((place) => ({
        id: place.id,
        name: place.name,
        category: place.category,
        address:
          place.location.fullAddress ||
          place.location.address ||
          place.location.roadAddress ||
          place.location.commonAddress ||
          '',
        imageUrl: place.images.mainImageUrl,
      })),
    }

    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof Error) {
      console.error('AI place diagnosis place search error', {
        message: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      {
        message: '플레이스 검색 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
        debug:
          error instanceof Error
            ? {
                provider: 'naver-place-graphql',
                message: error.message,
                createdAt: new Date().toISOString(),
              }
            : undefined,
      },
      { status: 500 },
    )
  }
}
