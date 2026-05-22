'use client'

import { useMemo, useState, type FormEvent } from 'react'
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
}

export function BlogPostingTool() {
  const [keyword, setKeyword] = useState('')
  const [analysis, setAnalysis] = useState<BlogPatternAnalysisResponse | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [draftResult, setDraftResult] = useState<BlogDraftResponse | null>(null)
  const [feedback, setFeedback] = useState('')
  const [step, setStep] = useState<StepKey>('input')
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

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
  const answeredCount = analysis
    ? analysis.questions.filter((question) => answers[question.id]?.trim()).length
    : 0

  const analyzeKeyword = async () => {
    const nextKeyword = keyword.trim()

    if (!nextKeyword) {
      setErrorMessage('분석할 키워드를 입력해주세요.')
      return
    }

    setIsLoading(true)
    setErrorMessage('')
    setAnalysis(null)
    setDraftResult(null)
    setAnswers({})
    setCurrentQuestionIndex(0)

    try {
      const response = await fetch('/api/blog-posting/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: nextKeyword }),
      })
      const body = (await response.json()) as BlogPatternAnalysisResponse | ApiErrorBody

      if (!response.ok) {
        throw new Error((body as ApiErrorBody).message ?? '블로그 글쓰기 준비에 실패했습니다.')
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

  const submitKeyword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void analyzeKeyword()
  }

  const generateDraft = async () => {
    if (!analysis || !isInterviewComplete) {
      setErrorMessage('인터뷰 답변을 모두 완료해주세요.')
      return
    }

    setIsLoading(true)
    setErrorMessage('')

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
        throw new Error((body as ApiErrorBody).message ?? '블로그 초안 생성에 실패했습니다.')
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
      return
    }

    setIsLoading(true)
    setErrorMessage('')

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
        throw new Error((body as ApiErrorBody).message ?? '블로그 초안 수정에 실패했습니다.')
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
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl content-start gap-6 py-6">
      <section className="text-center">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200/80">
          Blog Draft
        </p>
        <h2 className="mt-3 text-3xl font-black tracking-normal md:text-5xl">
          AI 블로그 원고를 작성하세요
        </h2>
        <p className="mx-auto mt-4 max-w-4xl text-base font-semibold leading-7 text-slate-300">
          키워드를 입력하면 필요한 질문을 단계별로 드리고, 답변에 맞춘 블로그 원고를
          만들어드립니다.
        </p>
      </section>

      <StepProgress step={step} />

      <section className="rounded-md border border-white/10 bg-white/[0.06] p-4 shadow-[0_22px_50px_rgba(0,0,0,0.24)] backdrop-blur-xl">
        <form onSubmit={submitKeyword} className="flex flex-col gap-3 md:flex-row">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="예: 노원 속눈썹펌"
            className="min-h-14 flex-1 rounded-md border border-white/10 bg-[#090d18] px-4 text-lg font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="min-h-14 rounded-md bg-white px-6 text-base font-black text-[#070a12] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isLoading && step === 'input' ? '확인 중' : '글쓰기 시작'}
          </button>
        </form>
        {isLoading && step === 'input' ? (
          <LoadingProgress
            title="관련 콘텐츠를 확인하고 있습니다."
            description="상위 블로그 30개를 참고해 원고 방향을 정리하고 맞춤 질문을 준비합니다."
          />
        ) : null}
      </section>

      {errorMessage ? (
        <div className="rounded-md border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
          {errorMessage}
        </div>
      ) : null}

      {analysis ? (
        <>
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

          <section className="rounded-md border border-white/10 bg-[#080c17]/80 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">
                  Content Direction
                </p>
                <h3 className="mt-2 text-2xl font-black">콘텐츠 방향 요약</h3>
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
                className="min-h-12 rounded-md bg-cyan-100 px-5 text-sm font-black text-[#070a12] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isLoading && step === 'interview' ? '원고 생성 중' : '이 방향으로 원고 만들기'}
              </button>
            </div>
          </section>
        </>
      ) : null}

      {draftResult ? (
        <DraftPanel
          directionSummary={draftResult.directionSummary}
          draft={draftResult.draft}
          feedback={feedback}
          isLoading={isLoading}
          onDraftChange={(draft) =>
            setDraftResult((current) => (current ? { ...current, draft } : current))
          }
          onFeedbackChange={setFeedback}
          onRevise={reviseDraft}
        />
      ) : null}
    </div>
  )
}

function LoadingProgress({ description, title }: { description: string; title: string }) {
  return (
    <div className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-black text-cyan-100">{title}</p>
          <p className="mt-1 text-sm font-semibold text-slate-400">{description}</p>
        </div>
        <span className="text-xs font-black tracking-[0.12em] text-cyan-200/70">
          준비 중
        </span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-2/5 animate-[keyword-progress_1.25s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-300 via-blue-300 to-fuchsia-400" />
      </div>
    </div>
  )
}

function StepProgress({ step }: { step: StepKey }) {
  const steps: Array<{ key: StepKey; label: string }> = [
    { key: 'input', label: '키워드' },
    { key: 'interview', label: '인터뷰' },
    { key: 'draft', label: '원고' },
  ]
  const currentIndex = steps.findIndex((item) => item.key === step)

  return (
    <div className="grid grid-cols-3 gap-2">
      {steps.map((item, index) => (
        <div
          key={item.key}
          className={`rounded-md border px-3 py-3 text-center text-xs font-black uppercase tracking-[0.14em] ${
            index <= currentIndex
              ? 'border-cyan-300/35 bg-cyan-300/10 text-cyan-100'
              : 'border-white/10 bg-white/[0.035] text-slate-500'
          }`}
        >
          {item.label}
        </div>
      ))}
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
  return (
    <section className="rounded-md border border-white/10 bg-[#080c17]/80 p-5">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">
            Reference
          </p>
          <h3 className="mt-2 text-2xl font-black">참고 콘텐츠 요약</h3>
        </div>
        <span className="w-fit rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-black text-slate-300">
          원문 분석 {sources.length}개
        </span>
      </div>
      <p className="mt-4 text-sm font-semibold leading-7 text-slate-300">{report.summary}</p>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <ReportList title="핵심 용어" items={report.frequentTerms} />
        <ReportList title="고객 니즈" items={report.customerNeeds} />
        <ReportList title="글 구성" items={report.contentPatterns} />
        <ReportList title="반영 포인트" items={report.aeoGeoPoints} />
        <ReportList title="피해야 할 표현" items={report.avoidPatterns} />
      </div>
      <details className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-4">
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
                {source.extracted ? `본문 ${source.textLength.toLocaleString()}자 분석` : '요약 분석'}
              </span>
            </a>
          ))}
        </div>
      </details>
    </section>
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
    <section className="rounded-md border border-white/10 bg-[#080c17]/80 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">
            Interview {currentQuestionIndex + 1} / {questions.length}
          </p>
          <h3 className="mt-2 text-xl font-black">{question.question}</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">{question.reason}</p>
        </div>
        <div className="flex min-w-32 items-center gap-1">
          {questions.map((item, index) => (
            <span
              key={item.id}
              className={`h-1.5 flex-1 rounded-full ${
                index <= currentQuestionIndex ? 'bg-cyan-300' : 'bg-white/10'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {question.options.map((option) => {
          const isActive = selectedAnswer === option.label

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onAnswerChange(question.id, option.label)}
              disabled={disabled}
              className={`rounded-md border p-4 text-left transition ${
                isActive
                  ? 'border-cyan-300/60 bg-cyan-300/12'
                  : 'border-white/10 bg-white/[0.04] hover:border-cyan-300/35 hover:bg-white/[0.07]'
              }`}
            >
              <span className="text-sm font-black text-white">{option.label}</span>
              <span className="mt-2 block text-sm font-semibold leading-6 text-slate-400">
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
        className="mt-3 min-h-12 w-full rounded-md border border-white/10 bg-[#090d18] px-4 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10"
        disabled={disabled}
      />

      <div className="mt-5 flex flex-col gap-3 md:flex-row md:justify-between">
        <button
          type="button"
          onClick={onPrevious}
          disabled={disabled || isFirstQuestion}
          className="min-h-11 rounded-md border border-white/10 px-5 text-sm font-black text-slate-200 transition hover:border-cyan-300/35 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
        >
          이전
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={disabled || isLastQuestion || !selectedAnswer.trim()}
          className="min-h-11 rounded-md bg-white px-5 text-sm font-black text-[#070a12] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          다음 질문
        </button>
      </div>
    </section>
  )
}

function DraftPanel({
  directionSummary,
  draft,
  feedback,
  isLoading,
  onDraftChange,
  onFeedbackChange,
  onRevise,
}: {
  directionSummary: string
  draft: string
  feedback: string
  isLoading: boolean
  onDraftChange: (value: string) => void
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
    <section className="rounded-md border border-white/10 bg-white/[0.07] p-5 shadow-[0_22px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl">
      <div className="border-b border-white/10 pb-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">
          Draft
        </p>
        <h3 className="mt-2 text-2xl font-black">블로그 원고</h3>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">{directionSummary}</p>
      </div>

      <div className="mt-5 overflow-hidden rounded-md border border-white/10 bg-[#070a12]">
        <div className="flex flex-col gap-3 border-b border-white/10 bg-white/[0.035] p-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-black text-white">네이버 블로그 붙여넣기용 원고</p>
            <p className="mt-1 text-sm font-semibold text-slate-400">
              아래 원고를 수정한 뒤 복사해서 네이버 블로그 에디터에 붙여넣으세요.
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
        <RichDraftEditor html={htmlDraft} onDraftChange={onDraftChange} />
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
            추가 수정이 필요하면 피드백을 입력하고, 완료되면 원고를 복사해 네이버 블로그에
            붙여넣으세요.
          </p>
          <div className="flex flex-col gap-3 md:flex-row">
            <button
              type="button"
              onClick={onRevise}
              disabled={isLoading}
              className="min-h-12 rounded-md border border-white/10 px-5 text-sm font-black text-slate-100 transition hover:border-cyan-300/40 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isLoading ? '수정 중' : '피드백 반영'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function RichDraftEditor({
  html,
  onDraftChange,
}: {
  html: string
  onDraftChange: (value: string) => void
}) {
  return (
    <div
      contentEditable
      suppressContentEditableWarning
      onBlur={(event) => onDraftChange(sanitizeHtml(event.currentTarget.innerHTML))}
      className="blog-draft-editor min-h-[520px] overflow-auto bg-white p-7 text-[#141923] outline-none"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  )
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
