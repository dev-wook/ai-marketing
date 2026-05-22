import { NextResponse } from 'next/server'
import { toKeywordErrorResponse } from '@/features/keyword-analysis/server/errors'
import { recommendKeywords } from '@/features/keyword-analysis/server/recommend-keywords'

type KeywordRequest = {
  keyword?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as KeywordRequest
    const keyword = body.keyword?.trim()

    if (!keyword) {
      return NextResponse.json({ message: '분석할 키워드를 입력해주세요.' }, { status: 400 })
    }

    const payload = await recommendKeywords(keyword)

    return NextResponse.json(payload)
  } catch (error) {
    const { debug, message, status } = toKeywordErrorResponse(error)

    return NextResponse.json({ debug, message }, { status })
  }
}
