import {
  buildImageRequestParts,
  extractImageDataUrl,
  ImageProviderRequestError,
  type ImageProvider,
  type ImageResponse,
} from './image-provider'

const retryableStatuses = new Set([429, 500, 502, 503, 504])

export function createGeminiDeveloperProvider(): ImageProvider {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.')
  }

  return {
    id: 'gemini-developer',
    defaultModels: ['gemini-3.1-flash-lite-image', 'gemini-2.5-flash-image'],
    async requestImage(input) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: buildImageRequestParts(input) }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
              imageConfig: {
                aspectRatio: input.aspectRatio,
              },
            },
          }),
        },
      )

      if (!response.ok) {
        const body = await response.text()

        console.error('Gemini Developer image API error', {
          model: input.model,
          status: response.status,
          body: safelyParseFailure(body),
        })

        throw new ImageProviderRequestError(
          'gemini-developer',
          input.model,
          response.status,
          body,
          retryableStatuses.has(response.status) || response.status === 404,
        )
      }

      const data = (await response.json()) as ImageResponse
      const imageDataUrl = extractImageDataUrl(data)

      if (!imageDataUrl) {
        throw new ImageProviderRequestError(
          'gemini-developer',
          input.model,
          502,
          'Image response part was missing.',
          true,
        )
      }

      return imageDataUrl
    },
  }
}

function safelyParseFailure(body: string) {
  try {
    return JSON.parse(body) as unknown
  } catch {
    return body.slice(0, 1000)
  }
}
