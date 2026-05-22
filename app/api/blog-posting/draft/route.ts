import { NextResponse } from 'next/server'
import { generateBlogDraft } from '@/features/blog-posting/server/blog-posting'
import type {
  BlogInterviewAnswer,
  BlogPatternReport,
} from '@/features/blog-posting/types'

type BlogDraftRequest = {
  keyword?: string
  report?: BlogPatternReport
  answers?: BlogInterviewAnswer[]
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BlogDraftRequest
    const payload = await generateBlogDraft({
      keyword: body.keyword ?? '',
      report: body.report ?? {
        summary: '',
        frequentTerms: [],
        customerNeeds: [],
        contentPatterns: [],
        aeoGeoPoints: [],
        avoidPatterns: [],
      },
      answers: body.answers ?? [],
    })

    return NextResponse.json(payload)
  } catch (error) {
    if (error instanceof Error) {
      console.error('Blog draft generation error', {
        message: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : '블로그 초안 생성에 실패했습니다.' },
      { status: 500 },
    )
  }
}
