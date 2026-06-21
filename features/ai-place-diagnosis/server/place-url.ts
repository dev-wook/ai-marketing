const naverPlaceIdPattern = /(?:place\/|\/)(\d{6,})(?:[/?#]|$)/

export function extractNaverPlaceIdFromUrl(placeUrl: string) {
  const safeUrl = placeUrl.trim()

  if (!safeUrl) {
    throw new Error('진단할 네이버 플레이스 URL을 입력해주세요.')
  }

  let url: URL

  try {
    url = new URL(safeUrl)
  } catch {
    throw new Error('올바른 네이버 플레이스 URL 형식으로 입력해주세요.')
  }

  if (!url.hostname.includes('place.naver.com')) {
    throw new Error('네이버 플레이스 URL만 진단할 수 있습니다.')
  }

  const placeId = url.toString().match(naverPlaceIdPattern)?.[1] ?? ''

  if (!placeId) {
    throw new Error('플레이스 URL에서 플레이스 ID를 찾지 못했습니다.')
  }

  return placeId
}
