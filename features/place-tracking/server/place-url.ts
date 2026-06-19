import type { PlacePreview } from '../types'

const naverPlaceIdPattern = /(?:place\/|\/)(\d{6,})(?:[/?#]|$)/

export async function previewNaverPlaceUrl(placeUrl: string): Promise<PlacePreview> {
  const normalizedUrl = normalizePlaceUrl(placeUrl)
  const naverPlaceId = extractNaverPlaceId(normalizedUrl)

  if (!naverPlaceId) {
    throw new Error('네이버 플레이스 URL을 다시 확인해주세요.')
  }

  const placeName = await fetchNaverPlaceName(normalizedUrl)

  if (!placeName) {
    throw new Error('플레이스명을 확인하지 못했습니다. URL을 다시 확인해주세요.')
  }

  return {
    naverPlaceId,
    placeName,
    placeUrl: normalizedUrl,
  }
}

function normalizePlaceUrl(placeUrl: string) {
  const safeUrl = placeUrl.trim()

  if (!safeUrl) {
    throw new Error('등록할 플레이스 URL을 입력해주세요.')
  }

  let url: URL

  try {
    url = new URL(safeUrl)
  } catch {
    throw new Error('올바른 URL 형식으로 입력해주세요.')
  }

  if (!url.hostname.includes('place.naver.com')) {
    throw new Error('네이버 플레이스 URL만 등록할 수 있습니다.')
  }

  return url.toString()
}

function extractNaverPlaceId(placeUrl: string) {
  return placeUrl.match(naverPlaceIdPattern)?.[1] ?? ''
}

async function fetchNaverPlaceName(placeUrl: string) {
  const response = await fetch(placeUrl, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'ko-KR,ko;q=0.9',
      'user-agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`네이버 플레이스 페이지 조회에 실패했습니다. (${response.status})`)
  }

  const html = await response.text()

  return (
    extractMetaContent(html, 'og:title') ||
    extractMetaContent(html, 'twitter:title') ||
    extractTitle(html)
  )
}

function extractMetaContent(html: string, property: string) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${escapedProperty}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escapedProperty}["'][^>]*>`,
      'i',
    ),
  ]

  for (const pattern of patterns) {
    const value = cleanupName(html.match(pattern)?.[1] ?? '')

    if (value) {
      return value
    }
  }

  return ''
}

function extractTitle(html: string) {
  return cleanupName(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
}

function cleanupName(value: string) {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s*[:|]\s*네이버.*$/i, '')
    .replace(/\s*-\s*네이버.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}
