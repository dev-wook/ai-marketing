import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { aiImageDesignModels } from '../catalog'
import type { AiImageDesignModelId } from '../types'
import { buildEyelashGenerationPrompt } from './model-prompts'

type GeminiImagePart = {
  text?: string
  inlineData?: {
    data?: string
    mimeType?: string
  }
}

type GeminiImageResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiImagePart[]
    }
  }>
}

type GeminiFailureBody = {
  error?: {
    message?: string
    status?: string
  }
}

const defaultModels = ['gemini-3.1-flash-lite-image', 'gemini-2.5-flash-image']
const retryableStatuses = new Set([429, 500, 502, 503, 504])

export class AiImageGenerationError extends Error {
  constructor(
    message: string,
    readonly status = 500,
    readonly debug = '',
  ) {
    super(message)
    this.name = 'AiImageGenerationError'
  }
}

export async function generateEyelashImage(input: {
  bytes: Uint8Array
  mimeType: string
  modelId: AiImageDesignModelId
}) {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new AiImageGenerationError(
      'AI 이미지 생성 기능이 설정되지 않았습니다.',
      503,
      'GEMINI_API_KEY is not configured.',
    )
  }

  const models = parseModelCandidates(process.env.GEMINI_IMAGE_MODELS)
  const designModel = aiImageDesignModels.find((model) => model.id === input.modelId)

  if (!designModel) {
    throw new AiImageGenerationError('모델을 찾을 수 없습니다.', 400)
  }

  const referenceBytes = await readFile(
    join(process.cwd(), 'public', designModel.thumbnailPath.replace(/^\//, '')),
  )
  let lastError: unknown

  for (const model of models) {
    try {
      const imageDataUrl = await requestImage({
        apiKey,
        model,
        prompt: buildEyelashGenerationPrompt(input.modelId),
        referenceBytes,
        bytes: input.bytes,
        mimeType: input.mimeType,
      })

      return {
        imageDataUrl,
        providerModel: model,
      }
    } catch (error) {
      lastError = error

      if (!(error instanceof GeminiImageRequestError) || !error.canFallback) {
        throw toGenerationError(error)
      }

      console.warn('Gemini image model failed, trying fallback', {
        model,
        status: error.status,
      })
    }
  }

  throw toGenerationError(lastError)
}

async function requestImage(input: {
  apiKey: string
  model: string
  prompt: string
  referenceBytes: Uint8Array
  bytes: Uint8Array
  mimeType: string
}) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': input.apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
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
                  mimeType: input.mimeType,
                  data: Buffer.from(input.bytes).toString('base64'),
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['IMAGE'],
        },
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text()

    console.error('Gemini image API error', {
      model: input.model,
      status: response.status,
      body: safelyParseFailure(body),
    })

    throw new GeminiImageRequestError({
      model: input.model,
      status: response.status,
      body,
      canFallback: retryableStatuses.has(response.status) || response.status === 404,
    })
  }

  const data = (await response.json()) as GeminiImageResponse
  const imagePart = data.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .find((part) => part.inlineData?.data && part.inlineData.mimeType?.startsWith('image/'))

  if (!imagePart?.inlineData?.data || !imagePart.inlineData.mimeType) {
    console.error('Gemini image response did not include an image', {
      model: input.model,
      response: data,
    })

    throw new GeminiImageRequestError({
      model: input.model,
      status: 502,
      body: 'Image response part was missing.',
      canFallback: true,
    })
  }

  return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`
}

class GeminiImageRequestError extends Error {
  readonly model: string
  readonly status: number
  readonly body: string
  readonly canFallback: boolean

  constructor(input: {
    model: string
    status: number
    body: string
    canFallback: boolean
  }) {
    super(`Gemini image request failed with status ${input.status}`)
    this.name = 'GeminiImageRequestError'
    this.model = input.model
    this.status = input.status
    this.body = input.body
    this.canFallback = input.canFallback
  }
}

function parseModelCandidates(value?: string) {
  const models = value
    ?.split(',')
    .map((model) => model.trim())
    .filter(Boolean)

  return Array.from(new Set(models?.length ? models : defaultModels))
}

function toGenerationError(error: unknown) {
  if (error instanceof AiImageGenerationError) {
    return error
  }

  if (error instanceof GeminiImageRequestError) {
    return new AiImageGenerationError(
      'AI 이미지 생성에 실패했습니다. 잠시 후 다시 시도해주세요.',
      error.status === 429 ? 429 : 502,
      `${error.model}: ${error.status} ${error.body}`,
    )
  }

  return new AiImageGenerationError(
    'AI 이미지 생성에 실패했습니다. 잠시 후 다시 시도해주세요.',
    500,
    error instanceof Error ? error.message : String(error),
  )
}

function safelyParseFailure(body: string) {
  try {
    return JSON.parse(body) as GeminiFailureBody
  } catch {
    return body.slice(0, 1000)
  }
}
