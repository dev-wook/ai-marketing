'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
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

export function KeywordTool() {
  const [keyword, setKeyword] = useState('')
  const [recentKeywords, setRecentKeywords] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [errorLog, setErrorLog] = useState('')
  const [result, setResult] = useState<KeywordResponse | null>(null)
  const [loadingStep, setLoadingStep] = useState(0)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)

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

  const canSubmit = useMemo(
    () => keyword.trim().length > 0 && !isLoading && cooldownRemaining === 0,
    [cooldownRemaining, isLoading, keyword],
  )

  const removeRecentKeyword = (keywordToRemove: string) => {
    setRecentKeywords(deleteRecentKeyword(keywordToRemove))
  }

  const submitKeyword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextKeyword = keyword.trim()
    if (!nextKeyword) {
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
        body: JSON.stringify({ keyword: nextKeyword }),
      })
      const body = (await response.json()) as KeywordErrorBody | KeywordResponse

      if (!response.ok) {
        const errorBody = body as KeywordErrorBody

        setErrorLog(toReadableErrorLog(errorBody.debug))
        throw new Error(errorBody.message ?? '키워드 분석에 실패했습니다.')
      }

      setResult(body as KeywordResponse)
      setRecentKeywords(saveRecentKeyword(nextKeyword))
      setCooldownRemaining(saveKeywordCooldownStart())
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '키워드 분석에 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
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
          입력한 키워드를 기준으로 AI가 중요하게 판단할 만한 주제어, 검색 의도, 블로그와
          플레이스 활용 포인트를 분석합니다.
        </p>

        <form
          onSubmit={submitKeyword}
          className="mx-auto mt-8 max-w-3xl rounded-md border border-white/10 bg-white/[0.06] p-3 shadow-[0_22px_50px_rgba(0,0,0,0.24)] backdrop-blur-xl"
        >
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value)
                setErrorMessage('')
                setErrorLog('')
              }}
              placeholder="예: 노원 속눈썹펌"
              className="min-h-14 flex-1 rounded-md border border-white/10 bg-[#090d18] px-4 text-lg font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10"
              disabled={isLoading}
            />
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
            AI 분석이 완료되었습니다. 다음 분석은 {cooldownRemaining}초 후 다시 이용할 수 있습니다.
          </p>
        ) : null}

        {recentKeywords.length > 0 ? (
          <div className="mx-auto mt-5 grid max-w-3xl gap-3 text-left">
            <KeywordChipGroup
              label="최근 검색"
              keywords={recentKeywords}
              disabled={isLoading}
              onSelect={(nextKeyword) => {
                setKeyword(nextKeyword)
                setErrorMessage('')
                setErrorLog('')
              }}
              onRemove={removeRecentKeyword}
            />
          </div>
        ) : null}

        {errorMessage ? (
          <KeywordErrorMessage message={errorMessage} log={errorLog} />
        ) : null}
      </section>

      {isLoading ? <KeywordLoadingPanel step={loadingStep} /> : null}
      {!isLoading && result ? <KeywordResult result={result} /> : null}
    </div>
  )
}

function KeywordErrorMessage({ log, message }: { log: string; message: string }) {
  return (
    <div className="mx-auto mt-5 max-w-3xl rounded-md border border-red-400/35 bg-red-500/10 text-left text-sm text-red-100">
      <p className="px-4 py-3 font-bold">{message}</p>
      {log ? (
        <details className="border-t border-red-300/20">
          <summary className="cursor-pointer px-4 py-3 font-black text-red-50 transition hover:bg-red-400/10">
            실패 로그 더보기
          </summary>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-red-300/15 bg-black/25 px-4 py-3 font-mono text-xs leading-5 text-red-50/85">
            {log}
          </pre>
        </details>
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

function KeywordChipGroup({
  disabled,
  keywords,
  label,
  onRemove,
  onSelect,
}: {
  disabled: boolean
  keywords: string[]
  label: string
  onRemove?: (keyword: string) => void
  onSelect: (keyword: string) => void
}) {
  return (
    <div className="rounded-md border border-cyan-300/20 bg-cyan-300/[0.05] px-3 py-3">
      <div className="grid gap-2">
        <span className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200/80">
          {label}
        </span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {keywords.map((item) => (
            <span
              key={`${label}-${item}`}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_36px] overflow-hidden rounded-md border border-cyan-300/25 bg-cyan-300/10 text-sm font-black text-cyan-50"
            >
              <button
                type="button"
                onClick={() => onSelect(item)}
                disabled={disabled}
                className="min-w-0 truncate px-3 py-2 text-center transition hover:bg-cyan-300/12 disabled:opacity-50"
              >
                {item}
              </button>
              <button
                type="button"
                onClick={() => onRemove?.(item)}
                disabled={disabled}
                aria-label={`${item} 최근 검색 삭제`}
                className="grid w-8 place-items-center border-l border-cyan-300/20 text-cyan-100/70 transition hover:bg-cyan-300/15 hover:text-white disabled:opacity-50"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function KeywordLoadingPanel({ step }: { step: number }) {
  return (
    <section className="mx-auto mt-9 w-full max-w-3xl rounded-md border border-white/10 bg-white/[0.07] p-5 text-left shadow-[0_22px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">
            Analyzing
          </p>
          <h3 className="mt-2 text-2xl font-black">AI 검색 노출 키워드를 분석하는 중입니다</h3>
        </div>
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-cyan-300/30 bg-cyan-300/10">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-200/30 border-t-cyan-200" />
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-full bg-white/10">
        <div className="h-3 w-2/3 animate-[keyword-progress_1.7s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-300 via-blue-500 to-fuchsia-400" />
      </div>

      <div className="mt-5 grid gap-2">
        {loadingSteps.map((label, index) => (
          <div
            key={label}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-black transition ${
              index === step ? 'bg-cyan-300/10 text-cyan-100' : 'text-slate-400'
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                index === step ? 'bg-cyan-200 shadow-[0_0_14px_rgba(103,232,249,0.8)]' : 'bg-white/20'
              }`}
            />
            {label}
          </div>
        ))}
      </div>
    </section>
  )
}
