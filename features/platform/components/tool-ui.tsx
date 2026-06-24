'use client'

import type { ReactNode } from 'react'

type ToolLoadingPanelProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  step?: number
  steps?: string[]
  className?: string
}

export function ToolLoadingPanel({
  className = '',
  eyebrow = 'Loading',
  step = 0,
  steps = [],
  subtitle,
  title,
}: ToolLoadingPanelProps) {
  return (
    <section
      className={`rounded-md border border-cyan-300/25 bg-cyan-300/[0.07] p-5 text-left ${className}`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">
            {eyebrow}
          </p>
          <h3 className="mt-2 break-keep text-lg font-black text-cyan-100">{title}</h3>
          {subtitle ? (
            <p className="mt-1 break-keep text-sm font-bold leading-6 text-slate-400">
              {subtitle}
            </p>
          ) : null}
        </div>
        <span className="inline-flex w-fit shrink-0 rounded-md border border-cyan-300/25 px-4 py-2 text-sm font-black text-cyan-200">
          진행 중
        </span>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/3 animate-[aiva-loading_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-300 via-blue-300 to-fuchsia-400" />
      </div>
      {steps.length ? (
        <div className="mt-4 grid gap-2">
          {steps.map((label, index) => (
            <div
              key={label}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-black transition ${
                index === step ? 'bg-cyan-300/10 text-cyan-100' : 'text-slate-400'
              }`}
            >
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  index === step
                    ? 'bg-cyan-200 shadow-[0_0_14px_rgba(103,232,249,0.8)]'
                    : 'bg-white/20'
                }`}
              />
              <span className="min-w-0 break-keep">{label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

type ToolSimpleLoadingPanelProps = {
  className?: string
  message?: string
}

export function ToolSimpleLoadingPanel({
  className = '',
  message = '잠시만 기다려주세요.',
}: ToolSimpleLoadingPanelProps) {
  return (
    <section
      className={`grid min-h-36 place-items-center rounded-md border border-cyan-300/18 bg-white/[0.035] p-6 text-center ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="grid justify-items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-full border border-cyan-300/20 bg-cyan-300/[0.08]">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-100/20 border-t-cyan-100" />
        </span>
        <p className="break-keep text-sm font-black text-cyan-50">{message}</p>
      </div>
    </section>
  )
}

type RecentSearchListProps = {
  keywords: string[]
  onRemove: (keyword: string) => void
  onSelect: (keyword: string) => void
  className?: string
  disabled?: boolean
  label?: ReactNode
  max?: number
}

export function RecentSearchList({
  className = '',
  disabled = false,
  keywords,
  label = '최근 검색',
  max = 5,
  onRemove,
  onSelect,
}: RecentSearchListProps) {
  const visibleKeywords = keywords.slice(0, max)

  if (!visibleKeywords.length) {
    return null
  }

  return (
    <div className={`text-left ${className}`}>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200/70">
        {label}
      </p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
        {visibleKeywords.map((keyword) => (
          <div
            key={keyword}
            className="grid min-h-11 grid-cols-[minmax(0,1fr)_38px] overflow-hidden rounded-md border border-cyan-300/25 bg-cyan-300/[0.06]"
          >
            <button
              type="button"
              onClick={() => onSelect(keyword)}
              disabled={disabled}
              className="min-w-0 px-3 text-center text-sm font-black text-cyan-50 transition hover:bg-cyan-300/12 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="block truncate">{keyword}</span>
            </button>
            <button
              type="button"
              onClick={() => onRemove(keyword)}
              disabled={disabled}
              aria-label={`${keyword} 최근 검색어 삭제`}
              className="grid place-items-center border-l border-cyan-300/20 text-sm font-black text-cyan-100/80 transition hover:bg-cyan-300/14 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

type ToolErrorMessageProps = {
  message: string
  className?: string
  log?: string
}

export function ToolErrorMessage({ className = '', log = '', message }: ToolErrorMessageProps) {
  if (!message) {
    return null
  }

  return (
    <div
      className={`min-w-0 rounded-md border border-rose-300/25 bg-rose-400/10 text-left text-sm text-rose-100 ${className}`}
    >
      <p className="px-4 py-3 font-bold">{message}</p>
      {log ? (
        <details className="min-w-0 border-t border-rose-300/20">
          <summary className="cursor-pointer px-4 py-3 font-black text-rose-50 transition hover:bg-rose-400/10">
            실패 로그 더보기
          </summary>
          <pre className="max-h-72 max-w-full overflow-x-auto overflow-y-auto whitespace-pre-wrap break-all border-t border-rose-300/15 bg-black/25 px-4 py-3 font-mono text-xs leading-5 text-rose-50/85 [overflow-wrap:anywhere]">
            {log}
          </pre>
        </details>
      ) : null}
    </div>
  )
}
