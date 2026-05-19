import { NextResponse } from 'next/server'
import { generateGeminiText } from '@/lib/gemini'

type KeywordRequest = {
  keyword?: string
}

type KeywordRecommendation = {
  rank: number
  keyword: string
  intent: string
  reason: string
}

type KeywordPayload = {
  keyword: string
  recommendations: KeywordRecommendation[]
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as KeywordRequest
    const keyword = body.keyword?.trim()

    if (!keyword) {
      return NextResponse.json({ message: '분석할 키워드를 입력해주세요.' }, { status: 400 })
    }

    const generatedText = await generateGeminiText(createKeywordPrompt(keyword), true)
    const payload = normalizeKeywordPayload(keyword, parseJsonPayload(generatedText))

    return NextResponse.json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : '키워드 분석에 실패했습니다.'
    const status = message.includes('Gemini 사용량') ? 503 : 500

    return NextResponse.json({ message }, { status })
  }
}

function createKeywordPrompt(keyword: string) {
  return `
당신은 AEO(Answer Engine Optimization), SEO, 검색 의도 분석에 능숙한 한국어 마케팅 키워드 전략가입니다.
Google Search grounding을 사용해 입력 키워드와 관련된 최근 검색 흐름, 질문 패턴, 상위 콘텐츠 주제를 참고하세요.

입력 키워드: ${keyword}

목표:
- 입력 키워드를 기준으로 AEO 상위 노출에 유리한 추천 키워드 10개를 선별하세요.
- 사용자가 실제로 검색창이나 AI 검색창에 입력할 법한 자연스러운 한국어 키워드를 우선하세요.
- 질문형, 비교형, 문제해결형, 구매검토형, 방법탐색형처럼 검색 의도를 구분하세요.
- 너무 광범위하거나 의미가 겹치는 키워드는 피하고, 콘텐츠 제목/FAQ/본문 소제목으로 활용하기 좋은 키워드를 선택하세요.
- 순위는 AEO 콘텐츠로 답변하기 좋은 정도와 상위 노출 가능성을 함께 고려해 정하세요.

반드시 아래 JSON 형식으로만 답하세요.
마크다운 코드블록, 설명 문장, 주석, trailing comma는 절대 포함하지 마세요.

{
  "keyword": "${keyword}",
  "recommendations": [
    {
      "rank": 1,
      "keyword": "추천 키워드",
      "intent": "검색 의도 유형",
      "reason": "추천 이유를 한국어 한 문장으로 작성"
    }
  ]
}
`
}

function parseJsonPayload(text: string) {
  const trimmed = text.trim()
  const withoutFence = trimmed
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()

  try {
    return JSON.parse(withoutFence) as Partial<KeywordPayload>
  } catch {
    const jsonMatch = withoutFence.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Gemini 응답을 키워드 결과로 변환하지 못했습니다.')
    }

    return JSON.parse(jsonMatch[0]) as Partial<KeywordPayload>
  }
}

function normalizeKeywordPayload(keyword: string, payload: Partial<KeywordPayload>): KeywordPayload {
  const recommendations = Array.isArray(payload.recommendations)
    ? payload.recommendations
        .map((item, index) => ({
          rank: toSafeRank(item?.rank, index),
          keyword: toSafeText(item?.keyword),
          intent: toSafeText(item?.intent),
          reason: toSafeText(item?.reason),
        }))
        .filter((item) => item.keyword && item.intent && item.reason)
        .slice(0, 10)
    : []

  if (recommendations.length === 0) {
    throw new Error('추천 키워드를 찾지 못했습니다. 다른 키워드로 다시 시도해주세요.')
  }

  return {
    keyword: toSafeText(payload.keyword) || keyword,
    recommendations: recommendations.map((item, index) => ({
      ...item,
      rank: index + 1,
    })),
  }
}

function toSafeRank(value: unknown, index: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : index + 1
}

function toSafeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}
