import { generateGeminiText } from '@/lib/gemini'
import { searchNaverBlog } from '@/lib/naver'
import type {
  BlogDraftResponse,
  BlogInterviewAnswer,
  BlogInterviewQuestion,
  BlogPatternAnalysisResponse,
  BlogPatternReport,
} from '../types'
import { crawlNaverBlogPosts } from './crawler'
import { parseJsonPayload, toSafeText, toStringArray } from './json'
import {
  createBlogDraftPrompt,
  createBlogPatternPrompt,
  createBlogRevisionPrompt,
  type BlogPatternPromptPayload,
} from './prompts'

export async function analyzeBlogPatterns(keyword: string): Promise<BlogPatternAnalysisResponse> {
  const safeKeyword = keyword.trim()

  if (!safeKeyword) {
    throw new Error('분석할 키워드를 입력해주세요.')
  }

  const searchPayload = await searchNaverBlog({
    query: safeKeyword,
    display: 30,
    start: 1,
    sort: 'sim',
  })
  const posts = await crawlNaverBlogPosts(searchPayload.items, 10)
  const generatedText = await generateGeminiText(
    createBlogPatternPrompt(safeKeyword, posts, searchPayload.items),
    { responseMimeType: 'application/json' },
  )
  const payload = parseJsonPayload<BlogPatternPromptPayload>(generatedText)

  return {
    keyword: safeKeyword,
    sources: posts.map(({ text: _text, ...source }) => source),
    report: normalizeReport(payload.report),
    questions: normalizeQuestions(payload.questions),
  }
}

export async function generateBlogDraft(input: {
  keyword: string
  report: BlogPatternReport
  answers: BlogInterviewAnswer[]
}): Promise<BlogDraftResponse> {
  validateDraftInput(input)

  const generatedText = await generateGeminiText(createBlogDraftPrompt(input), {
    responseMimeType: 'application/json',
  })

  return normalizeDraftPayload(parseJsonPayload<Partial<BlogDraftResponse>>(generatedText))
}

export async function reviseBlogDraft(input: {
  keyword: string
  report: BlogPatternReport
  answers: BlogInterviewAnswer[]
  draft: string
  feedback: string
}): Promise<BlogDraftResponse> {
  validateDraftInput(input)

  if (!input.draft.trim()) {
    throw new Error('수정할 초안이 없습니다.')
  }

  if (!input.feedback.trim()) {
    throw new Error('수정 요청 내용을 입력해주세요.')
  }

  const generatedText = await generateGeminiText(createBlogRevisionPrompt(input), {
    responseMimeType: 'application/json',
  })

  return normalizeDraftPayload(parseJsonPayload<Partial<BlogDraftResponse>>(generatedText))
}

function normalizeReport(report?: Partial<BlogPatternReport>): BlogPatternReport {
  return {
    summary:
      toSafeText(report?.summary) ||
      '상위 블로그의 제목, 요약, 본문 일부를 기준으로 콘텐츠 패턴을 분석했습니다.',
    frequentTerms: toStringArray(report?.frequentTerms).slice(0, 10),
    customerNeeds: toStringArray(report?.customerNeeds).slice(0, 8),
    contentPatterns: toStringArray(report?.contentPatterns).slice(0, 8),
    storytellingPatterns: toStringArray(report?.storytellingPatterns).slice(0, 8),
    humanTonePatterns: toStringArray(report?.humanTonePatterns).slice(0, 8),
    aeoGeoPoints: toStringArray(report?.aeoGeoPoints).slice(0, 8),
    avoidPatterns: toStringArray(report?.avoidPatterns).slice(0, 6),
  }
}

function normalizeQuestions(
  questions?: Array<Partial<BlogInterviewQuestion>>,
): BlogInterviewQuestion[] {
  const normalized = Array.isArray(questions)
    ? questions
        .map((question, index) => ({
          id: toSafeText(question.id) || `q${index + 1}`,
          question: toSafeText(question.question),
          reason: toSafeText(question.reason),
          options: normalizeOptions(question.options, index),
        }))
        .filter(
          (question) =>
            question.question && question.options.length >= 3 && question.options.length <= 4,
        )
        .slice(0, 10)
    : []

  if (normalized.length < 5) {
    throw new Error('인터뷰 질문을 생성하지 못했습니다. 다시 시도해주세요.')
  }

  return ensureTopicQuestionFirst(normalized)
}

function ensureTopicQuestionFirst(questions: BlogInterviewQuestion[]) {
  const topicIndex = questions.findIndex(
    (question) =>
      question.id === 'topic' ||
      question.question.includes('주제') ||
      question.options.some((option) => option.label.includes('주제')),
  )

  if (topicIndex <= 0) {
    return questions
  }

  const topicQuestion = questions[topicIndex]

  return [topicQuestion, ...questions.slice(0, topicIndex), ...questions.slice(topicIndex + 1)]
}

function normalizeOptions(
  options: BlogInterviewQuestion['options'] | undefined,
  questionIndex: number,
) {
  return Array.isArray(options)
    ? options
        .map((option, index) => ({
          id: toSafeText(option.id) || `q${questionIndex + 1}-${index + 1}`,
          label: toSafeText(option.label),
          description: toSafeText(option.description),
        }))
        .filter((option) => option.label)
        .slice(0, 4)
    : []
}

function validateDraftInput(input: {
  keyword: string
  report: BlogPatternReport
  answers: BlogInterviewAnswer[]
}) {
  if (!input.keyword.trim()) {
    throw new Error('키워드 정보가 없습니다.')
  }

  if (!input.report.summary.trim()) {
    throw new Error('패턴 분석 정보가 없습니다.')
  }

  if (!Array.isArray(input.answers) || input.answers.length === 0) {
    throw new Error('인터뷰 답변을 입력해주세요.')
  }
}

function normalizeDraftPayload(payload: Partial<BlogDraftResponse>): BlogDraftResponse {
  const directionSummary = toSafeText(payload.directionSummary)
  const draft = toSafeText(payload.draft)

  if (!draft) {
    throw new Error('블로그 초안을 생성하지 못했습니다. 다시 시도해주세요.')
  }

  return {
    directionSummary: directionSummary || '인터뷰 답변을 바탕으로 블로그 초안을 구성했습니다.',
    draft,
  }
}
