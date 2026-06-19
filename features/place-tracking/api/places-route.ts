import { NextResponse } from 'next/server'
import { previewNaverPlaceUrl } from '../server/place-url'
import {
  deleteTrackedPlace,
  listTrackedPlaces,
  updateTrackedPlace,
  upsertTrackedPlace,
} from '../server/place-tracking-repository'

type PlaceRequest = {
  action?: 'preview' | 'create' | 'update' | 'delete'
  placeUrl?: string
  naverPlaceId?: string
  placeName?: string
  id?: number
}

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET() {
  try {
    return NextResponse.json({ places: await listTrackedPlaces() })
  } catch (error) {
    return createErrorResponse(error, '플레이스 목록 조회 중 문제가 발생했습니다.')
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PlaceRequest
    const action = body.action ?? 'preview'

    if (action === 'preview') {
      return NextResponse.json({ preview: await previewNaverPlaceUrl(body.placeUrl ?? '') })
    }

    if (action === 'create') {
      const preview =
        body.naverPlaceId && body.placeName && body.placeUrl
          ? {
              naverPlaceId: body.naverPlaceId,
              placeName: body.placeName,
              placeUrl: body.placeUrl,
            }
          : await previewNaverPlaceUrl(body.placeUrl ?? '')

      return NextResponse.json({
        place: await upsertTrackedPlace(preview),
      })
    }

    if (action === 'update') {
      await updateTrackedPlace({
        id: Number(body.id),
        placeName: (body.placeName ?? '').trim(),
      })

      return NextResponse.json({ ok: true })
    }

    if (action === 'delete') {
      await deleteTrackedPlace(Number(body.id))

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ message: '지원하지 않는 요청입니다.' }, { status: 400 })
  } catch (error) {
    return createErrorResponse(error, '플레이스 처리 중 문제가 발생했습니다.')
  }
}

function createErrorResponse(error: unknown, message: string) {
  if (error instanceof Error) {
    console.error('Place tracking place error', {
      message: error.message,
      stack: error.stack,
    })
  }

  return NextResponse.json(
    {
      message: error instanceof Error ? error.message : message,
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
