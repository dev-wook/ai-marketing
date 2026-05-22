export type KeywordRecommendation = {
  rank: number
  keyword: string
  intent: string
  reason: string
  aiScore: number
  blogSignal: string
  searchSignal: string
  finalJudgement: string
}

export type KeywordResponse = {
  keyword: string
  recommendations: KeywordRecommendation[]
}

export type KeywordPayload = KeywordResponse
