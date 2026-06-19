import { PlaceTrackingDashboard } from '@/features/place-tracking/components/place-tracking-dashboard'

type HomeFeature = {
  title: string
  description: string
  status: 'open' | 'soon'
  primary?: boolean
  action?: () => void
}

export function HomeView({
  onOpenBlogPosting,
  onOpenKeyword,
  onOpenPlaceRanking,
  onOpenPlaceTracking,
}: {
  onOpenBlogPosting: () => void
  onOpenKeyword: () => void
  onOpenPlaceRanking: () => void
  onOpenPlaceTracking: () => void
}) {
  const features: HomeFeature[] = [
    {
      title: '플레이스 관리',
      description: '내 플레이스와 추적 키워드를 등록하고 대시보드에 연결합니다.',
      status: 'open',
      primary: true,
      action: onOpenPlaceTracking,
    },
    {
      title: '네이버 플레이스 순위 조회',
      description: '키워드별 플레이스 노출 순서와 예약 흐름을 확인합니다.',
      status: 'open',
      action: onOpenPlaceRanking,
    },
    {
      title: 'AI 검색 노출 키워드 분석',
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
      <PlaceTrackingDashboard compact />

      <section className="grid min-w-0 gap-4 rounded-md border border-white/10 bg-white/[0.035] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.22)] md:p-6">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200/80">
            Tools
          </p>
          <h2 className="mt-2 break-keep text-2xl font-black tracking-[-0.02em] text-white md:text-3xl">
            작업 바로가기
          </h2>
          <p className="mt-3 max-w-2xl break-keep text-sm font-semibold leading-6 text-slate-300">
            필요한 기능을 선택해 바로 시작합니다.
          </p>
        </div>
      </section>

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

  return (
    <article
      className={`group grid min-h-56 min-w-0 content-between rounded-md border p-5 transition md:min-h-64 ${
        isOpen
          ? feature.primary
            ? 'border-cyan-300/55 bg-cyan-300/12 shadow-[0_0_38px_rgba(34,211,238,0.16)] hover:-translate-y-0.5 hover:border-cyan-200/80'
            : 'border-cyan-300/30 bg-[#0b1727]/82 hover:-translate-y-0.5 hover:border-cyan-200/55'
          : 'border-white/10 bg-white/[0.025] opacity-75'
      }`}
    >
      <div className="min-w-0">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-[11px] font-black tracking-[0.08em] ${
            isOpen
              ? 'bg-cyan-300/12 text-cyan-100'
              : 'bg-fuchsia-300/10 text-fuchsia-200/80'
          }`}
        >
          {isOpen ? '서비스 오픈(Beta)' : '준비 중'}
        </span>
        <h3 className="mt-4 break-keep text-2xl font-black leading-tight text-white md:text-3xl">
          {feature.title}
        </h3>
        <p className="mt-4 break-keep text-sm font-semibold leading-7 text-slate-300">
          {feature.description}
        </p>
      </div>

      {isOpen ? (
        <button
          type="button"
          onClick={feature.action}
          className="mt-6 inline-flex h-12 w-fit items-center justify-center rounded-md bg-cyan-100 px-5 text-sm font-black text-[#071018] transition hover:bg-white"
        >
          시작하기
        </button>
      ) : (
        <span className="mt-6 inline-flex h-12 w-fit items-center justify-center rounded-md border border-white/10 px-5 text-sm font-black text-slate-500">
          준비 중
        </span>
      )}
    </article>
  )
}
