'use client'

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from 'react'
import NextImage from 'next/image'
import { ToolErrorMessage, ToolLoadingPanel } from '@/features/platform/components/tool-ui'
import { aiImageDesignModels } from '../catalog'
import type {
  AiImageDesignModelId,
  AiImageGenerationResponse,
} from '../types'

const acceptedFileTypes = ['image/jpeg', 'image/png', 'image/webp']
const maxSourceBytes = 15 * 1024 * 1024
const uploadMaxDimension = 1600

type SourceImage = {
  file: File
  previewUrl: string
}

export function AiImageGenerationTool() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedModelId, setSelectedModelId] =
    useState<AiImageDesignModelId>('model-a')
  const [sourceImage, setSourceImage] = useState<SourceImage | null>(null)
  const [resultImageUrl, setResultImageUrl] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [debugLog, setDebugLog] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [hasConsent, setHasConsent] = useState(false)
  const selectedModel =
    aiImageDesignModels.find((model) => model.id === selectedModelId) ??
    aiImageDesignModels[0]

  useEffect(() => {
    return () => {
      if (sourceImage) {
        URL.revokeObjectURL(sourceImage.previewUrl)
      }
    }
  }, [sourceImage])

  const selectFile = async (file?: File) => {
    setErrorMessage('')
    setDebugLog('')
    setResultImageUrl('')

    if (!file) {
      return
    }

    if (!acceptedFileTypes.includes(file.type)) {
      setErrorMessage('JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.')
      return
    }

    if (file.size > maxSourceBytes) {
      setErrorMessage('15MB 이하 이미지를 업로드해주세요.')
      return
    }

    try {
      const normalizedFile = await normalizeImageForUpload(file)
      setSourceImage((current) => {
        if (current) {
          URL.revokeObjectURL(current.previewUrl)
        }

        return {
          file: normalizedFile,
          previewUrl: URL.createObjectURL(normalizedFile),
        }
      })
    } catch {
      setErrorMessage('이미지를 읽을 수 없습니다. 다른 파일을 선택해주세요.')
    }
  }

  const generateImage = async () => {
    if (!sourceImage || !hasConsent || isGenerating) {
      return
    }

    setIsGenerating(true)
    setErrorMessage('')
    setDebugLog('')
    setResultImageUrl('')

    try {
      const formData = new FormData()
      formData.append('category', 'eyelash')
      formData.append('modelId', selectedModelId)
      formData.append('image', sourceImage.file)

      const response = await fetch('/api/ai-image-generation/generate', {
        method: 'POST',
        body: formData,
      })
      const data = (await response.json().catch(() => null)) as
        | (Partial<AiImageGenerationResponse> & {
            message?: string
            debug?: string
          })
        | null

      if (!response.ok || !data?.imageDataUrl) {
        setErrorMessage(
          data?.message ?? 'AI 이미지 생성에 실패했습니다. 잠시 후 다시 시도해주세요.',
        )
        setDebugLog(data?.debug ?? '')
        return
      }

      setResultImageUrl(data.imageDataUrl)
    } catch (error) {
      setErrorMessage('AI 이미지 생성에 실패했습니다. 잠시 후 다시 시도해주세요.')
      setDebugLog(error instanceof Error ? error.message : '')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    void selectFile(event.target.files?.[0])
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    void selectFile(event.dataTransfer.files?.[0])
  }

  return (
    <div className="grid min-w-0 gap-5">
      <section className="overflow-hidden rounded-md border border-cyan-300/18 bg-[#0b1422]/88 shadow-[0_24px_70px_rgba(0,0,0,0.25)]">
        <div className="border-b border-white/10 bg-gradient-to-r from-cyan-300/[0.09] via-transparent to-fuchsia-300/[0.08] px-5 py-5 md:px-7">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/75">
            AI Beauty Studio
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.03em] text-white md:text-3xl">
            속눈썹 디자인 미리보기
          </h1>
          <p className="mt-2 max-w-2xl break-keep text-sm font-semibold leading-6 text-slate-400">
            선택한 모델의 얼굴과 구도는 유지하고, 업로드한 시술 사진의 속눈썹만 자연스럽게
            적용합니다.
          </p>
        </div>

        <div className="grid min-w-0 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="min-w-0 border-b border-white/10 p-5 lg:border-b-0 lg:border-r md:p-7">
            <div className="grid gap-7">
              <StepSection number="1" title="카테고리">
                <div className="flex flex-wrap gap-2">
                  <CategoryButton active label="속눈썹" />
                  <CategoryButton disabled label="눈썹" />
                  <CategoryButton disabled label="아이라인" />
                  <CategoryButton disabled label="입술" />
                  <CategoryButton disabled label="헤어라인" />
                </div>
              </StepSection>

              <StepSection number="2" title="결과 모델">
                <div className="grid gap-3">
                  {aiImageDesignModels.map((model) => {
                    const selected = model.id === selectedModelId

                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => {
                          setSelectedModelId(model.id)
                          setResultImageUrl('')
                        }}
                        aria-pressed={selected}
                        disabled={isGenerating}
                        className={`grid min-w-0 grid-cols-[88px_minmax(0,1fr)] overflow-hidden rounded-md border text-left transition focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/18 disabled:cursor-not-allowed disabled:opacity-60 ${
                          selected
                            ? 'border-cyan-200/65 bg-cyan-300/12 shadow-[0_0_24px_rgba(34,211,238,0.11)]'
                            : 'border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.06]'
                        }`}
                      >
                        <NextImage
                          src={model.thumbnailPath}
                          alt=""
                          width={88}
                          height={88}
                          sizes="88px"
                          className="h-full min-h-[88px] w-[88px] object-cover"
                        />
                        <span className="min-w-0 px-4 py-3">
                          <span className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm font-black text-white">
                              {model.name}
                            </span>
                            {selected ? (
                              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-cyan-200 text-[11px] font-black text-[#07111d]">
                                ✓
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-1.5 block break-keep text-xs font-semibold leading-5 text-slate-400">
                            {model.description}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </StepSection>

              <StepSection number="3" title="속눈썹 시술 사진">
                <input
                  ref={inputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  onChange={handleInputChange}
                  className="sr-only"
                />
                <div
                  onDragEnter={(event) => {
                    event.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`overflow-hidden rounded-md border border-dashed transition ${
                    isDragging
                      ? 'border-cyan-200 bg-cyan-300/12'
                      : 'border-white/20 bg-black/15'
                  }`}
                >
                  {sourceImage ? (
                    <div className="relative">
                      <img
                        src={sourceImage.previewUrl}
                        alt="업로드한 속눈썹 시술 사진 미리보기"
                        className="max-h-72 w-full object-contain bg-black/30"
                      />
                      <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        disabled={isGenerating}
                        className="absolute bottom-3 right-3 rounded-md border border-white/15 bg-[#07111d]/90 px-3 py-2 text-xs font-black text-white backdrop-blur transition hover:border-cyan-300/50 disabled:opacity-50"
                      >
                        이미지 변경
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="grid min-h-44 w-full place-items-center px-5 py-8 text-center"
                    >
                      <span>
                        <UploadIcon />
                        <span className="mt-3 block text-sm font-black text-white">
                          사진을 끌어놓거나 선택해주세요
                        </span>
                        <span className="mt-1.5 block text-xs font-semibold text-slate-500">
                          JPG, PNG, WEBP · 최대 15MB
                        </span>
                      </span>
                    </button>
                  )}
                </div>
              </StepSection>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-white/10 bg-white/[0.035] p-4">
                <input
                  type="checkbox"
                  checked={hasConsent}
                  onChange={(event) => setHasConsent(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-cyan-300"
                />
                <span className="break-keep text-xs font-semibold leading-5 text-slate-400">
                  시술 사진 사용 권한과 고객의 AI 이미지 처리 동의를 확인했습니다. 업로드한
                  사진에서는 속눈썹 형태만 참고하며 결과는 실제 시술 결과와 다를 수 있습니다.
                </span>
              </label>

              <ToolErrorMessage message={errorMessage} log={debugLog} />

              <button
                type="button"
                onClick={generateImage}
                disabled={!sourceImage || !hasConsent || isGenerating}
                className="min-h-14 w-full rounded-md bg-white px-5 text-sm font-black text-[#07111d] transition hover:bg-cyan-50 focus:outline-none focus:ring-4 focus:ring-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isGenerating ? 'AI 이미지 생성 중' : 'AI 이미지 생성'}
              </button>
            </div>
          </div>

          <div className="min-w-0 bg-black/10 p-5 md:p-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-fuchsia-200/70">
                  Preview
                </p>
                <h2 className="mt-2 text-xl font-black text-white">모델 / 시술 사진 / 생성 결과</h2>
              </div>
              {resultImageUrl ? (
                <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-black text-emerald-100">
                  생성 완료
                </span>
              ) : null}
            </div>

            {isGenerating ? (
              <ToolLoadingPanel
                className="mt-5"
                eyebrow="AI Image"
                title="시술 사진의 속눈썹을 모델에 적용하고 있습니다"
                subtitle="선택한 모델의 얼굴과 구도를 유지하며 속눈썹 영역만 정교하게 편집합니다."
                step={1}
                steps={['모델과 시술 사진 확인', '속눈썹 형태 적용', '결과 이미지 완성']}
              />
            ) : (
              <ImageResult
                referenceUrl={selectedModel.thumbnailPath}
                sourceUrl={sourceImage?.previewUrl ?? ''}
                resultUrl={resultImageUrl}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

function StepSection({
  children,
  number,
  title,
}: {
  children: ReactNode
  number: string
  title: string
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-md border border-cyan-300/25 bg-cyan-300/10 text-xs font-black text-cyan-100">
          {number}
        </span>
        <h2 className="text-sm font-black text-white">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function CategoryButton({
  active = false,
  disabled = false,
  label,
}: {
  active?: boolean
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      className={`rounded-md border px-3 py-2 text-xs font-black ${
        active
          ? 'border-cyan-200/55 bg-cyan-300/12 text-cyan-50'
          : 'border-white/10 bg-white/[0.03] text-slate-600'
      } disabled:cursor-not-allowed`}
    >
      {label}
      {disabled ? <span className="ml-1 text-[9px]">준비</span> : null}
    </button>
  )
}

function ImageResult({
  referenceUrl,
  resultUrl,
  sourceUrl,
}: {
  referenceUrl: string
  resultUrl: string
  sourceUrl: string
}) {
  if (!sourceUrl) {
    return (
      <div className="mt-5 grid min-h-[460px] place-items-center rounded-md border border-dashed border-white/12 bg-white/[0.025] px-6 text-center">
        <div>
          <PreviewIcon />
          <p className="mt-4 text-sm font-black text-slate-300">
            속눈썹 시술 사진을 업로드해주세요
          </p>
          <p className="mt-2 break-keep text-xs font-semibold leading-5 text-slate-600">
            눈과 속눈썹이 선명하게 보이는 사진일수록 자연스러운 결과를 얻을 수 있습니다.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <ResultCard label="선택 모델" src={referenceUrl} />
      <ResultCard label="시술 사진" src={sourceUrl} />
      {resultUrl ? (
        <ResultCard label="생성 결과" src={resultUrl} highlighted />
      ) : (
        <div className="grid min-h-72 place-items-center rounded-md border border-dashed border-white/12 bg-white/[0.025] px-5 text-center md:min-h-[460px]">
          <div>
            <PreviewIcon />
            <p className="mt-4 text-sm font-black text-slate-300">
              생성 결과가 여기에 표시됩니다
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function ResultCard({
  highlighted = false,
  label,
  src,
}: {
  highlighted?: boolean
  label: string
  src: string
}) {
  return (
    <figure
      className={`overflow-hidden rounded-md border bg-black/25 ${
        highlighted ? 'border-cyan-300/40' : 'border-white/10'
      }`}
    >
      <figcaption className="border-b border-white/10 px-4 py-3 text-xs font-black text-slate-300">
        {label}
      </figcaption>
      <div className="grid min-h-72 place-items-center md:min-h-[420px]">
        <img src={src} alt={label} className="max-h-[620px] w-full object-contain" />
      </div>
    </figure>
  )
}

function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="mx-auto h-9 w-9 text-cyan-200"
    >
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
      <path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" />
    </svg>
  )
}

function PreviewIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="mx-auto h-11 w-11 text-slate-600"
    >
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m5.5 17 4.2-4 3.1 2.7 2.3-2 3.4 3.3" />
    </svg>
  )
}

async function normalizeImageForUpload(file: File) {
  const image = await loadImage(file)
  const scale = Math.min(1, uploadMaxDimension / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas is not available.')
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.88)
  })

  if (!blob) {
    throw new Error('Image compression failed.')
  }

  return new File([blob], `${stripExtension(file.name)}.jpg`, {
    type: 'image/jpeg',
  })
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image decode failed.'))
    }
    image.src = url
  })
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') || 'source-image'
}
