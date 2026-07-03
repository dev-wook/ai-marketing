export type AiImageProviderId = 'vertex-ai' | 'gemini-developer'

export type ImageProviderRequest = {
  model: string
  prompt: string
  referenceBytes: Uint8Array
  sourceBytes: Uint8Array
  sourceMimeType: string
}

export type ImageProvider = {
  id: AiImageProviderId
  defaultModels: string[]
  requestImage: (input: ImageProviderRequest) => Promise<string>
}

export type ImageResponsePart = {
  text?: string
  inlineData?: {
    data?: string
    mimeType?: string
  }
}

export type ImageResponse = {
  candidates?: Array<{
    content?: {
      parts?: ImageResponsePart[]
    }
  }>
}

export class ImageProviderRequestError extends Error {
  constructor(
    readonly provider: AiImageProviderId,
    readonly model: string,
    readonly status: number,
    readonly debug: string,
    readonly canFallback: boolean,
  ) {
    super(`${provider} image request failed with status ${status}`)
    this.name = 'ImageProviderRequestError'
  }
}

export function buildImageRequestParts(input: ImageProviderRequest) {
  return [
    { text: input.prompt },
    {
      text: 'IMAGE 1 — MODEL IMAGE. Use this image as the base for the final result.',
    },
    {
      inlineData: {
        mimeType: 'image/jpeg',
        data: Buffer.from(input.referenceBytes).toString('base64'),
      },
    },
    {
      text: 'IMAGE 2 — TREATMENT SOURCE IMAGE. Copy only the upper-eyelash treatment characteristics from this image.',
    },
    {
      inlineData: {
        mimeType: input.sourceMimeType,
        data: Buffer.from(input.sourceBytes).toString('base64'),
      },
    },
  ]
}

export function extractImageDataUrl(response: ImageResponse) {
  const imagePart = response.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .find((part) => part.inlineData?.data && part.inlineData.mimeType?.startsWith('image/'))

  if (!imagePart?.inlineData?.data || !imagePart.inlineData.mimeType) {
    return null
  }

  return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`
}
