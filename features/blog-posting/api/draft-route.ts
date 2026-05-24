import { NextResponse } from 'next/server'
import { generateBlogDraft } from '@/features/blog-posting/server/blog-posting'
import { toBlogPostingErrorResponse } from '@/features/blog-posting/server/errors'
import type {
  BlogInterviewAnswer,
  BlogPatternReport,
} from '@/features/blog-posting/types'

type BlogDraftRequest = {
  keyword?: string
  report?: BlogPatternReport
  answers?: BlogInterviewAnswer[]
}

const emptyBlogPatternReport: BlogPatternReport = {
  summary: '',
  frequentTerms: [],
  customerNeeds: [],
  contentPatterns: [],
  storytellingPatterns: [],
  humanTonePatterns: [],
  aeoGeoPoints: [],
  avoidPatterns: [],
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BlogDraftRequest
    const payload = await generateBlogDraft({
      keyword: body.keyword ?? '',
      report: body.report ?? emptyBlogPatternReport,
      answers: body.answers ?? [],
    })

    return NextResponse.json(payload)
  } catch (error) {
    const { debug, message, status } = toBlogPostingErrorResponse(error)

    return NextResponse.json({ debug, message }, { status })
  }
}
