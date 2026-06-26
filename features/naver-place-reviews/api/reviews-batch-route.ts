import { NextResponse } from 'next/server'
import { getNaverPlaceReviewsBatch } from '../server/review-service'
import { parseReviewBatchBody, ReviewRequestValidationError } from '../server/review-schema'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const params = parseReviewBatchBody(body)
    const items = await getNaverPlaceReviewsBatch(params)

    return NextResponse.json({
      items,
      warnings: Array.from(new Set(items.flatMap((item) => item.warnings))),
    })
  } catch (error) {
    if (error instanceof ReviewRequestValidationError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: 400 })
    }

    if (error instanceof Error) {
      console.error('Naver place review batch API error', {
        message: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      { message: '네이버 플레이스 리뷰 일괄 조회 중 문제가 발생했습니다.' },
      { status: 500 },
    )
  }
}
