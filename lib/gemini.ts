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

  constructor(input: {
    status: number
    statusText: string
    body: string
    message: string
  }) {
    super(input.message)
    this.name = 'GeminiApiError'
    this.status = input.status
    this.statusText = input.statusText
    this.body = input.body
  }
}

const defaultGeminiTextModel = 'gemini-3.5-flash'

export async function generateGeminiText(prompt: string, useGoogleSearch = false) {
  const apiKey = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_TEXT_MODEL ?? defaultGeminiTextModel

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.')
  }

  return requestGeminiText({
    apiKey,
    model,
    prompt,
    useGoogleSearch,
  })
}

async function requestGeminiText({
  apiKey,
  model,
  prompt,
  useGoogleSearch,
}: {
  apiKey: string
  model: string
  prompt: string
  useGoogleSearch: boolean
}) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
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
      body: safelyParseJson(errorBody),
    })

    throw new GeminiApiError({
      status: response.status,
      statusText: response.statusText,
      body: errorBody,
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

function safelyParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}
