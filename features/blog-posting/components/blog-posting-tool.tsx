'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ToolErrorMessage, ToolLoadingPanel } from '@/features/platform/components/tool-ui'
import type {
  BlogDraftResponse,
  BlogInterviewAnswer,
  BlogPatternAnalysisResponse,
  BlogPatternReport,
  BlogSourceSummary,
} from '../types'

type StepKey = 'input' | 'interview' | 'draft'

type ApiErrorBody = {
  message?: string
  debug?: unknown
}

export function BlogPostingTool({
  autoAnalyzeKey = 0,
  initialKeyword = '',
  initialKeywordKey = 0,
  onAutoAnalyzeConsumed,
}: {
  autoAnalyzeKey?: number
  initialKeyword?: string
  initialKeywordKey?: number
  onAutoAnalyzeConsumed?: () => void
}) {
  const [keyword, setKeyword] = useState(initialKeyword)
  const [analysis, setAnalysis] = useState<BlogPatternAnalysisResponse | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [draftResult, setDraftResult] = useState<BlogDraftResponse | null>(null)
  const [feedback, setFeedback] = useState('')
  const [step, setStep] = useState<StepKey>('input')
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [errorLog, setErrorLog] = useState('')
  const lastAutoAnalyzeKeyRef = useRef(0)
  const keywordInputRef = useRef<HTMLInputElement | null>(null)
  const analysisResultRef = useRef<HTMLDivElement | null>(null)
  const draftResultRef = useRef<HTMLDivElement | null>(null)

  const interviewAnswers = useMemo(() => {
    if (!analysis) {
      return []
    }

    return analysis.questions
      .map((question) => ({
        questionId: question.id,
        question: question.question,
        answer: answers[question.id]?.trim() ?? '',
      }))
      .filter((answer) => answer.answer)
  }, [analysis, answers])

  const isInterviewComplete = Boolean(
    analysis && analysis.questions.every((question) => answers[question.id]?.trim()),
  )
  const canSubmitKeyword = useMemo(() => keyword.trim().length > 0 && !isLoading, [isLoading, keyword])
  const answeredCount = analysis
    ? analysis.questions.filter((question) => answers[question.id]?.trim()).length
    : 0

  const analyzeKeyword = async (requestedKeyword = keyword) => {
    const nextKeyword = requestedKeyword.trim()

    if (!nextKeyword) {
      setErrorMessage('분석할 키워드를 입력해주세요.')
      setErrorLog('')
      return
    }

    setIsLoading(true)
    setErrorMessage('')
    setErrorLog('')
    setAnalysis(null)
    setDraftResult(null)
    setAnswers({})
    setStep('input')
    setCurrentQuestionIndex(0)

    try {
      const response = await fetch('/api/blog-posting/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: nextKeyword }),
      })
      const body = (await response.json()) as BlogPatternAnalysisResponse | ApiErrorBody

      if (!response.ok) {
        const errorBody = body as ApiErrorBody

        setErrorLog(toReadableErrorLog(errorBody.debug))
        throw new Error(errorBody.message ?? '블로그 글쓰기 준비에 실패했습니다.')
      }

      setAnalysis(body as BlogPatternAnalysisResponse)
      setCurrentQuestionIndex(0)
      setStep('interview')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '블로그 글쓰기 준비에 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!initialKeyword) {
      return
    }

    setKeyword(initialKeyword)
    setErrorMessage('')
    setErrorLog('')

    if (autoAnalyzeKey <= 0 || lastAutoAnalyzeKeyRef.current === autoAnalyzeKey) {
      return
    }

    lastAutoAnalyzeKeyRef.current = autoAnalyzeKey
    onAutoAnalyzeConsumed?.()
    void analyzeKeyword(initialKeyword)
  }, [autoAnalyzeKey, initialKeyword, initialKeywordKey, onAutoAnalyzeConsumed])

  useEffect(() => {
    if (isLoading || !analysis || draftResult) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      analysisResultRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [analysis, draftResult, isLoading])

  useEffect(() => {
    if (isLoading || !draftResult) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      draftResultRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [draftResult, isLoading])

  const submitKeyword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void analyzeKeyword()
  }

  const clearKeywordInput = () => {
    setKeyword('')
    setErrorMessage('')
    setErrorLog('')
    keywordInputRef.current?.focus()
  }

  const generateDraft = async () => {
    if (!analysis || !isInterviewComplete) {
      setErrorMessage('인터뷰 답변을 모두 완료해주세요.')
      setErrorLog('')
      return
    }

    setIsLoading(true)
    setErrorMessage('')
    setErrorLog('')

    try {
      const response = await fetch('/api/blog-posting/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: analysis.keyword,
          report: analysis.report,
          answers: interviewAnswers,
        }),
      })
      const body = (await response.json()) as BlogDraftResponse | ApiErrorBody

      if (!response.ok) {
        const errorBody = body as ApiErrorBody

        setErrorLog(toReadableErrorLog(errorBody.debug))
        throw new Error(errorBody.message ?? '블로그 초안 생성에 실패했습니다.')
      }

      setDraftResult(body as BlogDraftResponse)
      setStep('draft')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '블로그 초안 생성에 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const reviseDraft = async () => {
    if (!analysis || !draftResult) {
      return
    }

    if (!feedback.trim()) {
      setErrorMessage('수정 요청 내용을 입력해주세요.')
      setErrorLog('')
      return
    }

    setIsLoading(true)
    setErrorMessage('')
    setErrorLog('')

    try {
      const response = await fetch('/api/blog-posting/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: analysis.keyword,
          report: analysis.report,
          answers: interviewAnswers,
          draft: draftResult.draft,
          feedback,
        }),
      })
      const body = (await response.json()) as BlogDraftResponse | ApiErrorBody

      if (!response.ok) {
        const errorBody = body as ApiErrorBody

        setErrorLog(toReadableErrorLog(errorBody.debug))
        throw new Error(errorBody.message ?? '블로그 초안 수정에 실패했습니다.')
      }

      setDraftResult(body as BlogDraftResponse)
      setFeedback('')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '블로그 초안 수정에 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl content-start pt-4 pb-6 md:content-center md:py-6">
      <section className="text-center">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200/80">
          Blog Draft
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-normal md:mt-3 md:text-5xl">
          AI 블로그 원고를 작성하세요
        </h2>
        <p className="mx-auto mt-3 max-w-6xl text-sm font-semibold leading-6 text-slate-300 md:mt-4 md:text-base md:leading-7">
          키워드를 입력하면 필요한 질문을 단계별로 드리고, 답변에 맞춘 블로그 원고를
          만들어드립니다.
        </p>

        <form
          onSubmit={submitKeyword}
          className="mx-auto mt-4 max-w-3xl rounded-md border border-white/10 bg-white/[0.06] p-3 shadow-[0_22px_50px_rgba(0,0,0,0.24)] backdrop-blur-xl md:mt-8"
        >
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <input
                ref={keywordInputRef}
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value)
                  setErrorMessage('')
                  setErrorLog('')
                }}
                placeholder="예: 노원 속눈썹펌"
                className="min-h-14 w-full rounded-md border border-white/10 bg-[#090d18] px-4 pr-12 text-lg font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10"
                disabled={isLoading}
              />
              {keyword ? (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={clearKeywordInput}
                  aria-label="검색어 전체 삭제"
                  className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-xl font-black leading-none text-slate-500 transition hover:bg-white/[0.08] hover:text-cyan-100"
                >
                  ×
                </button>
              ) : null}
            </div>
            <button
              type="submit"
              disabled={!canSubmitKeyword}
              className="min-h-14 rounded-md bg-white px-6 text-base font-black text-[#070a12] shadow-[0_0_26px_rgba(34,211,238,0.2)] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isLoading && step === 'input' ? '확인 중' : '글쓰기 시작'}
            </button>
          </div>
        </form>

        {isLoading && step === 'input' ? (
          <ToolLoadingPanel
            className="mx-auto mt-7 w-full max-w-3xl shadow-[0_16px_36px_rgba(0,0,0,0.18)]"
            eyebrow="Preparing"
            title="상위 블로그 흐름을 참고하고 있습니다"
            subtitle="주제 후보와 원고 방향을 정리하고 맞춤 질문을 준비합니다."
          />
        ) : null}

        <ToolErrorMessage className="mx-auto max-w-3xl" log={errorLog} message={errorMessage} />
      </section>

      {analysis ? (
        <div ref={analysisResultRef} className="scroll-mt-28">
          <PatternReportPanel report={analysis.report} sources={analysis.sources} />
          <InterviewPanel
            answers={answers}
            currentQuestionIndex={currentQuestionIndex}
            disabled={isLoading}
            questions={analysis.questions}
            onAnswerChange={(questionId, answer) =>
              setAnswers((current) => ({ ...current, [questionId]: answer }))
            }
            onNext={() =>
              setCurrentQuestionIndex((current) =>
                Math.min(current + 1, analysis.questions.length - 1),
              )
            }
            onPrevious={() => setCurrentQuestionIndex((current) => Math.max(current - 1, 0))}
          />

          <section className="mt-5 rounded-md border border-white/10 bg-[#080c17]/80 p-4 md:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">
                  Content Direction
                </p>
                <h3 className="mt-2 text-xl font-black md:text-2xl">콘텐츠 방향 요약</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
                  답변 {answeredCount}/{analysis.questions.length}개가 반영되었습니다. 모든 질문이
                  완료되면 이 방향으로 원고를 생성할 수 있습니다.
                </p>
                <div className="mt-3 grid gap-2 text-sm font-semibold leading-6 text-slate-300">
                  {interviewAnswers.length > 0 ? (
                    interviewAnswers.map((answer) => (
                      <p key={answer.questionId}>
                        <span className="text-slate-500">{answer.question}</span>
                        <br />
                        {answer.answer}
                      </p>
                    ))
                  ) : (
                    <p>첫 질문에 답하면 콘텐츠 방향이 이곳에 정리됩니다.</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={generateDraft}
                disabled={!isInterviewComplete || isLoading}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-cyan-100 px-5 text-sm font-black text-[#070a12] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 lg:min-w-48"
              >
                {isLoading && step === 'interview' ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#070a12]/25 border-t-[#070a12]" />
                    원고 생성 중
                  </>
                ) : (
                  '이 방향으로 원고 만들기'
                )}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {draftResult ? (
        <div ref={draftResultRef} className="scroll-mt-28">
          <DraftPanel
            directionSummary={draftResult.directionSummary}
            draft={draftResult.draft}
            feedback={feedback}
            isLoading={isLoading}
            onFeedbackChange={setFeedback}
            onRevise={reviseDraft}
          />
        </div>
      ) : null}
    </div>
  )
}

function PatternReportPanel({
  report,
  sources,
}: {
  report: BlogPatternReport
  sources: BlogSourceSummary[]
}) {
  const primaryStory = report.storytellingPatterns.slice(0, 2)
  const primaryNeeds = report.customerNeeds.slice(0, 2)
  const primaryTerms = report.frequentTerms.slice(0, 6)

  return (
    <section className="mt-8 rounded-md border border-white/10 bg-[#080c17]/80 p-4 md:mt-10 md:p-5">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">
            Direction
          </p>
          <h3 className="mt-2 text-xl font-black md:text-2xl">원고 방향 분석</h3>
        </div>
        <span className="w-fit rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-black text-slate-300">
          분석 완료
        </span>
      </div>

      <div className="mt-4 rounded-md border border-cyan-300/15 bg-cyan-300/[0.045] p-4">
        <p className="text-sm font-semibold leading-7 text-slate-200">{report.summary}</p>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <InsightCard
          title="추천 스토리 흐름"
          description="상위 글에서 반복된 설득 흐름입니다."
          items={primaryStory}
        />
        <InsightCard
          title="독자 고민"
          description="원고에서 먼저 풀어줘야 할 불안 요소입니다."
          items={primaryNeeds}
        />
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[11px] font-black tracking-[0.08em] text-cyan-200/75">
            활용 키워드
          </p>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
            원고에 자연스럽게 섞을 핵심 표현입니다.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {primaryTerms.length > 0 ? (
              primaryTerms.map((term) => (
                <span
                  key={term}
                  className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-3 py-1 text-xs font-black text-cyan-100"
                >
                  {term}
                </span>
              ))
            ) : (
              <span className="text-sm font-semibold text-slate-400">-</span>
            )}
          </div>
        </div>
      </div>

      <details className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-4">
        <summary className="cursor-pointer text-sm font-black text-cyan-100">
          세부 분석 보기
        </summary>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ReportList title="핵심 용어" items={report.frequentTerms} />
          <ReportList title="고객 니즈" items={report.customerNeeds} />
          <ReportList title="스토리 흐름" items={report.storytellingPatterns} />
          <ReportList title="사람 글 패턴" items={report.humanTonePatterns} />
          <ReportList title="글 구성" items={report.contentPatterns} />
          <ReportList title="반영 포인트" items={report.aeoGeoPoints} />
          <ReportList title="피해야 할 표현" items={report.avoidPatterns} />
        </div>
      </details>

      <details className="mt-3 rounded-md border border-white/10 bg-white/[0.035] p-4">
        <summary className="cursor-pointer text-sm font-black text-cyan-100">
          참고한 상위 블로그 보기
        </summary>
        <div className="mt-4 grid gap-2">
          {sources.map((source) => (
            <a
              key={`${source.rank}-${source.link}`}
              href={source.link}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-white/10 bg-[#070a12]/70 px-3 py-3 text-sm font-semibold text-slate-300 transition hover:border-cyan-300/35 hover:bg-white/[0.06] hover:text-white"
            >
              <span className="mr-2 font-black text-cyan-200">{source.rank}</span>
              {source.title}
              <span className="ml-2 text-xs text-slate-500">
                {source.extracted ? '본문 분석' : '요약 분석'}
              </span>
            </a>
          ))}
        </div>
      </details>
    </section>
  )
}

function InsightCard({
  description,
  items,
  title,
}: {
  description: string
  items: string[]
  title: string
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <p className="text-[11px] font-black tracking-[0.08em] text-cyan-200/75">{title}</p>
      <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{description}</p>
      <div className="mt-3 grid gap-2">
        {items.length > 0 ? (
          items.map((item) => (
            <p key={item} className="text-sm font-semibold leading-6 text-slate-300">
              {item}
            </p>
          ))
        ) : (
          <p className="text-sm font-semibold text-slate-400">-</p>
        )}
      </div>
    </div>
  )
}

function ReportList({ items, title }: { items: string[]; title: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
      <p className="text-[11px] font-black tracking-[0.08em] text-cyan-200/75">
        {title}
      </p>
      <ul className="mt-3 grid gap-2 text-sm font-semibold leading-6 text-slate-300">
        {items.length > 0 ? items.slice(0, 5).map((item) => <li key={item}>{item}</li>) : <li>-</li>}
      </ul>
    </div>
  )
}

function InterviewPanel({
  answers,
  currentQuestionIndex,
  disabled,
  onAnswerChange,
  onNext,
  onPrevious,
  questions,
}: {
  answers: Record<string, string>
  currentQuestionIndex: number
  disabled: boolean
  onAnswerChange: (questionId: string, answer: string) => void
  onNext: () => void
  onPrevious: () => void
  questions: BlogPatternAnalysisResponse['questions']
}) {
  const question = questions[currentQuestionIndex]
  const isFirstQuestion = currentQuestionIndex === 0
  const isLastQuestion = currentQuestionIndex === questions.length - 1
  const selectedAnswer = answers[question.id] ?? ''
  const isOptionAnswer = question.options.some((option) => option.label === selectedAnswer)

  return (
    <section className="mt-5 rounded-md border border-white/10 bg-[#080c17]/80 p-4 md:p-5">
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">
            Interview {currentQuestionIndex + 1} / {questions.length}
          </p>
          <h3 className="mt-2 text-lg font-black leading-7 md:text-xl">{question.question}</h3>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-400 md:text-sm md:leading-6">
            {question.reason}
          </p>
        </div>
        <div className="grid gap-3 md:min-w-56">
          <div className="flex items-center gap-1">
            {questions.map((item, index) => (
              <span
                key={item.id}
                className={`h-1.5 flex-1 rounded-full ${
                  index <= currentQuestionIndex ? 'bg-cyan-300' : 'bg-white/10'
                }`}
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onPrevious}
              disabled={disabled || isFirstQuestion}
              className="min-h-10 rounded-md border border-white/10 px-4 text-sm font-black text-slate-200 transition hover:border-cyan-300/35 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
            >
              이전
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={disabled || isLastQuestion || !selectedAnswer.trim()}
              className="min-h-10 rounded-md bg-white px-4 text-sm font-black text-[#070a12] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              다음
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:mt-5 md:grid-cols-2 md:gap-3 xl:grid-cols-4">
        {question.options.map((option) => {
          const isActive = selectedAnswer === option.label

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onAnswerChange(question.id, option.label)}
              disabled={disabled}
              className={`rounded-md border p-3 text-left transition md:p-4 ${
                isActive
                  ? 'border-cyan-300/60 bg-cyan-300/12'
                  : 'border-white/10 bg-white/[0.04] hover:border-cyan-300/35 hover:bg-white/[0.07]'
              }`}
            >
              <span className="text-sm font-black text-white">{option.label}</span>
              <span className="mt-2 block text-xs font-semibold leading-5 text-slate-400 md:text-sm md:leading-6">
                {option.description}
              </span>
            </button>
          )
        })}
      </div>

      <input
        value={isOptionAnswer ? '' : selectedAnswer}
        onChange={(event) => onAnswerChange(question.id, event.target.value)}
        placeholder="직접 입력"
        className="mt-3 min-h-11 w-full rounded-md border border-white/10 bg-[#090d18] px-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10 md:min-h-12 md:px-4"
        disabled={disabled}
      />
    </section>
  )
}

function DraftPanel({
  directionSummary,
  draft,
  feedback,
  isLoading,
  onFeedbackChange,
  onRevise,
}: {
  directionSummary: string
  draft: string
  feedback: string
  isLoading: boolean
  onFeedbackChange: (value: string) => void
  onRevise: () => void
}) {
  const [copyMessage, setCopyMessage] = useState('')
  const htmlDraft = toHtmlDraft(draft)

  const copyDraft = async () => {
    const html = sanitizeHtml(htmlDraft)
    const text = toPlainText(html)

    try {
      if ('ClipboardItem' in window) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(text)
      }

      setCopyMessage('원고가 복사되었습니다. 네이버 블로그 에디터에 붙여넣어주세요.')
      window.setTimeout(() => setCopyMessage(''), 2500)
    } catch {
      setCopyMessage('복사에 실패했습니다. 원고 영역을 선택해서 직접 복사해주세요.')
      window.setTimeout(() => setCopyMessage(''), 3000)
    }
  }

  return (
    <section className="mt-8 rounded-md border border-white/10 bg-white/[0.07] p-4 shadow-[0_22px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl md:mt-10 md:p-5">
      <div className="border-b border-white/10 pb-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">
          Draft
        </p>
        <h3 className="mt-2 text-xl font-black md:text-2xl">블로그 원고</h3>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">{directionSummary}</p>
      </div>

      <div className="mt-5 overflow-hidden rounded-md border border-white/10 bg-[#070a12]">
        <div className="flex flex-col gap-3 border-b border-white/10 bg-white/[0.035] p-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-black text-white">네이버 블로그 붙여넣기용 원고</p>
            <p className="mt-1 text-sm font-semibold text-slate-400">
              아래 원고를 복사해서 네이버 블로그 에디터에 붙여넣으세요.
            </p>
          </div>
          <button
            type="button"
            onClick={copyDraft}
            className="min-h-11 rounded-md bg-white px-5 text-sm font-black text-[#070a12] transition hover:bg-cyan-100"
          >
            원고 복사
          </button>
        </div>
        {copyMessage ? (
          <div className="border-b border-white/10 bg-cyan-300/10 px-5 py-3 text-sm font-bold text-cyan-100">
            {copyMessage}
          </div>
        ) : null}
        <DraftPreview html={htmlDraft} />
      </div>

      <div className="mt-5 grid gap-3">
        <textarea
          value={feedback}
          onChange={(event) => onFeedbackChange(event.target.value)}
          placeholder="수정 요청을 입력하세요. 예: 더 자연스럽게, 예약 유도는 줄이고 첫 방문 고객 안심 내용을 늘려줘."
          className="min-h-28 rounded-md border border-white/10 bg-[#090d18] p-4 text-sm font-bold leading-6 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10"
          disabled={isLoading}
        />
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm font-semibold text-slate-400">
            직접 수정 대신 피드백으로 다시 요청하면 원고를 새로 다듬어드립니다.
          </p>
          <div className="flex flex-col gap-3 md:flex-row">
            <button
              type="button"
              onClick={onRevise}
              disabled={isLoading}
              className="min-h-12 rounded-md border border-white/10 px-5 text-sm font-black text-slate-100 transition hover:border-cyan-300/40 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45 md:min-w-36"
            >
              {isLoading ? '수정 중' : '피드백 반영'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function DraftPreview({ html }: { html: string }) {
  return (
    <div
      className="blog-draft-editor min-h-[420px] overflow-auto p-4 text-[#141923] md:min-h-[520px] md:p-8"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  )
}

function toReadableErrorLog(value: unknown) {
  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function toHtmlDraft(draft: string) {
  const trimmed = draft.trim()

  if (/<(article|h1|h2|h3|p|ul|ol|li|section|strong|em)\b/i.test(trimmed)) {
    return sanitizeHtml(trimmed)
  }

  return textToHtml(trimmed)
}

function textToHtml(text: string) {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  return `<article>${blocks
    .map((block) => {
      const escaped = escapeHtml(block)
      const lines = escaped.split(/\n/).map((line) => line.trim()).filter(Boolean)

      if (/^(최종 추천 제목|도입|고객 고민|핵심 설명|선택 기준|FAQ|마무리|해시태그|CTA)/.test(block)) {
        return `<h2>${escaped}</h2>`
      }

      if (lines.every((line) => /^(\d+\.|-|\*)\s+/.test(line))) {
        return `<ul>${lines.map((line) => `<li>${line.replace(/^(\d+\.|-|\*)\s+/, '')}</li>`).join('')}</ul>`
      }

      return `<p>${escaped.replace(/\n/g, '<br>')}</p>`
    })
    .join('')}</article>`
}

function toPlainText(html: string) {
  return sanitizeHtml(html)
    .replace(/<\/(h1|h2|h3|p|li|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function sanitizeHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/\sstyle="[^"]*"/gi, '')
    .replace(/\sstyle='[^']*'/gi, '')
    .trim()
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
