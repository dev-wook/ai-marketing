import { NextResponse, type NextRequest } from 'next/server'
import { getAuthUserFromRequest } from '@/features/auth/server/session'
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
import { aiImageDesignModels } from '../catalog'
import { aiImageCompositions } from '../generation-options'
import {
  AiImageGenerationError,
  generateBeautyImage,
} from '../server/gemini-image'
import { recordSuccessfulGeneration } from '../server/usage'

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maxUploadBytes = 3.5 * 1024 * 1024
const maxPromptLength = 600
const modes = new Set<AiImageGenerationMode>(['prompt', 'partial'])
const targets = new Set<AiImageEditTarget>([
  'eyelashes',
  'eyebrows',
  'eye-makeup',
  'hair',
  'lips',
  'overall',
])
const aspectRatios = new Set<AiImageAspectRatio>([
  '1:1',
  '3:4',
  '4:5',
  '4:3',
  '16:9',
  '9:16',
])
const compositionIds = new Set<AiImageCompositionId>(
  aiImageCompositions.map((composition) => composition.id),
)
const maskOptions = new Set<AiImageMaskOption>(['none', 'white', 'black'])
const eyeStates = new Set<AiImageEyeState>(['open', 'closed'])
const handPoses = new Set<AiImageHandPose>(['none', 'forehead', 'temple'])
const backgrounds = new Set<AiImageBackground>([
  'bright-studio',
  'beauty-salon',
  'treatment-bed',
])

export async function POST(request: NextRequest) {
  const user = getAuthUserFromRequest(request)

  if (!user) {
    return NextResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const category = formData.get('category')
    const modelId = formData.get('modelId')
    const image = formData.get('image')
    const mode = formData.get('mode')
    const target = formData.get('target')
    const aspectRatio = formData.get('aspectRatio')
    const customPrompt = getString(formData.get('prompt')).trim()
    const compositionId = formData.get('compositionId')
    const maskOption = formData.get('maskOption')
    const eyeState = formData.get('eyeState')
    const handPose = formData.get('handPose')
    const background = formData.get('background')

    if (category !== 'eyelash') {
      return NextResponse.json({ message: '지원하지 않는 카테고리입니다.' }, { status: 400 })
    }

    if (!isSetValue(modes, mode)) {
      return NextResponse.json({ message: '생성 방식을 다시 선택해주세요.' }, { status: 400 })
    }

    if (mode === 'partial' && !isDesignModelId(modelId)) {
      return NextResponse.json({ message: '결과 모델을 선택해주세요.' }, { status: 400 })
    }

    if (mode === 'partial' && !isSetValue(targets, target)) {
      return NextResponse.json({ message: '적용할 영역을 선택해주세요.' }, { status: 400 })
    }

    if (mode === 'partial' && !isSetValue(compositionIds, compositionId)) {
      return NextResponse.json({ message: '촬영 구도를 선택해주세요.' }, { status: 400 })
    }

    if (
      mode === 'partial' &&
      (!isSetValue(maskOptions, maskOption) ||
        !isSetValue(eyeStates, eyeState) ||
        !isSetValue(handPoses, handPose) ||
        !isSetValue(backgrounds, background))
    ) {
      return NextResponse.json({ message: '촬영 옵션을 다시 선택해주세요.' }, { status: 400 })
    }

    if (
      mode === 'partial' &&
      isSetValue(compositionIds, compositionId) &&
      isSetValue(maskOptions, maskOption) &&
      isSetValue(handPoses, handPose) &&
      isSetValue(backgrounds, background)
    ) {
      const composition = aiImageCompositions.find((item) => item.id === compositionId)
      const hasInvalidCombination =
        !composition ||
        (!composition.supportsMask && maskOption !== 'none') ||
        (!composition.supportsHandPose && handPose !== 'none') ||
        !composition.allowedBackgrounds.includes(background)

      if (hasInvalidCombination) {
        return NextResponse.json(
          { message: '선택한 구도에서 사용할 수 없는 촬영 옵션입니다.' },
          { status: 400 },
        )
      }
    }

    if (!isSetValue(aspectRatios, aspectRatio)) {
      return NextResponse.json({ message: '이미지 비율을 선택해주세요.' }, { status: 400 })
    }

    if (customPrompt.length > maxPromptLength) {
      return NextResponse.json({ message: '프롬프트는 600자 이하로 입력해주세요.' }, { status: 400 })
    }

    if (mode === 'prompt' && customPrompt.length < 3) {
      return NextResponse.json({ message: '생성할 이미지를 설명해주세요.' }, { status: 400 })
    }

    if (mode === 'partial' && !(image instanceof File)) {
      return NextResponse.json({ message: '원본 이미지를 업로드해주세요.' }, { status: 400 })
    }

    if (image instanceof File && !allowedMimeTypes.has(image.type)) {
      return NextResponse.json(
        { message: 'JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.' },
        { status: 415 },
      )
    }

    if (image instanceof File && (image.size === 0 || image.size > maxUploadBytes)) {
      return NextResponse.json(
        { message: '이미지 크기를 줄인 뒤 다시 업로드해주세요.' },
        { status: 413 },
      )
    }

    const bytes = image instanceof File ? new Uint8Array(await image.arrayBuffer()) : undefined

    if (image instanceof File && bytes && !hasValidImageSignature(bytes, image.type)) {
      return NextResponse.json({ message: '올바른 이미지 파일이 아닙니다.' }, { status: 400 })
    }

    const generation = await generateBeautyImage({
      bytes,
      mimeType: image instanceof File ? image.type : undefined,
      modelId: isDesignModelId(modelId) ? modelId : undefined,
      mode,
      target: isSetValue(targets, target) ? target : 'overall',
      aspectRatio,
      customPrompt,
      compositionId: isSetValue(compositionIds, compositionId)
        ? compositionId
        : 'front',
      maskOption: isSetValue(maskOptions, maskOption) ? maskOption : 'none',
      eyeState: isSetValue(eyeStates, eyeState) ? eyeState : 'open',
      handPose: isSetValue(handPoses, handPose) ? handPose : 'none',
      background: isSetValue(backgrounds, background) ? background : 'bright-studio',
    })

    try {
      await recordSuccessfulGeneration({
        memberId: user.id,
        designModelId: isDesignModelId(modelId) ? modelId : undefined,
        mode,
        compositionId: isSetValue(compositionIds, compositionId)
          ? compositionId
          : undefined,
        target: isSetValue(targets, target) ? target : undefined,
        provider: generation.provider,
        providerModel: generation.providerModel,
      })
    } catch (usageError) {
      console.error('AI image usage tracking failed', {
        memberId: user.id,
        error: usageError instanceof Error ? usageError.message : String(usageError),
      })
    }

    return NextResponse.json({ imageDataUrl: generation.imageDataUrl })
  } catch (error) {
    const generationError =
      error instanceof AiImageGenerationError
        ? error
        : new AiImageGenerationError(
            'AI 이미지 생성에 실패했습니다. 잠시 후 다시 시도해주세요.',
            500,
            error instanceof Error ? error.message : String(error),
          )

    console.error('AI image generation route failed', {
      status: generationError.status,
      debug: generationError.debug,
    })

    return NextResponse.json(
      {
        message: generationError.message,
        debug: sanitizeDebugLog(generationError.debug),
      },
      { status: generationError.status },
    )
  }
}

function getString(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value : ''
}

function isSetValue<T extends string>(
  values: Set<T>,
  value: FormDataEntryValue | null,
): value is T {
  return typeof value === 'string' && values.has(value as T)
}

function sanitizeDebugLog(debug: string) {
  if (!debug) {
    return undefined
  }

  return debug
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, '[REDACTED_API_KEY]')
    .slice(0, 8_000)
}

function isDesignModelId(value: FormDataEntryValue | null): value is AiImageDesignModelId {
  return (
    typeof value === 'string' &&
    aiImageDesignModels.some((designModel) => designModel.id === value)
  )
}

function hasValidImageSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }

  if (mimeType === 'image/png') {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    )
  }

  return (
    mimeType === 'image/webp' &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
}
