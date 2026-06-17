import { NextResponse } from 'next/server'
import type { PlaceBookingStatusRequest } from '../types'
import { collectNaverBookingStatus } from '../server/naver-booking-status'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PlaceBookingStatusRequest
    const result = await collectNaverBookingStatus({
      bookingUrl: body.bookingUrl,
      bookingBusinessId: body.bookingBusinessId,
      date: body.date,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error) {
      console.error('Naver booking status error', {
        message: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      {
        message: '예약현황 조회 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
        debug:
          error instanceof Error
            ? {
                provider: 'naver-booking-graphql',
                message: error.message,
                createdAt: new Date().toISOString(),
              }
            : undefined,
      },
      { status: 500 },
    )
  }
}
