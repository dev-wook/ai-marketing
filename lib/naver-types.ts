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
