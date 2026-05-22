import { NextResponse } from 'next/server'
import { reviseBlogDraft } from '@/features/blog-posting/server/blog-posting'
import { toBlogPostingErrorResponse } from '@/features/blog-posting/server/errors'
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
    const { debug, message, status } = toBlogPostingErrorResponse(error)

    return NextResponse.json({ debug, message }, { status })
  }
}
