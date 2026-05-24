const recentKeywordStorageKey = 'aiva:recent-keywords'
const keywordCooldownStorageKey = 'aiva:keyword-analysis-last-success-at'
const maxRecentKeywordCount = 5
const keywordCooldownSeconds = 30

export function readRecentKeywords() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(recentKeywordStorageKey) ?? '[]')

    return normalizeRecentKeywords(parsed)
  } catch {
    return []
  }
}

export function saveRecentKeyword(keyword: string) {
  const nextKeywords = normalizeRecentKeywords([keyword, ...readRecentKeywords()])

  window.localStorage.setItem(recentKeywordStorageKey, JSON.stringify(nextKeywords))

  return nextKeywords
}

export function deleteRecentKeyword(keyword: string) {
  const keyToRemove = keyword.trim().toLowerCase()
  const nextKeywords = readRecentKeywords().filter((item) => item.toLowerCase() !== keyToRemove)

  window.localStorage.setItem(recentKeywordStorageKey, JSON.stringify(nextKeywords))

  return nextKeywords
}

export function readKeywordCooldownRemaining() {
  if (typeof window === 'undefined') {
    return 0
  }

  const lastSuccessAt = Number(window.localStorage.getItem(keywordCooldownStorageKey) ?? 0)

  if (!Number.isFinite(lastSuccessAt) || lastSuccessAt <= 0) {
    return 0
  }

  const elapsedSeconds = Math.floor((Date.now() - lastSuccessAt) / 1000)

  return Math.max(keywordCooldownSeconds - elapsedSeconds, 0)
}

export function saveKeywordCooldownStart() {
  window.localStorage.setItem(keywordCooldownStorageKey, String(Date.now()))

  return keywordCooldownSeconds
}

function normalizeRecentKeywords(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()
  const keywords: string[] = []

  for (const item of value) {
    if (typeof item !== 'string') {
      continue
    }

    const keyword = item.trim()
    const key = keyword.toLowerCase()

    if (!keyword || seen.has(key)) {
      continue
    }

    seen.add(key)
    keywords.push(keyword)

    if (keywords.length >= maxRecentKeywordCount) {
      break
    }
  }

  return keywords
}
