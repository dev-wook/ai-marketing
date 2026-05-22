export function parseJsonPayload<T>(text: string): T {
  const trimmed = text.trim()
  const withoutFence = trimmed
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()

  try {
    return JSON.parse(withoutFence) as T
  } catch {
    const jsonMatch = withoutFence.match(/\{[\s\S]*\}/)

    if (!jsonMatch) {
      throw new Error('AI 응답을 JSON으로 변환하지 못했습니다.')
    }

    return JSON.parse(jsonMatch[0]) as T
  }
}

export function toStringArray(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) {
    return fallback
  }

  return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
}

export function toSafeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}
