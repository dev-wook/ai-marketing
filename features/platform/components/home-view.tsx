import { PlaceTrackingDashboard } from '@/features/place-tracking/components/place-tracking-dashboard'

type HomeFeature = {
  title: string
  shortTitle: string
  description: string
  status: 'open' | 'soon'
  icon: HomeFeatureIcon
  action?: () => void
}

type HomeFeatureIcon =
  | 'tracking'
  | 'rank'
  | 'bookingInsight'
  | 'diagnosis'
  | 'compare'
  | 'keyword'
  | 'blog'
  | 'image'

export function HomeView({
  onOpenBlogPosting,
  onOpenKeyword,
  onOpenPlaceCompetitor,
  onOpenPlaceDiagnosis,
  onOpenBookingInsight,
  onOpenPlaceRanking,
  onOpenPlaceTracking,
}: {
  onOpenBlogPosting: () => void
  onOpenKeyword: () => void
  onOpenPlaceCompetitor: () => void
  onOpenPlaceDiagnosis: () => void
  onOpenBookingInsight: () => void
  onOpenPlaceRanking: () => void
  onOpenPlaceTracking: () => void
}) {
  const features: HomeFeature[] = [
    {
      title: '플레이스 관리',
      shortTitle: '관리',
      description: '내 플레이스와 키워드를 관리합니다.',
      status: 'open',
      icon: 'tracking',
      action: onOpenPlaceTracking,
    },
    {
      title: '플레이스 순위 조회',
      shortTitle: '순위',
      description: '키워드별 노출 순서를 확인합니다.',
      status: 'open',
      icon: 'rank',
      action: onOpenPlaceRanking,
    },
    {
      title: 'AI 예약 수요 캘린더',
      shortTitle: '예약',
      description: '월간 예약 흐름과 AI 예측을 확인합니다.',
      status: 'open',
      icon: 'bookingInsight',
      action: onOpenBookingInsight,
    },
    {
      title: 'AI 플레이스 진단',
      shortTitle: '진단',
      description: 'AI 관점의 점수와 개선안을 확인합니다.',
      status: 'open',
      icon: 'diagnosis',
      action: onOpenPlaceDiagnosis,
    },
    {
      title: 'AI 플레이스 경쟁사 비교',
      shortTitle: '비교',
      description: '두 플레이스의 강점과 약점을 비교합니다.',
      status: 'open',
      icon: 'compare',
      action: onOpenPlaceCompetitor,
    },
    {
      title: 'AI 키워드 분석',
      shortTitle: '키워드',
      description: '검색 의도와 핵심 키워드를 분석합니다.',
      status: 'open',
      icon: 'keyword',
      action: onOpenKeyword,
    },
    {
      title: 'AI 블로그 원고 작성',
      shortTitle: '블로그',
      description: '키워드와 답변으로 원고를 작성합니다.',
      status: 'open',
      icon: 'blog',
      action: onOpenBlogPosting,
    },
    {
      title: 'AI 모델 이미지 생성',
      shortTitle: '이미지',
      description: '캠페인용 이미지를 제작합니다.',
      status: 'soon',
      icon: 'image',
    },
  ]

  return (
    <div className="grid w-full min-w-0 gap-4 overflow-x-hidden md:gap-6">
      <PlaceTrackingDashboard
        className="order-1"
        mobileCompact
        onOpenManagerPage={onOpenPlaceTracking}
      />

      <section className="order-2 rounded-md border border-cyan-300/18 bg-[#0b1727]/82 p-4 shadow-[0_0_34px_rgba(34,211,238,0.08)] md:p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/75">
              Tools
            </p>
            <h2 className="mt-2 text-xl font-black text-white md:text-2xl">AIVA 도구</h2>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-black text-slate-300">
            {features.filter((feature) => feature.status === 'open').length}개 사용 가능
          </span>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-x-2 gap-y-5 sm:grid-cols-5 md:grid-cols-7">
          {features.map((feature) => (
            <HomeFeatureButton key={feature.title} feature={feature} />
          ))}
        </div>
      </section>

    </div>
  )
}

function HomeFeatureButton({ feature }: { feature: HomeFeature }) {
  const isOpen = feature.status === 'open'

  if (!isOpen) {
    return (
      <div className="grid min-w-0 justify-items-center gap-2 opacity-60">
        <span className="relative grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-400">
          <HomeFeatureIconRenderer icon={feature.icon} />
          <span className="absolute -right-1 -top-1 rounded-full bg-fuchsia-300/20 px-1.5 py-0.5 text-[9px] font-black text-fuchsia-100">
            준비
          </span>
        </span>
        <span className="max-w-full truncate text-center text-[12px] font-black text-slate-400">
          {feature.shortTitle}
        </span>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={feature.action}
      className="group grid min-w-0 justify-items-center gap-2 rounded-2xl p-1 text-center transition hover:bg-white/[0.04] focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/16"
      aria-label={feature.title}
      title={feature.description}
    >
      <span className="grid h-16 w-16 place-items-center rounded-2xl border border-cyan-300/18 bg-gradient-to-br from-cyan-300/14 via-white/[0.045] to-fuchsia-300/12 text-cyan-100 shadow-[0_14px_30px_rgba(0,0,0,0.18)] transition group-hover:-translate-y-0.5 group-hover:border-cyan-200/35 group-hover:bg-cyan-300/12">
        <HomeFeatureIconRenderer icon={feature.icon} />
      </span>
      <span className="max-w-full truncate text-center text-[12px] font-black text-slate-100">
        {feature.shortTitle}
      </span>
    </button>
  )
}

function HomeFeatureIconRenderer({ icon }: { icon: HomeFeatureIcon }) {
  const commonProps = {
    className: 'h-7 w-7',
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.9,
    viewBox: '0 0 24 24',
  }

  if (icon === 'tracking') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M12 21s6-5.1 6-10a6 6 0 0 0-12 0c0 4.9 6 10 6 10Z" />
        <circle cx="12" cy="11" r="2.3" />
      </svg>
    )
  }

  if (icon === 'rank') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M5 19V9" />
        <path d="M12 19V5" />
        <path d="M19 19v-7" />
        <path d="M3.8 19h16.4" />
      </svg>
    )
  }

  if (icon === 'diagnosis') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M6 4h9l3 3v13H6z" />
        <path d="M15 4v4h4" />
        <path d="M8.8 14.2 11 16.4l4.2-5" />
      </svg>
    )
  }

  if (icon === 'bookingInsight') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M6 4v3" />
        <path d="M18 4v3" />
        <path d="M4 9h16" />
        <path d="M5.5 6h13A1.5 1.5 0 0 1 20 7.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19V7.5A1.5 1.5 0 0 1 5.5 6Z" />
        <path d="M8 13h.01" />
        <path d="M12 13h.01" />
        <path d="M16 13h.01" />
        <path d="M8 17h.01" />
        <path d="M12 17h.01" />
      </svg>
    )
  }

  if (icon === 'compare') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M7 5h10" />
        <path d="M7 19h10" />
        <path d="M8 5 4 12h8z" />
        <path d="m16 19-4-7h8z" />
      </svg>
    )
  }

  if (icon === 'keyword') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="5.5" />
        <path d="m15 15 4.5 4.5" />
        <path d="M8.5 10.5h4" />
      </svg>
    )
  }

  if (icon === 'blog') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M6 4.5h10.5A1.5 1.5 0 0 1 18 6v14H7.5A1.5 1.5 0 0 1 6 18.5z" />
        <path d="M9 8h6" />
        <path d="M9 12h6" />
        <path d="M9 16h4" />
      </svg>
    )
  }

  return (
    <svg {...commonProps} aria-hidden="true">
      <path d="M5 17.5 9.5 13l3 3L19 9.5" />
      <path d="M5 6h14v12H5z" />
    </svg>
  )
}
