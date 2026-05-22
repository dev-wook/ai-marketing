import { NextResponse } from 'next/server'
import { jsonErrorResponse } from '@/lib/api/route-response'
import { searchNaverLocal } from '@/lib/naver'
import { toNaverSearchErrorResponse } from '@/features/naver-search/server/errors'
import { getLocalSearchParams } from '@/features/naver-search/server/search-params'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const params = getLocalSearchParams(searchParams)

    if (!params.query) {
      return NextResponse.json({ message: '검색어를 입력해주세요.' }, { status: 400 })
    }

    const payload = await searchNaverLocal(params)

    return NextResponse.json(payload)
  } catch (error) {
    const response = toNaverSearchErrorResponse(
      error,
      '네이버 검색 정보를 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
    )

    return jsonErrorResponse(response)
  }
}
