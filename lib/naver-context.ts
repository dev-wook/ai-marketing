import type { NaverBlogSearchResponse, NaverLocalSearchResponse } from './naver-types'

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
