import { NextResponse } from 'next/server'
import type { PlaceRankingItem } from '../types'
import {
  readPlaceRankingSnapshotHistory,
  readPlaceRankingSnapshotSummary,
  recordPlaceRankingSnapshots,
} from '../server/ranking-snapshot-service'

type SaveSnapshotRequest = {
  keyword?: string
  snapshotDate?: string
  items?: PlaceRankingItem[]
}

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SaveSnapshotRequest
    const summary = await recordPlaceRankingSnapshots({
      keyword: body.keyword ?? '',
      snapshotDate: body.snapshotDate,
      items: body.items ?? [],
    })

    return NextResponse.json({
      message: '오늘 순위 기록이 저장되었습니다.',
      summary,
    })
  } catch (error) {
    return createSnapshotErrorResponse(error, '순위 기록 저장 중 문제가 발생했습니다.')
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const keyword = url.searchParams.get('keyword') ?? ''
    const placeId = url.searchParams.get('placeId')

    if (placeId) {
      const history = await readPlaceRankingSnapshotHistory({
        keyword,
        placeId,
      })

      return NextResponse.json({
        keyword,
        placeId,
        history,
      })
    }

    const snapshotDate = url.searchParams.get('snapshotDate') ?? undefined
    const placeIds = url.searchParams.getAll('placeId')

    const summary = await readPlaceRankingSnapshotSummary({
      keyword,
      snapshotDate,
      placeIds,
    })

    return NextResponse.json({ summary })
  } catch (error) {
    return createSnapshotErrorResponse(error, '순위 기록 조회 중 문제가 발생했습니다.')
  }
}

function createSnapshotErrorResponse(error: unknown, message: string) {
  if (error instanceof Error) {
    console.error('Place ranking snapshot error', {
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
