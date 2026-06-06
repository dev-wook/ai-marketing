export function HomeView({
  onOpenBlogPosting,
  onOpenKeyword,
  onOpenPlaceRanking,
}: {
  onOpenBlogPosting: () => void
  onOpenKeyword: () => void
  onOpenPlaceRanking: () => void
}) {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] w-full min-w-0 max-w-full content-center gap-8 overflow-x-hidden">
      <section className="min-w-0 max-w-[calc(100vw-2.5rem)] md:max-w-5xl">
        <p className="text-sm font-black uppercase tracking-[0.22em] text-cyan-200/80">
          AI Marketing Platform
        </p>
        <h2 className="mt-4 max-w-full break-words text-3xl font-black leading-tight [overflow-wrap:anywhere] md:break-keep md:text-6xl xl:text-[4.2rem]">
          브랜드 성장을 위한 AI 마케팅 플랫폼
        </h2>
        <p className="mt-5 max-w-full break-words text-base font-semibold leading-8 text-slate-300 [overflow-wrap:anywhere] md:max-w-2xl md:break-keep">
          AIVA는 검색 의도 분석부터 콘텐츠 제작까지 마케팅 실무에 필요한 AI 도구를
          한곳에서 제공합니다.
        </p>
      </section>

      <section className="grid w-full min-w-0 max-w-[calc(100vw-2.5rem)] gap-4 md:max-w-none xl:grid-cols-4">
        <button
          type="button"
          onClick={onOpenPlaceRanking}
          className="group min-w-0 rounded-md border border-cyan-300/35 bg-cyan-300/10 p-5 text-left shadow-[0_0_34px_rgba(34,211,238,0.16)] transition hover:-translate-y-0.5 hover:border-cyan-200/70 hover:bg-cyan-300/14"
        >
          <span className="text-xs font-black tracking-[0.12em] text-cyan-200">
            서비스 오픈(Beta)
          </span>
          <h3 className="mt-3 break-words text-2xl font-black [overflow-wrap:anywhere] md:break-keep">네이버 플레이스 순위 조회</h3>
          <p className="mt-3 min-h-16 break-words text-sm font-semibold leading-7 text-slate-300 [overflow-wrap:anywhere] md:break-keep">
            키워드별 플레이스 노출 순서와 주요 정보를 실시간으로 확인합니다.
          </p>
          <span className="mt-5 inline-flex rounded-md bg-white px-4 py-3 text-sm font-black text-[#090b14] transition group-hover:bg-cyan-100">
            시작하기
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenKeyword}
          className="group min-w-0 rounded-md border border-cyan-300/35 bg-cyan-300/10 p-5 text-left shadow-[0_0_34px_rgba(34,211,238,0.16)] transition hover:-translate-y-0.5 hover:border-cyan-200/70 hover:bg-cyan-300/14"
        >
          <span className="text-xs font-black tracking-[0.12em] text-cyan-200">
            서비스 오픈(Beta)
          </span>
          <h3 className="mt-3 break-words text-2xl font-black [overflow-wrap:anywhere] md:break-keep">AI 검색 노출 키워드 분석</h3>
          <p className="mt-3 min-h-16 break-words text-sm font-semibold leading-7 text-slate-300 [overflow-wrap:anywhere] md:break-keep">
            검색 의도와 상위 블로그 흐름에 반영할 핵심 키워드와 활용 포인트를 분석합니다.
          </p>
          <span className="mt-5 inline-flex rounded-md bg-white px-4 py-3 text-sm font-black text-[#090b14] transition group-hover:bg-cyan-100">
            시작하기
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenBlogPosting}
          className="group min-w-0 rounded-md border border-cyan-300/35 bg-cyan-300/10 p-5 text-left shadow-[0_0_34px_rgba(34,211,238,0.16)] transition hover:-translate-y-0.5 hover:border-cyan-200/70 hover:bg-cyan-300/14"
        >
          <span className="text-xs font-black tracking-[0.12em] text-cyan-200">
            서비스 오픈(Beta)
          </span>
          <h3 className="mt-3 break-words text-2xl font-black [overflow-wrap:anywhere] md:break-keep">AI 블로그 원고 작성</h3>
          <p className="mt-3 min-h-16 break-words text-sm font-semibold leading-7 text-slate-300 [overflow-wrap:anywhere] md:break-keep">
            키워드와 맞춤형 질문 답변을 바탕으로 AI 최적화 블로그 원고를 작성합니다.
          </p>
          <span className="mt-5 inline-flex rounded-md bg-white px-4 py-3 text-sm font-black text-[#090b14] transition group-hover:bg-cyan-100">
            시작하기
          </span>
        </button>
        <PlannedFeature
          title="AI 모델 이미지 생성"
          description="브랜드, 상품, 캠페인에 어울리는 AI 모델 이미지를 제작합니다."
        />
      </section>
    </div>
  )
}

function PlannedFeature({ title, description }: { title: string; description: string }) {
  return (
    <article className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] p-5 text-left">
      <span className="text-xs font-black tracking-[0.12em] text-fuchsia-200/70">
        준비 중
      </span>
      <h3 className="mt-3 break-words text-2xl font-black text-white/85 [overflow-wrap:anywhere] md:break-keep">{title}</h3>
      <p className="mt-3 min-h-16 break-words text-sm font-semibold leading-7 text-slate-400 [overflow-wrap:anywhere] md:break-keep">{description}</p>
      <span className="mt-5 inline-flex rounded-md border border-white/10 px-4 py-3 text-sm font-black text-slate-400">
        준비 중
      </span>
    </article>
  )
}
