import { NextResponse } from 'next/server'
import { getNaverPlaceReviews } from '../server/review-service'
import { parseReviewSearchParams, ReviewRequestValidationError } from '../server/review-schema'

export const runtime = 'nodejs'
export const maxDuration = 20

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const params = parseReviewSearchParams(url.searchParams)
    const response = await getNaverPlaceReviews(params)

    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof ReviewRequestValidationError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: 400 })
    }

    if (error instanceof Error) {
      console.error('Naver place review API error', {
        message: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      { message: '네이버 플레이스 리뷰 조회 중 문제가 발생했습니다.' },
      { status: 500 },
    )
  }
}
