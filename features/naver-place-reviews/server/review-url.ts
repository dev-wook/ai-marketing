import type { NaverReviewType } from '../types'

export const REVIEW_PATH_BY_TYPE: Record<NaverReviewType, string> = {
  visitor: 'visitor',
  blog: 'ugc',
}

export function createNaverPlaceReviewUrl(placeId: string, type: NaverReviewType) {
  return `https://m.place.naver.com/place/${placeId}/review/${REVIEW_PATH_BY_TYPE[type]}`
}
