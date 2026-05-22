import { NextResponse } from 'next/server'
import { analyzeBlogPatterns } from '@/features/blog-posting/server/blog-posting'
import { toBlogPostingErrorResponse } from '@/features/blog-posting/server/errors'

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
    const { debug, message, status } = toBlogPostingErrorResponse(error)

    return NextResponse.json({ debug, message }, { status })
  }
}
