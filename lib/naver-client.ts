import {
  NaverApiError,
  type NaverBlogSearchItem,
  type NaverBlogSearchParams,
  type NaverBlogSearchResponse,
  type NaverLocalSearchItem,
  type NaverLocalSearchParams,
  type NaverLocalSearchResponse,
} from './naver-types'

type NaverLocalSearchRawResponse = {
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
  address?: string
  roadAddress?: string
  mapx?: string
  mapy?: string
}

type NaverBlogSearchRawResponse = {
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

export async function searchNaverLocal({
  query,
  display = 5,
  start = 1,
  sort = 'random',
}: NaverLocalSearchParams): Promise<NaverLocalSearchResponse> {
  const safeQuery = query.trim()
  const safeDisplay = clampInteger(display, 1, 5)
  const safeStart = clampInteger(start, 1, 1)
  const safeSort = sort === 'comment' ? 'comment' : 'random'
  const data = await requestNaverSearch<NaverLocalSearchRawResponse>({
    endpoint: 'https://openapi.naver.com/v1/search/local.json',
    logName: 'Naver local search API error',
    query: safeQuery,
    display: safeDisplay,
    start: safeStart,
    sort: safeSort,
  })

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
  const safeQuery = query.trim()
  const safeDisplay = clampInteger(display, 1, 100)
  const safeStart = clampInteger(start, 1, 1000)
  const safeSort = sort === 'date' ? 'date' : 'sim'
  const data = await requestNaverSearch<NaverBlogSearchRawResponse>({
    endpoint: 'https://openapi.naver.com/v1/search/blog.json',
    logName: 'Naver blog search API error',
    query: safeQuery,
    display: safeDisplay,
    start: safeStart,
    sort: safeSort,
  })

  return {
    query: safeQuery,
    total: toSafeNumber(data.total),
    start: toSafeNumber(data.start) || safeStart,
    display: toSafeNumber(data.display) || safeDisplay,
    items: Array.isArray(data.items) ? data.items.map(toBlogSearchItem) : [],
  }
}

async function requestNaverSearch<T>({
  display,
  endpoint,
  logName,
  query,
  sort,
  start,
}: {
  display: number
  endpoint: string
  logName: string
  query: string
  sort: string
  start: number
}) {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Naver Search API environment variables are not configured.')
  }

  if (!query) {
    throw new Error('Naver Search API query is empty.')
  }

  const url = new URL(endpoint)
  url.searchParams.set('query', query)
  url.searchParams.set('display', String(display))
  url.searchParams.set('start', String(start))
  url.searchParams.set('sort', sort)

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  })

  if (!response.ok) {
    const errorBody = await response.text()

    console.error(logName, {
      status: response.status,
      statusText: response.statusText,
      query,
      display,
      start,
      sort,
      body: safelyParseJson(errorBody),
    })

    throw new NaverApiError({
      status: response.status,
      statusText: response.statusText,
      body: errorBody,
      message: `Naver Search API request failed with status ${response.status}`,
    })
  }

  return (await response.json()) as T
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
