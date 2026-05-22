import { generateGeminiText } from '@/lib/gemini'
import { searchNaverBlog, toNaverBlogSearchContext } from '@/lib/naver'
import type { KeywordPayload } from '../types'
import { createKeywordPrompt } from './prompt'

export async function recommendKeywords(keyword: string) {
  const naverSearchContext = await getNaverBlogContext(keyword)
  const generatedText = await generateGeminiText(createKeywordPrompt(keyword, naverSearchContext))

  return normalizeKeywordPayload(keyword, parseJsonPayload(generatedText))
}

async function getNaverBlogContext(keyword: string) {
  try {
    const payload = await searchNaverBlog({
      query: keyword,
      display: 20,
      start: 1,
      sort: 'sim',
    })

    return toNaverBlogSearchContext(payload, 20)
  } catch (error) {
    if (error instanceof Error) {
      console.error('Naver blog context skipped', {
        message: error.message,
      })
    }

    return '네이버 블로그 검색 참고 데이터: 현재 조회하지 못했습니다.'
  }
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
          aiScore: toSafeScore(item?.aiScore),
          blogSignal:
            toSafeText(item?.blogSignal) || '네이버 콘텐츠에서 관련 표현과 사용자 관심사를 확인했습니다.',
          searchSignal:
            toSafeText(item?.searchSignal) || '검색 의도와 AI 검색 연관성을 기준으로 평가했습니다.',
          finalJudgement:
            toSafeText(item?.finalJudgement) || '여러 검색 신호를 종합해 우선순위를 산정했습니다.',
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

function toSafeScore(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 70
  }

  return Math.min(Math.max(Math.round(value), 1), 100)
}
