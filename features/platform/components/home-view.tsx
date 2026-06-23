import { PlaceTrackingDashboard } from '@/features/place-tracking/components/place-tracking-dashboard'

type HomeFeature = {
  title: string
  description: string
  status: 'open' | 'soon'
  action?: () => void
}

export function HomeView({
  onOpenBlogPosting,
  onOpenKeyword,
  onOpenPlaceCompetitor,
  onOpenPlaceDiagnosis,
  onOpenPlaceRanking,
  onOpenPlaceTracking,
}: {
  onOpenBlogPosting: () => void
  onOpenKeyword: () => void
  onOpenPlaceCompetitor: () => void
  onOpenPlaceDiagnosis: () => void
  onOpenPlaceRanking: () => void
  onOpenPlaceTracking: () => void
}) {
  const features: HomeFeature[] = [
    {
      title: '플레이스 순위 조회',
      description: '키워드별 플레이스 노출 순서와 예약 흐름을 확인합니다.',
      status: 'open',
      action: onOpenPlaceRanking,
    },
    {
      title: 'AI 플레이스 진단',
      description: '플레이스명을 검색해 선택하고 AI 노출 진단 점수와 개선 피드백을 생성합니다.',
      status: 'open',
      action: onOpenPlaceDiagnosis,
    },
    {
      title: 'AI 플레이스 경쟁사 비교',
      description: '두 플레이스를 같은 키워드 기준으로 비교해 점수, 리뷰, 콘텐츠, 전환 신호의 우위를 확인합니다.',
      status: 'open',
      action: onOpenPlaceCompetitor,
    },
    {
      title: 'AI 키워드 분석',
      description: '검색 의도와 상위 콘텐츠 흐름에 맞는 핵심 키워드를 분석합니다.',
      status: 'open',
      action: onOpenKeyword,
    },
    {
      title: 'AI 블로그 원고 작성',
      description: '키워드와 답변을 바탕으로 블로그 원고를 작성합니다.',
      status: 'open',
      action: onOpenBlogPosting,
    },
    {
      title: 'AI 모델 이미지 생성',
      description: '브랜드와 캠페인에 맞는 모델 이미지를 제작합니다.',
      status: 'soon',
    },
  ]

  return (
    <div className="grid w-full min-w-0 gap-6 overflow-x-hidden">
      <PlaceTrackingDashboard onOpenManagerPage={onOpenPlaceTracking} />

      <section className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {features.map((feature) => (
          <FeatureCard key={feature.title} feature={feature} />
        ))}
      </section>
    </div>
  )
}

function FeatureCard({ feature }: { feature: HomeFeature }) {
  const isOpen = feature.status === 'open'
  const className = `group grid min-h-56 min-w-0 content-between rounded-md border p-5 text-left transition md:min-h-64 ${
    isOpen
      ? 'cursor-pointer border-cyan-300/24 bg-[#0b1727]/82 md:hover:-translate-y-0.5 md:hover:border-cyan-200/50 md:hover:bg-[#102033]/88 md:hover:shadow-[0_18px_42px_rgba(0,0,0,0.22)] focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/18'
      : 'border-white/10 bg-white/[0.025] opacity-75'
  }`
  const content = (
    <>
      <div className="min-w-0">
        {!isOpen ? (
          <span className="inline-flex rounded-full bg-fuchsia-300/10 px-3 py-1 text-[11px] font-black tracking-[0.08em] text-fuchsia-200/80">
            준비 중
          </span>
        ) : null}
        <h3
          className={`break-keep text-2xl font-black leading-tight text-white md:text-3xl ${
            isOpen ? 'mt-0' : 'mt-4'
          }`}
        >
          {feature.title}
        </h3>
        <p className="mt-4 break-keep text-sm font-semibold leading-7 text-slate-300">
          {feature.description}
        </p>
      </div>

      {!isOpen ? (
        <span className="mt-6 inline-flex h-12 w-fit items-center justify-center rounded-md border border-white/10 px-5 text-sm font-black text-slate-500">
          준비 중
        </span>
      ) : null}
    </>
  )

  if (isOpen) {
    return (
      <button type="button" onClick={feature.action} className={className}>
        {content}
      </button>
    )
  }

  return (
    <article className={className}>
      {content}
    </article>
  )
}
