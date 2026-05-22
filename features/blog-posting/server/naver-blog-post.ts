import { lasopBeautyProfile } from '@/lib/brand'
import { generateGeminiText } from '@/lib/gemini'

export type BlogPostRequest = {
  serviceName?: string
  keyBenefits?: string[]
}

type BlogPostGenerationResult =
  | {
      ok: true
      payload: {
        shopName: string
        topic: string
        modelName: string
        generatedContent: string
        sourcePrompt: ReturnType<typeof createNaverBlogPrompt>
      }
    }
  | {
      ok: false
      error: {
        status: number
        message: string
      }
    }

export async function generateNaverBlogPost(
  input: BlogPostRequest,
): Promise<BlogPostGenerationResult> {
  const serviceName = input.serviceName?.trim()

  if (!serviceName) {
    return {
      ok: false,
      error: {
        status: 400,
        message: '시술명을 입력해주세요.',
      },
    } satisfies BlogPostGenerationResult
  }

  const sourcePrompt = createNaverBlogPrompt({
    serviceName,
    keyBenefits: normalizeBenefits(input.keyBenefits),
  })
  const generatedContent = await generateGeminiText(toGeminiPromptText(sourcePrompt), true)

  return {
    ok: true,
    payload: {
      shopName: lasopBeautyProfile.shopName,
      topic: serviceName,
        modelName: process.env.GEMINI_TEXT_MODEL ?? 'gemini-3.5-flash',
      generatedContent,
      sourcePrompt,
    },
  } satisfies BlogPostGenerationResult
}

function createNaverBlogPrompt(input: { serviceName: string; keyBenefits: string[] }) {
  return {
    model: 'gemini',
    createdFor: lasopBeautyProfile.shopName,
    role: '네이버 플레이스와 블로그 검색 흐름을 이해하는 뷰티샵 AEO/GEO 콘텐츠 전략가',
    goal:
      '입력된 시술명을 기준으로 상위 블로그 콘텐츠의 검색 의도와 고객 질문을 조사한 뒤, 네이버 플레이스 신뢰 신호를 간접적으로 높이는 자연스럽고 유용한 블로그 포스팅 작성',
    input: {
      shopName: lasopBeautyProfile.shopName,
      shopLocation: lasopBeautyProfile.shopLocation,
      serviceName: input.serviceName,
      keyBenefits: input.keyBenefits,
    },
    brandContext: lasopBeautyProfile,
    searchGuidance: [
      'Google Search grounding을 사용해 입력 시술명과 관련된 최근 상위 블로그 콘텐츠 흐름을 여러 개 참고한다.',
      '검색 질의는 시술명, 고객 검색 의도, 후기/첫방문/유지기간/주의사항/가격대 등 실제 검색자가 궁금해하는 축으로 구성한다.',
      '검색 결과를 바탕으로 포스팅 주제, 핵심 키워드, 타깃 고객, 고객 고민, FAQ를 자동으로 정의한다.',
      '톤앤매너는 AEO/GEO에 적합하되 너무 딱딱하지 않게, 실제 샵 상담자가 블로그에서 차분히 설명하는 친근한 말투로 자동 설정한다.',
      '사용자가 입력한 강조 키워드/장점은 본문 중 라솝뷰티의 차별점과 CTA에 자연스럽게 녹인다.',
      '라솝뷰티가 노원에 위치한다는 정보는 브랜드 배경으로만 사용하고, 글 주제와 무관하면 지역 키워드를 억지로 반복하지 않는다.',
      '키워드 반복, 기계적인 문단 수 늘리기, 허위 후기, 순위 보장 표현을 피한다.',
      '이미지는 사용자가 별도로 넣을 예정이므로 이미지 삽입 안내, 이미지 캡션, 이미지 개수 제안은 작성하지 않는다.',
    ],
    requirements: [
      '검색 결과를 바탕으로 가장 적합한 포스팅 주제를 1개 자동 선정하고 본문에 반영한다.',
      '제목 5개를 먼저 제안한다.',
      '본문은 도입, 고객 질문에 대한 직접 답변, 고민 공감, 시술 설명, 선택 기준, 라솝뷰티의 차별점, 방문 전 안내, FAQ, 예약 유도 순서로 작성한다.',
      'AEO를 위해 고객이 실제로 검색할 법한 질문과 답변을 5개 이상 포함하고, 각 답변은 첫 문장에서 결론을 말한 뒤 설명한다.',
      'GEO를 위해 AI 검색이 이해하기 쉬운 명확한 브랜드 정보, 시술 정보, 고객 상황, 선택 기준, FAQ 구조를 반영한다.',
      '실제 상담자가 설명하는 듯한 문장으로 쓰되, 개인 경험을 꾸며내거나 허위 후기를 만들지 않는다.',
      '마지막에 네이버 블로그용 해시태그 12개를 제안한다.',
    ],
  }
}

function toGeminiPromptText(sourcePrompt: Record<string, unknown>) {
  return `
아래 JSON 지시사항을 정확히 따르세요.
작성 전에 Google Search grounding을 사용해 입력 시술명과 관련된 상위 블로그 콘텐츠 여러 개의 흐름을 참고하세요.
참고한 검색 결과는 문장 복사용이 아니라 포스팅 주제 선정, 검색 의도, 제목 패턴, FAQ 흐름, CTA 흐름 파악용입니다.
사용자는 시술명과 강조 키워드만 제공합니다. 주제, 타깃 고객, 톤앤매너, 본문 구조는 검색 결과와 AEO/GEO 기준에 맞게 자동 설계하세요.
말투는 너무 딱딱한 설명문이 아니라, 실제 샵 담당자가 네이버 블로그에 올리는 친근한 상담형 문체로 작성하세요.
네이버 플레이스 상위노출을 직접 보장한다고 쓰지 말고, 고객 질문을 해결하고 브랜드 신뢰도를 높이는 정보성 포스팅으로 작성하세요.
JSON, 마크다운 코드블록, sourcePrompt, 객체 형태의 응답을 절대 출력하지 마세요.
최종 출력은 제목 제안과 블로그 본문 텍스트만 포함하세요.

${JSON.stringify(sourcePrompt, null, 2)}
`
}

function normalizeBenefits(keyBenefits?: string[]) {
  return [...new Set((keyBenefits ?? []).map((benefit) => benefit.trim()).filter(Boolean))]
}
