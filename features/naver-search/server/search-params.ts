import { toIntegerParam } from '@/lib/api/route-response'

export function getRequiredQuery(searchParams: URLSearchParams) {
  return searchParams.get('query')?.trim() ?? ''
}

export function getBlogSearchParams(searchParams: URLSearchParams) {
  return {
    query: getRequiredQuery(searchParams),
    display: toIntegerParam(searchParams.get('display'), 20),
    start: toIntegerParam(searchParams.get('start'), 1),
    sort: searchParams.get('sort') === 'date' ? 'date' : 'sim',
  } as const
}

export function getLocalSearchParams(searchParams: URLSearchParams) {
  return {
    query: getRequiredQuery(searchParams),
    display: toIntegerParam(searchParams.get('display'), 5),
    start: toIntegerParam(searchParams.get('start'), 1),
    sort: searchParams.get('sort') === 'comment' ? 'comment' : 'random',
  } as const
}
