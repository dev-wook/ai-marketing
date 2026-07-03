'use client'

import { useEffect, useState } from 'react'
import type { AiImageUsageResponse } from '../types'

export function AiImageUsageCard() {
  const [usage, setUsage] = useState<AiImageUsageResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadUsage() {
      try {
        const response = await fetch('/api/ai-image-generation/usage', {
          cache: 'no-store',
          signal: controller.signal,
        })
        const body = (await response.json()) as Partial<AiImageUsageResponse> & {
          message?: string
        }

        if (!response.ok) {
          throw new Error(body.message || '사용량을 불러오지 못했습니다.')
        }

        setUsage(body as AiImageUsageResponse)
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === 'AbortError') {
          return
        }
        setError(
          loadError instanceof Error ? loadError.message : '사용량을 불러오지 못했습니다.',
        )
      }
    }

    void loadUsage()
    return () => controller.abort()
  }, [])

  const estimatedCostKrw = usage?.estimatedCostKrw ?? 0
  const monthlyBudgetKrw = usage?.monthlyBudgetKrw ?? 15_000
  const usageRate = usage?.usageRate ?? 0

  return (
    <section className="rounded-md border border-cyan-300/20 bg-[#0b1727]/82 p-5 shadow-[0_0_34px_rgba(34,211,238,0.06)] md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/75">
            AI Image Usage
          </p>
          <h2 className="mt-2 text-xl font-black text-white">AI 이미지 사용량</h2>
          <p className="mt-1 text-xs font-bold text-slate-400">
            {usage?.periodLabel ?? '이번 달'} 생성 성공 기준
          </p>
        </div>
        <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">
          월 예산 {formatKrw(monthlyBudgetKrw)}
        </span>
      </div>

      {error ? (
        <p className="mt-5 rounded-md border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-100">
          {error}
        </p>
      ) : (
        <>
          {usage && !usage.trackingAvailable ? (
            <p className="mt-5 rounded-md border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-xs font-bold leading-5 text-amber-100">
              사용량 저장소 연결 전입니다. 실제 청구액은 Google Cloud에서 확인해주세요.
            </p>
          ) : null}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <UsageMetric label="생성 완료" value={`${usage?.generationCount ?? 0}회`} />
            <UsageMetric label="예상 사용액" value={formatKrw(estimatedCostKrw)} />
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between text-xs font-black text-slate-300">
              <span>예산 대비 예상 사용량</span>
              <span>{usageRate.toFixed(1)}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-cyan-300 via-blue-300 to-fuchsia-400 transition-[width]"
                style={{ width: `${Math.max(usageRate > 0 ? 1 : 0, usageRate)}%` }}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-slate-400">
            <span>기본 모델 {usage?.modelUsage[0]?.count ?? 0}회</span>
            <span>대체 모델 {usage?.modelUsage[1]?.count ?? 0}회</span>
          </div>
        </>
      )}

      <div className="mt-5 border-t border-white/10 pt-4">
        <p className="break-keep text-xs font-semibold leading-5 text-slate-500">
          예상 사용액은 앱의 생성 이력과 현재 단가 기준입니다. Google 청구액은 반영 지연,
          환율, 입력 이미지 처리량에 따라 다를 수 있습니다.
        </p>
        {usage?.billingConsoleUrl ? (
          <a
            href={usage.billingConsoleUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex min-h-10 items-center rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 text-xs font-black text-cyan-100 transition hover:border-cyan-200/50 hover:bg-cyan-300/15"
          >
            Google Cloud 실제 청구 내역 보기
          </a>
        ) : null}
      </div>
    </section>
  )
}

function UsageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-black text-white">{value}</p>
    </div>
  )
}

function formatKrw(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`
}
