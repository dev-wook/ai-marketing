type NaverLocalSearchRawResponse = {
  lastBuildDate?: string
  total?: number
  start?: number
  display?: number
  items?: NaverLocalSearchRawItem[]
}

type NaverLocalSearchRawItem = {
  title?: string
  link?: string
  category?: string
  description?: string
  telephone?: string
  address?: string
  roadAddress?: string
  mapx?: string
  mapy?: string
}

type NaverBlogSearchRawResponse = {
  lastBuildDate?: string
  total?: number
  start?: number
  display?: number
  items?: NaverBlogSearchRawItem[]
}

type NaverBlogSearchRawItem = {
  title?: string
  link?: string
  description?: string
  bloggername?: string
  bloggerlink?: string
  postdate?: string
}

export type NaverLocalSearchItem = {
  title: string
  link: string
  category: string
  description: string
  address: string
  roadAddress: string
  mapx: string
  mapy: string
}

export type NaverBlogSearchItem = {
  title: string
  link: string
  description: string
  bloggerName: string
  bloggerLink: string
  postDate: string
}

export type NaverLocalSearchResponse = {
  query: string
  total: number
  start: number
  display: number
  items: NaverLocalSearchItem[]
}

export type NaverBlogSearchResponse = {
  query: string
  total: number
  start: number
  display: number
  items: NaverBlogSearchItem[]
}

export type NaverLocalSearchParams = {
  query: string
  display?: number
  start?: number
  sort?: 'random' | 'comment'
}

export type NaverBlogSearchParams = {
  query: string
  display?: number
  start?: number
  sort?: 'sim' | 'date'
}

export class NaverApiError extends Error {
  status: number
  statusText: string
  body: string

  constructor(input: { status: number; statusText: string; body: string; message: string }) {
    super(input.message)
    this.name = 'NaverApiError'
    this.status = input.status
    this.statusText = input.statusText
    this.body = input.body
  }
}

export async function searchNaverLocal({
  query,
  display = 5,
  start = 1,
  sort = 'random',
}: NaverLocalSearchParams): Promise<NaverLocalSearchResponse> {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  const safeQuery = query.trim()
  const safeDisplay = clampInteger(display, 1, 5)
  const safeStart = clampInteger(start, 1, 1)
  const safeSort = sort === 'comment' ? 'comment' : 'random'

  if (!clientId || !clientSecret) {
    throw new Error('Naver Search API environment variables are not configured.')
  }

  if (!safeQuery) {
    throw new Error('Naver Search API query is empty.')
  }

  const url = new URL('https://openapi.naver.com/v1/search/local.json')
  url.searchParams.set('query', safeQuery)
  url.searchParams.set('display', String(safeDisplay))
  url.searchParams.set('start', String(safeStart))
  url.searchParams.set('sort', safeSort)

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  })

  if (!response.ok) {
    const errorBody = await response.text()

    console.error('Naver local search API error', {
      status: response.status,
      statusText: response.statusText,
      query: safeQuery,
      display: safeDisplay,
      start: safeStart,
      sort: safeSort,
      body: safelyParseJson(errorBody),
    })

    throw new NaverApiError({
      status: response.status,
      statusText: response.statusText,
      body: errorBody,
      message: `Naver local search API request failed with status ${response.status}`,
    })
  }

  const data = (await response.json()) as NaverLocalSearchRawResponse

  return {
    query: safeQuery,
    total: toSafeNumber(data.total),
    start: toSafeNumber(data.start) || safeStart,
    display: toSafeNumber(data.display) || safeDisplay,
    items: Array.isArray(data.items) ? data.items.map(toLocalSearchItem) : [],
  }
}

export async function searchNaverBlog({
  query,
  display = 20,
  start = 1,
  sort = 'sim',
}: NaverBlogSearchParams): Promise<NaverBlogSearchResponse> {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  const safeQuery = query.trim()
  const safeDisplay = clampInteger(display, 1, 100)
  const safeStart = clampInteger(start, 1, 1000)
  const safeSort = sort === 'date' ? 'date' : 'sim'

  if (!clientId || !clientSecret) {
    throw new Error('Naver Search API environment variables are not configured.')
  }

  if (!safeQuery) {
    throw new Error('Naver Search API query is empty.')
  }

  const url = new URL('https://openapi.naver.com/v1/search/blog.json')
  url.searchParams.set('query', safeQuery)
  url.searchParams.set('display', String(safeDisplay))
  url.searchParams.set('start', String(safeStart))
  url.searchParams.set('sort', safeSort)

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  })

  if (!response.ok) {
    const errorBody = await response.text()

    console.error('Naver blog search API error', {
      status: response.status,
      statusText: response.statusText,
      query: safeQuery,
      display: safeDisplay,
      start: safeStart,
      sort: safeSort,
      body: safelyParseJson(errorBody),
    })

    throw new NaverApiError({
      status: response.status,
      statusText: response.statusText,
      body: errorBody,
      message: `Naver blog search API request failed with status ${response.status}`,
    })
  }

  const data = (await response.json()) as NaverBlogSearchRawResponse

  return {
    query: safeQuery,
    total: toSafeNumber(data.total),
    start: toSafeNumber(data.start) || safeStart,
    display: toSafeNumber(data.display) || safeDisplay,
    items: Array.isArray(data.items) ? data.items.map(toBlogSearchItem) : [],
  }
}

export function toNaverLocalSearchContext(response: NaverLocalSearchResponse) {
  if (response.items.length === 0) {
    return '네이버 지역 검색 결과: 검색된 업체 정보가 없습니다.'
  }

  const items = response.items
    .map((item, index) => {
      const parts = [
        `${index + 1}. ${item.title}`,
        item.category ? `분류: ${item.category}` : '',
        item.roadAddress ? `주소: ${item.roadAddress}` : item.address ? `주소: ${item.address}` : '',
        item.description ? `설명: ${item.description}` : '',
      ].filter(Boolean)

      return parts.join(' / ')
    })
    .join('\n')

  return `네이버 지역 검색 참고 데이터(총 ${response.total}건 중 상위 ${response.items.length}건):\n${items}`
}

export function toNaverBlogSearchContext(response: NaverBlogSearchResponse, maxItems = 20) {
  const items = response.items.slice(0, maxItems)

  if (items.length === 0) {
    return '네이버 블로그 검색 결과: 검색된 블로그 콘텐츠가 없습니다.'
  }

  const rows = items
    .map((item, index) => {
      const parts = [
        `${index + 1}. ${item.title}`,
        item.description ? `요약: ${item.description}` : '',
        item.postDate ? `작성일: ${item.postDate}` : '',
      ].filter(Boolean)

      return parts.join(' / ')
    })
    .join('\n')

  return `네이버 블로그 검색 참고 데이터(총 ${response.total}건 중 상위 ${items.length}건):\n${rows}`
}

function toLocalSearchItem(item: NaverLocalSearchRawItem): NaverLocalSearchItem {
  return {
    title: stripHtml(item.title),
    link: toSafeText(item.link),
    category: decodeHtml(stripHtml(item.category)),
    description: decodeHtml(stripHtml(item.description)),
    address: decodeHtml(stripHtml(item.address)),
    roadAddress: decodeHtml(stripHtml(item.roadAddress)),
    mapx: toSafeText(item.mapx),
    mapy: toSafeText(item.mapy),
  }
}

function toBlogSearchItem(item: NaverBlogSearchRawItem): NaverBlogSearchItem {
  return {
    title: decodeHtml(stripHtml(item.title)),
    link: toSafeText(item.link),
    description: decodeHtml(stripHtml(item.description)),
    bloggerName: decodeHtml(stripHtml(item.bloggername)),
    bloggerLink: toSafeText(item.bloggerlink),
    postDate: toSafeText(item.postdate),
  }
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(Math.max(Number.isInteger(value) ? value : min, min), max)
}

function toSafeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function stripHtml(value: unknown) {
  return toSafeText(value).replace(/<\/?[^>]+(>|$)/g, '')
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function toSafeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function safelyParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}
