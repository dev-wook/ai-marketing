import { NextResponse } from 'next/server'
import {
  type BlogPostRequest,
  generateNaverBlogPost,
} from '@/features/blog-posting/server/naver-blog-post'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BlogPostRequest
    const result = await generateNaverBlogPost(body)

    if (!result.ok) {
      return NextResponse.json({ message: result.error.message }, { status: result.error.status })
    }

    return NextResponse.json(result.payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : '블로그 글 생성에 실패했습니다.'
    const status = message.includes('Gemini 사용량') ? 503 : 500

    return NextResponse.json({ message }, { status })
  }
}
