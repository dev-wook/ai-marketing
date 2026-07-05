import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { aiImageDesignModels } from '../catalog'
import type {
  AiImageAspectRatio,
  AiImageBackground,
  AiImageCompositionId,
  AiImageDesignModelId,
  AiImageEditTarget,
  AiImageEyeState,
  AiImageGenerationMode,
  AiImageHandPose,
  AiImageMaskOption,
} from '../types'
import { createGeminiDeveloperProvider } from './gemini-developer-provider'
import {
  ImageProviderRequestError,
  type AiImageProviderId,
  type ImageProvider,
} from './image-provider'
import { buildAiImageGenerationPrompt } from './model-prompts'
import { createVertexAiProvider } from './vertex-ai-provider'

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

export async function generateBeautyImage(input: {
  bytes?: Uint8Array
  mimeType?: string
  modelId?: AiImageDesignModelId
  mode: AiImageGenerationMode
  target: AiImageEditTarget
  aspectRatio: AiImageAspectRatio
  customPrompt: string
  compositionId: AiImageCompositionId
  maskOption: AiImageMaskOption
  eyeState: AiImageEyeState
  handPose: AiImageHandPose
  background: AiImageBackground
}) {
  const provider = getConfiguredProvider()
  const models = parseModelCandidates(
    provider.id === 'vertex-ai'
      ? process.env.VERTEX_AI_IMAGE_MODELS
      : process.env.GEMINI_IMAGE_MODELS,
    provider.defaultModels,
  )
  const designModel = input.modelId
    ? aiImageDesignModels.find((model) => model.id === input.modelId)
    : undefined

  if (input.mode === 'partial' && !designModel) {
    throw new AiImageGenerationError('모델을 찾을 수 없습니다.', 400)
  }

  const referenceBytes = designModel
    ? await readFile(
        join(process.cwd(), 'public', designModel.thumbnailPath.replace(/^\//, '')),
      )
    : undefined
  let lastError: unknown

  for (const model of models) {
    try {
      const imageDataUrl = await provider.requestImage({
        model,
        prompt: buildAiImageGenerationPrompt({
          modelId: input.modelId,
          mode: input.mode,
          target: input.target,
          aspectRatio: input.aspectRatio,
          customPrompt: input.customPrompt,
          hasSourceImage: Boolean(input.bytes),
          compositionId: input.compositionId,
          maskOption: input.maskOption,
          eyeState: input.eyeState,
          handPose: input.handPose,
          background: input.background,
        }),
        referenceBytes,
        referenceMimeType: designModel?.thumbnailPath.endsWith('.png')
          ? 'image/png'
          : 'image/jpeg',
        sourceBytes: input.bytes,
        sourceMimeType: input.mimeType,
        aspectRatio: input.aspectRatio,
      })

      return {
        imageDataUrl,
        provider: provider.id,
        providerModel: model,
      }
    } catch (error) {
      lastError = error

      if (!(error instanceof ImageProviderRequestError) || !error.canFallback) {
        throw toGenerationError(error)
      }

      console.warn('AI image model failed, trying fallback', {
        provider: provider.id,
        model,
        status: error.status,
      })
    }
  }

  throw toGenerationError(lastError)
}

function getConfiguredProvider(): ImageProvider {
  const provider = (process.env.AI_IMAGE_PROVIDER || 'vertex-ai') as AiImageProviderId

  try {
    if (provider === 'vertex-ai') {
      return createVertexAiProvider()
    }

    if (provider === 'gemini-developer') {
      return createGeminiDeveloperProvider()
    }
  } catch (error) {
    throw new AiImageGenerationError(
      'AI 이미지 생성 기능이 설정되지 않았습니다.',
      503,
      error instanceof Error ? error.message : String(error),
    )
  }

  throw new AiImageGenerationError(
    'AI 이미지 생성 기능이 설정되지 않았습니다.',
    503,
    `Unsupported AI_IMAGE_PROVIDER: ${provider}`,
  )
}

function parseModelCandidates(value: string | undefined, defaults: string[]) {
  const models = value
    ?.split(',')
    .map((model) => model.trim())
    .filter(Boolean)

  return Array.from(new Set(models?.length ? models : defaults))
}

function toGenerationError(error: unknown) {
  if (error instanceof AiImageGenerationError) {
    return error
  }

  if (error instanceof ImageProviderRequestError) {
    return new AiImageGenerationError(
      'AI 이미지 생성에 실패했습니다. 잠시 후 다시 시도해주세요.',
      error.status === 429 ? 429 : 502,
      `${error.provider}/${error.model}: ${error.status} ${error.debug}`,
    )
  }

  return new AiImageGenerationError(
    'AI 이미지 생성에 실패했습니다. 잠시 후 다시 시도해주세요.',
    500,
    error instanceof Error ? error.message : String(error),
  )
}
