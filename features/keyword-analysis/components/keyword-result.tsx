import type { KeywordResponse } from '../types'

export function KeywordResult({
  onStartBlogDraft,
  result,
}: {
  onStartBlogDraft: (keyword: string) => void
  result: KeywordResponse
}) {
  return (
    <section className="mx-auto mt-9 w-full max-w-6xl rounded-md border border-white/10 bg-white/[0.07] p-5 text-left shadow-[0_22px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">Result</p>
          <h3 className="mt-2 text-2xl font-black">AI 검색 노출 키워드 분석 결과</h3>
        </div>
        <span className="w-fit rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-black text-slate-300">
          기준 키워드: {result.keyword}
        </span>
      </div>

      <div className="mt-5 grid gap-3">
        {result.recommendations.map((item) => (
          <article
            key={`${item.rank}-${item.keyword}`}
            className="rounded-md border border-white/10 bg-[#080c17]/85 p-4"
          >
            <div className="grid gap-4 lg:grid-cols-[56px_minmax(180px,0.8fr)_minmax(120px,0.45fr)_minmax(0,1fr)_150px] lg:items-start">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-gradient-to-br from-cyan-300 to-fuchsia-500 text-sm font-black text-[#070a12]">
                {item.rank}
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                  Keyword
                </p>
                <h4 className="mt-1 text-lg font-black text-white">{item.keyword}</h4>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                  Intent
                </p>
                <p className="mt-1 font-black text-cyan-100">{item.intent}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Why</p>
                <p className="mt-1 font-semibold leading-7 text-slate-300">{item.reason}</p>
              </div>
              <div className="rounded-md border border-cyan-300/20 bg-cyan-300/8 p-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-200/75">
                  AI Score
                </p>
                <div className="mt-1 flex items-end gap-1">
                  <span className="text-3xl font-black text-cyan-100">{item.aiScore}</span>
                  <span className="pb-1 text-xs font-black text-slate-500">/ 100</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-fuchsia-400"
                    style={{ width: `${item.aiScore}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_180px]">
              <SignalPanel label="Search" accent="text-blue-200/80" text={item.searchSignal} />
              <SignalPanel label="Blog" accent="text-cyan-200/80" text={item.blogSignal} />
              <SignalPanel label="Final" accent="text-white/80" text={item.finalJudgement} />
              <div className="rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] p-3">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-200/80">
                  Next
                </p>
                <button
                  type="button"
                  onClick={() => onStartBlogDraft(item.keyword)}
                  className="mt-3 min-h-11 w-full rounded-md bg-cyan-100 px-4 text-sm font-black text-[#070a12] transition hover:bg-white"
                >
                  AI 블로그 원고 작성
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function SignalPanel({
  accent,
  label,
  text,
}: {
  accent: string
  label: string
  text: string
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.045] p-3">
      <p className={`text-[11px] font-black uppercase tracking-[0.16em] ${accent}`}>{label}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-200/90">{text}</p>
    </div>
  )
}
