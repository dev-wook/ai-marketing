'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  RecentSearchList,
  ToolErrorMessage,
  ToolLoadingPanel,
} from '@/features/platform/components/tool-ui'
import {
  deleteRecentKeyword,
  readKeywordCooldownRemaining,
  readRecentKeywords,
  saveKeywordCooldownStart,
  saveRecentKeyword,
} from '../storage'
import type { KeywordResponse } from '../types'
import { KeywordResult } from './keyword-result'

const loadingSteps = [
  '검색 의도를 분석하고 있어요',
  'AI가 중요하게 보는 주제어를 추출하고 있어요',
  '상위 콘텐츠의 반복 신호를 검토하고 있어요',
  '노출에 도움이 되는 키워드 10개를 선별하고 있어요',
]

type KeywordErrorBody = {
  message?: string
  debug?: unknown
}

export function KeywordTool({
  onStartBlogDraft,
}: {
  onStartBlogDraft: (keyword: string) => void
}) {
  const [keyword, setKeyword] = useState('')
  const [recentKeywords, setRecentKeywords] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [errorLog, setErrorLog] = useState('')
  const [result, setResult] = useState<KeywordResponse | null>(null)
  const [loadingStep, setLoadingStep] = useState(0)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)
  const keywordInputRef = useRef<HTMLInputElement | null>(null)
  const resultRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setRecentKeywords(readRecentKeywords())
    setCooldownRemaining(readKeywordCooldownRemaining())
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCooldownRemaining(readKeywordCooldownRemaining())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!isLoading) {
      setLoadingStep(0)
      return
    }

    const timer = window.setInterval(() => {
      setLoadingStep((current) => (current + 1) % loadingSteps.length)
    }, 1300)

    return () => window.clearInterval(timer)
  }, [isLoading])

  useEffect(() => {
    if (isLoading || !result) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [isLoading, result])

  const canSubmit = useMemo(
    () => keyword.trim().length > 0 && !isLoading && cooldownRemaining === 0,
    [cooldownRemaining, isLoading, keyword],
  )

  const removeRecentKeyword = (keywordToRemove: string) => {
    setRecentKeywords(deleteRecentKeyword(keywordToRemove))
  }

  const clearKeywordInput = () => {
    setKeyword('')
    setErrorMessage('')
    setErrorLog('')
    keywordInputRef.current?.focus()
  }

  const analyzeKeyword = async (nextKeyword: string) => {
    const trimmedKeyword = nextKeyword.trim()

    if (!trimmedKeyword) {
      setErrorMessage('분석할 키워드를 입력해주세요.')
      setErrorLog('')
      return
    }

    if (cooldownRemaining > 0) {
      setErrorMessage(`AI 분석은 ${cooldownRemaining}초 후 다시 이용할 수 있습니다.`)
      setErrorLog('')
      return
    }

    setIsLoading(true)
    setErrorMessage('')
    setErrorLog('')
    setResult(null)

    try {
      const response = await fetch('/api/keywords/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keyword: trimmedKeyword }),
      })
      const body = (await response.json()) as KeywordErrorBody | KeywordResponse

      if (!response.ok) {
        const errorBody = body as KeywordErrorBody

        setErrorLog(toReadableErrorLog(errorBody.debug))
        throw new Error(errorBody.message ?? '키워드 분석에 실패했습니다.')
      }

      setResult(body as KeywordResponse)
      setRecentKeywords(saveRecentKeyword(trimmedKeyword))
      setCooldownRemaining(saveKeywordCooldownStart())
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '키워드 분석에 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const submitKeyword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await analyzeKeyword(keyword)
  }

  const applyRecentKeyword = async (nextKeyword: string) => {
    setKeyword(nextKeyword)
    setErrorMessage('')
    setErrorLog('')
    await analyzeKeyword(nextKeyword)
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl content-center py-6">
      <section className="text-center">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200/80">
          AI Search Keyword Analysis
        </p>
        <h2 className="mt-3 text-3xl font-black tracking-normal md:text-5xl">
          AI 검색 노출에 중요한 키워드를 분석하세요
        </h2>
        <p className="mx-auto mt-4 max-w-6xl text-base font-semibold leading-7 text-slate-300 xl:whitespace-nowrap">
          입력한 키워드를 기준으로 AI가 중요하게 판단할 만한 주제어, 검색 의도, 블로그 활용
          포인트를 분석합니다.
        </p>

        <form
          onSubmit={submitKeyword}
          className="mx-auto mt-8 max-w-3xl rounded-md border border-white/10 bg-white/[0.06] p-3 shadow-[0_22px_50px_rgba(0,0,0,0.24)] backdrop-blur-xl"
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
              disabled={!canSubmit}
              className="min-h-14 rounded-md bg-white px-6 text-base font-black text-[#070a12] shadow-[0_0_26px_rgba(34,211,238,0.2)] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isLoading
                ? '분석 중'
                : cooldownRemaining > 0
                  ? `${cooldownRemaining}초 후 가능`
                  : result
                    ? '다시 분석하기'
                    : '키워드 분석하기'}
            </button>
          </div>
        </form>

        {cooldownRemaining > 0 && !isLoading ? (
          <p className="mx-auto mt-3 max-w-3xl rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] px-4 py-3 text-sm font-bold text-cyan-100">
            {result
              ? `AI 분석이 완료되었습니다. 다음 분석은 ${cooldownRemaining}초 후 다시 이용할 수 있습니다.`
              : `AI 분석은 ${cooldownRemaining}초 후 다시 이용할 수 있습니다.`}
          </p>
        ) : null}

        <RecentSearchList
          className="mx-auto mt-4 max-w-3xl"
          disabled={isLoading || cooldownRemaining > 0}
          keywords={recentKeywords}
          onRemove={removeRecentKeyword}
          onSelect={applyRecentKeyword}
        />

        <ToolErrorMessage
          className="mx-auto mt-5 max-w-3xl"
          log={errorLog}
          message={errorMessage}
        />
      </section>

      {isLoading ? (
        <ToolLoadingPanel
          className="mx-auto mt-9 w-full max-w-3xl shadow-[0_22px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl"
          eyebrow="Analyzing"
          step={loadingStep}
          steps={loadingSteps}
          subtitle="검색 의도, 상위 콘텐츠 신호, 추천 키워드를 순서대로 정리합니다."
          title="AI 검색 노출 키워드를 분석하는 중입니다"
        />
      ) : null}
      {!isLoading && result ? (
        <div ref={resultRef} className="scroll-mt-28">
          <KeywordResult onStartBlogDraft={onStartBlogDraft} result={result} />
        </div>
      ) : null}
    </div>
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
