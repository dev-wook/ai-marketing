type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
}

export class GeminiApiError extends Error {
  status: number
  statusText: string
  body: string
  attempt: number
  maxAttempts: number

  constructor(input: {
    status: number
    statusText: string
    body: string
    message: string
    attempt: number
    maxAttempts: number
  }) {
    super(input.message)
    this.name = 'GeminiApiError'
    this.status = input.status
    this.statusText = input.statusText
    this.body = input.body
    this.attempt = input.attempt
    this.maxAttempts = input.maxAttempts
  }
}

const GEMINI_MAX_ATTEMPTS = 3

export async function generateGeminiText(prompt: string, useGoogleSearch = false) {
  const apiKey = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_TEXT_MODEL ?? 'gemini-2.5-flash'

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.')
  }

  let lastError: unknown

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await requestGeminiText({
        apiKey,
        model,
        prompt,
        useGoogleSearch,
        attempt,
        maxAttempts: GEMINI_MAX_ATTEMPTS,
      })
    } catch (error) {
      lastError = error

      if (!shouldRetryGeminiError(error) || attempt === GEMINI_MAX_ATTEMPTS) {
        throw error
      }

      console.warn('Gemini API retry scheduled', {
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts: GEMINI_MAX_ATTEMPTS,
        model,
        useGoogleSearch,
        reason: toRetryReason(error),
      })

      await wait(getRetryDelayMs(attempt))
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Gemini API request failed.')
}

async function requestGeminiText({
  apiKey,
  model,
  prompt,
  useGoogleSearch,
  attempt,
  maxAttempts,
}: {
  apiKey: string
  model: string
  prompt: string
  useGoogleSearch: boolean
  attempt: number
  maxAttempts: number
}) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        tools: useGoogleSearch ? [{ google_search: {} }] : undefined,
      }),
    },
  )

  if (!response.ok) {
    const errorBody = await response.text()

    console.error('Gemini API error', {
      status: response.status,
      statusText: response.statusText,
      model,
      useGoogleSearch,
      attempt,
      maxAttempts,
      body: safelyParseJson(errorBody),
    })

    throw new GeminiApiError({
      status: response.status,
      statusText: response.statusText,
      body: errorBody,
      attempt,
      maxAttempts,
      message: `Gemini API request failed with status ${response.status}`,
    })
  }

  const data = (await response.json()) as GeminiGenerateContentResponse

  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join('\n') ?? ''
  )
}

function shouldRetryGeminiError(error: unknown) {
  if (error instanceof GeminiApiError) {
    return [408, 409, 429, 500, 502, 503, 504].includes(error.status)
  }

  return error instanceof TypeError
}

function getRetryDelayMs(attempt: number) {
  return attempt * 700
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function toRetryReason(error: unknown) {
  if (error instanceof GeminiApiError) {
    return {
      type: error.name,
      status: error.status,
      statusText: error.statusText,
    }
  }

  if (error instanceof Error) {
    return {
      type: error.name,
      message: error.message,
    }
  }

  return {
    type: 'unknown',
  }
}

function safelyParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}
