export function parseJsonPayload<T>(text: string): T {
  const withoutFence = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()

  try {
    return JSON.parse(withoutFence) as T
  } catch {
    const jsonMatch = withoutFence.match(/\{[\s\S]*\}/)

    if (!jsonMatch) {
      throw new Error('AI 진단 응답을 JSON으로 변환하지 못했습니다.')
    }

    return JSON.parse(jsonMatch[0]) as T
  }
}

export function toSafeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function toStringArray(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) {
    return fallback
  }

  return value.map(toSafeText).filter(Boolean)
}

export function toSafeScore(value: unknown, fallback: number, maxScore: number) {
  const numberValue = Number(value)

  if (!Number.isFinite(numberValue)) {
    return fallback
  }

  return Math.min(Math.max(Math.round(numberValue), 0), maxScore)
}
