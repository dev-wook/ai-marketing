import { NextResponse } from 'next/server'
import { analyzeBlogPatterns } from '@/features/blog-posting/server/blog-posting'

type BlogPatternAnalyzeRequest = {
  keyword?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BlogPatternAnalyzeRequest
    const keyword = body.keyword?.trim()

    if (!keyword) {
      return NextResponse.json({ message: '분석할 키워드를 입력해주세요.' }, { status: 400 })
    }

    const payload = await analyzeBlogPatterns(keyword)

    return NextResponse.json(payload)
  } catch (error) {
    if (error instanceof Error) {
      console.error('Blog pattern analysis error', {
        message: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      { message: '블로그 패턴 분석 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 500 },
    )
  }
}
