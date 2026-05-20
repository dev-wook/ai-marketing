import { NextResponse } from 'next/server'
import { NaverApiError, searchNaverLocal } from '@/lib/naver'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('query')?.trim() ?? ''
    const display = toInteger(searchParams.get('display'), 5)
    const start = toInteger(searchParams.get('start'), 1)
    const sort = searchParams.get('sort') === 'comment' ? 'comment' : 'random'

    if (!query) {
      return NextResponse.json({ message: '검색어를 입력해주세요.' }, { status: 400 })
    }

    const payload = await searchNaverLocal({
      query,
      display,
      start,
      sort,
    })

    return NextResponse.json(payload)
  } catch (error) {
    const { message, status } = toNaverSearchErrorResponse(error)

    return NextResponse.json({ message }, { status })
  }
}

function toNaverSearchErrorResponse(error: unknown) {
  if (error instanceof NaverApiError) {
    if (error.status === 400) {
      return {
        status: 400,
        message: '검색어를 다시 확인해주세요.',
      }
    }

    if (error.status === 401 || error.status === 403) {
      return {
        status: 500,
        message: '현재 네이버 검색 연결 상태가 원활하지 않습니다. 잠시 후 다시 시도해주세요.',
      }
    }

    if (error.status === 404) {
      return {
        status: 500,
        message: '현재 검색 요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.',
      }
    }

    if (error.status === 429) {
      return {
        status: 429,
        message: '현재 검색 요청이 많습니다. 잠시 후 다시 시도해주세요.',
      }
    }
  }

  if (error instanceof Error) {
    console.error('Naver local search error', {
      message: error.message,
      stack: error.stack,
    })
  }

  return {
    status: 500,
    message: '네이버 검색 정보를 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
  }
}

function toInteger(value: string | null, fallback: number) {
  const parsed = Number(value)

  return Number.isInteger(parsed) ? parsed : fallback
}
