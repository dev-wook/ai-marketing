import { NextResponse, type NextRequest } from 'next/server'
import { getAuthUserFromRequest } from '@/features/auth/server/session'
import type { AiImageDesignModelId } from '../types'
import { aiImageDesignModels } from '../catalog'
import {
  AiImageGenerationError,
  generateEyelashImage,
} from '../server/gemini-image'

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maxUploadBytes = 3.5 * 1024 * 1024

export async function POST(request: NextRequest) {
  if (!getAuthUserFromRequest(request)) {
    return NextResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const category = formData.get('category')
    const modelId = formData.get('modelId')
    const image = formData.get('image')

    if (category !== 'eyelash') {
      return NextResponse.json({ message: '지원하지 않는 카테고리입니다.' }, { status: 400 })
    }

    if (!isDesignModelId(modelId)) {
      return NextResponse.json({ message: '결과 모델을 선택해주세요.' }, { status: 400 })
    }

    if (!(image instanceof File)) {
      return NextResponse.json({ message: '원본 이미지를 업로드해주세요.' }, { status: 400 })
    }

    if (!allowedMimeTypes.has(image.type)) {
      return NextResponse.json(
        { message: 'JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.' },
        { status: 415 },
      )
    }

    if (image.size === 0 || image.size > maxUploadBytes) {
      return NextResponse.json(
        { message: '이미지 크기를 줄인 뒤 다시 업로드해주세요.' },
        { status: 413 },
      )
    }

    const bytes = new Uint8Array(await image.arrayBuffer())

    if (!hasValidImageSignature(bytes, image.type)) {
      return NextResponse.json({ message: '올바른 이미지 파일이 아닙니다.' }, { status: 400 })
    }

    const imageDataUrl = await generateEyelashImage({
      bytes,
      mimeType: image.type,
      modelId,
    })

    return NextResponse.json({ imageDataUrl })
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
        debug: process.env.NODE_ENV === 'development' ? generationError.debug : undefined,
      },
      { status: generationError.status },
    )
  }
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
