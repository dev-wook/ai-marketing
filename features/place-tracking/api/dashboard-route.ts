import { NextResponse } from 'next/server'
import { createPlaceTrackingDashboard } from '../server/place-tracking-dashboard'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  try {
    return NextResponse.json(await createPlaceTrackingDashboard())
  } catch (error) {
    if (error instanceof Error) {
      console.error('Place tracking dashboard error', {
        message: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      {
        message: '플레이스 추적 현황 조회 중 문제가 발생했습니다.',
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
