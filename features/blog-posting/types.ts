export type BlogSourceSummary = {
  rank: number
  title: string
  link: string
  description: string
  extracted: boolean
  textLength: number
}

export type BlogPatternReport = {
  summary: string
  frequentTerms: string[]
  customerNeeds: string[]
  contentPatterns: string[]
  storytellingPatterns: string[]
  humanTonePatterns: string[]
  aeoGeoPoints: string[]
  avoidPatterns: string[]
}

export type BlogInterviewOption = {
  id: string
  label: string
  description: string
}

export type BlogInterviewQuestion = {
  id: string
  question: string
  reason: string
  options: BlogInterviewOption[]
}

export type BlogInterviewAnswer = {
  questionId: string
  question: string
  answer: string
}

export type BlogPatternAnalysisResponse = {
  keyword: string
  sources: BlogSourceSummary[]
  report: BlogPatternReport
  questions: BlogInterviewQuestion[]
}

export type BlogDraftResponse = {
  directionSummary: string
  draft: string
}
