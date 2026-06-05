export type PlaceRankingItem = {
  rank: number
  displayRank: number
  name: string
  category: string
  isAd: boolean
  expId: string
  imageCount: number | null
  thumbnailUrl: string | null
  status: string
  address: string
  distance: string
  badges: string[]
  snippets: string[]
  visitorReviews: string[]
  rawText: string
}

export type PlaceRankingResponse = {
  keyword: string
  collectedAt: string
  requestedLimit: number
  totalCollected: number
  hasMore: boolean
  nextLimit: number | null
  source: 'live' | 'cache'
  items: PlaceRankingItem[]
}
