import { NextResponse, type NextRequest } from 'next/server'
import { getAuthUserFromRequest } from '@/features/auth/server/session'
import { getMonthlyUsage } from '../server/usage'

export async function GET(request: NextRequest) {
  const user = getAuthUserFromRequest(request)

  if (!user) {
    return NextResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 })
  }

  try {
    return NextResponse.json(await getMonthlyUsage(user.id))
  } catch (error) {
    console.error('AI image usage query failed', {
      memberId: user.id,
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json({
      trackingAvailable: false,
      periodLabel: new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'long',
      }).format(new Date()),
      generationCount: 0,
      estimatedCostKrw: 0,
      monthlyBudgetKrw: 15_000,
      usageRate: 0,
      modelUsage: [
        { model: 'primary', count: 0 },
        { model: 'fallback', count: 0 },
      ],
      billingConsoleUrl:
        'https://console.cloud.google.com/billing/012C97-64B52F-9CDC36/budgets',
    })
  }
}
