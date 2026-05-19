type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
}

export async function generateGeminiText(prompt: string, useGoogleSearch = false) {
  const apiKey = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_TEXT_MODEL ?? 'gemini-2.5-flash'

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.')
  }

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
    if (response.status === 503) {
      throw new Error('Gemini 사용량이 일시적으로 많아 글 생성에 실패했습니다. 잠시 후 다시 시도해주세요.')
    }

    throw new Error(`Gemini API 요청에 실패했습니다. status=${response.status}`)
  }

  const data = (await response.json()) as GeminiGenerateContentResponse

  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join('\n') ?? ''
  )
}
