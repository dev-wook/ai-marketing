import { NextResponse } from 'next/server'
import { reviseBlogDraft } from '@/features/blog-posting/server/blog-posting'
import type {
  BlogInterviewAnswer,
  BlogPatternReport,
} from '@/features/blog-posting/types'

type BlogRevisionRequest = {
  keyword?: string
  report?: BlogPatternReport
  answers?: BlogInterviewAnswer[]
  draft?: string
  feedback?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BlogRevisionRequest
    const payload = await reviseBlogDraft({
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
      draft: body.draft ?? '',
      feedback: body.feedback ?? '',
    })

    return NextResponse.json(payload)
  } catch (error) {
    if (error instanceof Error) {
      console.error('Blog draft revision error', {
        message: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : '블로그 초안 수정에 실패했습니다.' },
      { status: 500 },
    )
  }
}
