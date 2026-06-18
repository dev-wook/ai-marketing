import { NextResponse } from 'next/server'
import {
  deletePlaceRankingBlacklistEntry,
  deletePlaceRankingBlacklistEntryByKey,
  listPlaceRankingBlacklistEntries,
  listPlaceRankingBlacklistGroups,
  upsertPlaceRankingBlacklistEntry,
} from '../server/blacklist-repository'

type CreateBlacklistRequest = {
  keyword?: string
  placeKey?: string
  placeId?: string | null
  placeName?: string
  category?: string | null
}

type DeleteBlacklistRequest = {
  id?: number
  keyword?: string
  placeKey?: string
}

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const keyword = url.searchParams.get('keyword')?.trim()

    if (keyword) {
      const entries = await listPlaceRankingBlacklistEntries({ keyword })

      return NextResponse.json({ entries })
    }

    const groups = await listPlaceRankingBlacklistGroups()

    return NextResponse.json({ groups })
  } catch (error) {
    return createBlacklistErrorResponse(error, '제외 목록 조회 중 문제가 발생했습니다.')
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateBlacklistRequest
    const keyword = body.keyword?.trim()
    const placeName = body.placeName?.trim()
    const placeKey = body.placeKey?.trim()

    if (!keyword || !placeName || !placeKey) {
      return NextResponse.json(
        { message: '제외할 키워드와 플레이스 정보가 필요합니다.' },
        { status: 400 },
      )
    }

    const entry = await upsertPlaceRankingBlacklistEntry({
      keyword,
      placeKey,
      placeId: body.placeId,
      placeName,
      category: body.category,
    })

    return NextResponse.json({ entry })
  } catch (error) {
    return createBlacklistErrorResponse(error, '제외 목록 등록 중 문제가 발생했습니다.')
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as DeleteBlacklistRequest
    const id = Number(body.id)
    const keyword = body.keyword?.trim()
    const placeKey = body.placeKey?.trim()

    if (Number.isFinite(id) && id > 0) {
      await deletePlaceRankingBlacklistEntry(id)

      return NextResponse.json({ ok: true })
    }

    if (keyword && placeKey) {
      await deletePlaceRankingBlacklistEntryByKey({ keyword, placeKey })

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json(
      { message: '삭제할 제외 목록을 찾을 수 없습니다.' },
      { status: 400 },
    )
  } catch (error) {
    return createBlacklistErrorResponse(error, '제외 목록 삭제 중 문제가 발생했습니다.')
  }
}

function createBlacklistErrorResponse(error: unknown, message: string) {
  if (error instanceof Error) {
    console.error('Place ranking blacklist error', {
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
