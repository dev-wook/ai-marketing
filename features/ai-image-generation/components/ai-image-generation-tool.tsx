'use client'

import NextImage from 'next/image'
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from 'react'
import { ToolErrorMessage } from '@/features/platform/components/tool-ui'
import { aiImageDesignModels } from '../catalog'
import {
  aiImageCompositions,
  backgroundOptions,
  eyeStateOptions,
  handPoseOptions,
  maskOptions,
} from '../generation-options'
import type {
  AiImageAspectRatio,
  AiImageBackground,
  AiImageCompositionId,
  AiImageDesignModelId,
  AiImageEditTarget,
  AiImageEyeState,
  AiImageGenerationMode,
  AiImageGenerationResponse,
  AiImageHandPose,
  AiImageMaskOption,
} from '../types'

const acceptedFileTypes = ['image/jpeg', 'image/png', 'image/webp']
const maxSourceBytes = 15 * 1024 * 1024
const uploadMaxDimension = 1600
const maxPromptLength = 600

const targets: Array<{
  value: AiImageEditTarget
  label: string
  description: string
}> = [
  { value: 'eyelashes', label: '속눈썹', description: '컬·길이·밀도' },
  { value: 'eyebrows', label: '눈썹', description: '결·형태·색상' },
  { value: 'eye-makeup', label: '아이 메이크업', description: '섀도·아이라인' },
  { value: 'hair', label: '헤어', description: '스타일·컬러' },
  { value: 'lips', label: '입술', description: '컬러·질감' },
  { value: 'overall', label: '전체 스타일', description: '전체 분위기' },
]

const promptSuggestions = [
  '20대 한국인 여성이 밝은 스튜디오에서 정면을 바라보는 자연스러운 뷰티 화보',
  '화이트 배경에 투명한 향수병이 놓인 고급 화장품 광고 이미지',
  '창가에서 책을 바라보는 갈색 푸들, 따뜻한 자연광의 사진',
]
const aspectRatioOptions: AiImageAspectRatio[] = [
  '1:1',
  '3:4',
  '4:5',
  '4:3',
  '16:9',
  '9:16',
]

type SourceImage = {
  file: File
  previewUrl: string
}

type WatermarkPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'center'

type GalleryItem = {
  id: string
  imageDataUrl: string
  createdAt: number
  mode: AiImageGenerationMode
  label: string
}

const galleryStorageKey = 'aiva.aiImageGeneration.gallery.v1'
const maxGalleryItems = 10
const watermarkPositions: Array<{ value: WatermarkPosition; label: string }> = [
  { value: 'top-left', label: '왼쪽 위' },
  { value: 'top-center', label: '위 가운데' },
  { value: 'top-right', label: '오른쪽 위' },
  { value: 'middle-left', label: '왼쪽 가운데' },
  { value: 'center', label: '가운데' },
  { value: 'middle-right', label: '오른쪽 가운데' },
  { value: 'bottom-left', label: '왼쪽 아래' },
  { value: 'bottom-center', label: '아래 가운데' },
  { value: 'bottom-right', label: '오른쪽 아래' },
]

export function AiImageGenerationTool() {
  const inputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<AiImageGenerationMode>('partial')
  const [selectedModelId, setSelectedModelId] =
    useState<AiImageDesignModelId>('model-a')
  const [compositionId, setCompositionId] = useState<AiImageCompositionId>('front')
  const [maskOption, setMaskOption] = useState<AiImageMaskOption>('none')
  const [eyeState, setEyeState] = useState<AiImageEyeState>('open')
  const [handPose, setHandPose] = useState<AiImageHandPose>('none')
  const [background, setBackground] =
    useState<AiImageBackground>('bright-studio')
  const [target, setTarget] = useState<AiImageEditTarget>('eyelashes')
  const [aspectRatio, setAspectRatio] = useState<AiImageAspectRatio>('1:1')
  const [prompt, setPrompt] = useState('')
  const [sourceImage, setSourceImage] = useState<SourceImage | null>(null)
  const [logoImage, setLogoImage] = useState<SourceImage | null>(null)
  const [isWatermarkEnabled, setIsWatermarkEnabled] = useState(false)
  const [watermarkPosition, setWatermarkPosition] =
    useState<WatermarkPosition>('bottom-right')
  const [watermarkSize, setWatermarkSize] = useState(18)
  const [resultImageUrl, setResultImageUrl] = useState('')
  const [displayImageUrl, setDisplayImageUrl] = useState('')
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [debugLog, setDebugLog] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [hasConsent, setHasConsent] = useState(false)
  const selectedModel =
    aiImageDesignModels.find((model) => model.id === selectedModelId) ??
    aiImageDesignModels[0]
  const selectedComposition =
    aiImageCompositions.find((composition) => composition.id === compositionId) ??
    aiImageCompositions[0]
  const requiresImage = mode === 'partial'
  const canGenerate =
    !isGenerating &&
    (mode === 'partial' ? Boolean(sourceImage) : prompt.trim().length >= 3) &&
    (!sourceImage || hasConsent)

  useEffect(() => {
    return () => {
      if (sourceImage) {
        URL.revokeObjectURL(sourceImage.previewUrl)
      }
    }
  }, [sourceImage])

  useEffect(() => {
    return () => {
      if (logoImage) {
        URL.revokeObjectURL(logoImage.previewUrl)
      }
    }
  }, [logoImage])

  useEffect(() => {
    setGalleryItems(readGalleryItems())
  }, [])

  useEffect(() => {
    let cancelled = false

    async function updateDisplayImage() {
      if (!resultImageUrl) {
        setDisplayImageUrl('')
        return
      }

      if (!isWatermarkEnabled || !logoImage) {
        setDisplayImageUrl(resultImageUrl)
        return
      }

      try {
        const watermarked = await applyLogoWatermark({
          imageDataUrl: resultImageUrl,
          logoUrl: logoImage.previewUrl,
          position: watermarkPosition,
          sizePercent: watermarkSize,
        })

        if (!cancelled) {
          setDisplayImageUrl(watermarked)
        }
      } catch {
        if (!cancelled) {
          setDisplayImageUrl(resultImageUrl)
        }
      }
    }

    void updateDisplayImage()

    return () => {
      cancelled = true
    }
  }, [
    isWatermarkEnabled,
    logoImage,
    resultImageUrl,
    watermarkPosition,
    watermarkSize,
  ])

  const clearFeedback = () => {
    setErrorMessage('')
    setDebugLog('')
    setResultImageUrl('')
    setDisplayImageUrl('')
  }

  const clearError = () => {
    setErrorMessage('')
    setDebugLog('')
  }

  const selectComposition = (nextId: AiImageCompositionId) => {
    const nextComposition = aiImageCompositions.find(
      (composition) => composition.id === nextId,
    )

    if (!nextComposition) {
      return
    }

    setCompositionId(nextId)
    if (!nextComposition.supportsMask) {
      setMaskOption('none')
    }
    if (!nextComposition.supportsHandPose) {
      setHandPose('none')
    }
    if (!nextComposition.allowedBackgrounds.includes(background)) {
      setBackground(nextComposition.allowedBackgrounds[0])
    }
    clearFeedback()
  }

  const selectFile = async (file?: File) => {
    clearFeedback()

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
      setHasConsent(false)
    } catch {
      setErrorMessage('이미지를 읽을 수 없습니다. 다른 파일을 선택해주세요.')
    }
  }

  const removeSourceImage = () => {
    setSourceImage((current) => {
      if (current) {
        URL.revokeObjectURL(current.previewUrl)
      }
      return null
    })
    setHasConsent(false)
    clearFeedback()
  }

  const selectLogoFile = (file?: File) => {
    clearError()

    if (!file) {
      return
    }

    if (!acceptedFileTypes.includes(file.type)) {
      setErrorMessage('로고는 JPG, PNG, WEBP 이미지만 사용할 수 있습니다.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('로고 이미지는 5MB 이하로 업로드해주세요.')
      return
    }

    setLogoImage((current) => {
      if (current) {
        URL.revokeObjectURL(current.previewUrl)
      }

      return {
        file,
        previewUrl: URL.createObjectURL(file),
      }
    })
    setIsWatermarkEnabled(true)
  }

  const removeLogoImage = () => {
    setLogoImage((current) => {
      if (current) {
        URL.revokeObjectURL(current.previewUrl)
      }
      return null
    })
    setIsWatermarkEnabled(false)
  }

  const resetEditor = () => {
    setMode('partial')
    setSelectedModelId('model-a')
    setCompositionId('front')
    setMaskOption('none')
    setEyeState('open')
    setHandPose('none')
    setBackground('bright-studio')
    setTarget('eyelashes')
    setAspectRatio('1:1')
    setPrompt('')
    removeLogoImage()
    removeSourceImage()
  }

  const saveCurrentImageToGallery = async () => {
    if (!displayImageUrl) {
      return
    }

    try {
      const storedImage = await compressImageDataUrl(displayImageUrl)
      const nextItem: GalleryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        imageDataUrl: storedImage,
        createdAt: Date.now(),
        mode,
        label:
          mode === 'partial'
            ? `${selectedModel.name} · ${selectedComposition.name}`
            : '프롬프트 생성',
      }
      const nextItems = [nextItem, ...galleryItems].slice(0, maxGalleryItems)

      writeGalleryItems(nextItems)
      setGalleryItems(nextItems)
      clearError()
    } catch {
      setErrorMessage('갤러리 저장 공간이 부족합니다. 기존 이미지를 삭제한 뒤 다시 시도해주세요.')
    }
  }

  const loadGalleryItem = (item: GalleryItem) => {
    setResultImageUrl(item.imageDataUrl)
    setDisplayImageUrl(item.imageDataUrl)
    setIsWatermarkEnabled(false)
    clearError()
  }

  const removeGalleryItem = (itemId: string) => {
    const nextItems = galleryItems.filter((item) => item.id !== itemId)

    writeGalleryItems(nextItems)
    setGalleryItems(nextItems)
  }

  const generateImage = async () => {
    if (!canGenerate) {
      return
    }

    const previousResultUrl = mode === 'prompt' ? resultImageUrl : ''
    setIsGenerating(true)
    clearFeedback()

    try {
      const formData = new FormData()
      formData.append('category', 'eyelash')
      formData.append('mode', mode)
      formData.append('aspectRatio', aspectRatio)
      formData.append('prompt', prompt.trim())

      if (mode === 'partial') {
        formData.append('modelId', selectedModelId)
        formData.append('target', target)
        formData.append('compositionId', compositionId)
        formData.append('maskOption', maskOption)
        formData.append('eyeState', eyeState)
        formData.append('handPose', handPose)
        formData.append('background', background)
      }

      if (mode === 'partial' && sourceImage) {
        formData.append('image', sourceImage.file)
      }

      if (mode === 'prompt' && previousResultUrl) {
        formData.append('image', await dataUrlToUploadFile(previousResultUrl))
      } else if (mode === 'prompt' && sourceImage) {
        formData.append('image', sourceImage.file)
      }

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
        setResultImageUrl(previousResultUrl)
        setErrorMessage(
          data?.message ?? 'AI 이미지 생성에 실패했습니다. 잠시 후 다시 시도해주세요.',
        )
        setDebugLog(data?.debug ?? '')
        return
      }

      setResultImageUrl(data.imageDataUrl)
      if (mode === 'prompt') {
        setPrompt('')
      }
    } catch (error) {
      setResultImageUrl(previousResultUrl)
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

  const handleLogoInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    selectLogoFile(event.target.files?.[0])
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    void selectFile(event.dataTransfer.files?.[0])
  }

  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-[#0a111d] shadow-[0_30px_90px_rgba(0,0,0,0.3)]">
      <header className="flex flex-col gap-4 border-b border-white/10 bg-gradient-to-r from-cyan-300/[0.08] via-transparent to-fuchsia-300/[0.07] px-5 py-5 md:flex-row md:items-center md:justify-between md:px-7">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/75">
            AI Beauty Studio
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.03em] text-white md:text-3xl">
            이미지 스튜디오
          </h1>
          <p className="mt-2 break-keep text-sm font-semibold text-slate-400">
            프롬프트로 새 이미지를 만들거나, 선택한 모델에 사진의 특정 영역만 적용하세요.
          </p>
        </div>
        <div className="inline-flex w-fit rounded-lg border border-white/10 bg-black/25 p-1">
          <ModeButton
            active={mode === 'partial'}
            label="모델 적용"
            onClick={() => {
              setMode('partial')
              clearFeedback()
            }}
          />
          <ModeButton
            active={mode === 'prompt'}
            label="프롬프트 생성"
            onClick={() => {
              setMode('prompt')
              clearFeedback()
            }}
          />
        </div>
      </header>

      <div className="grid min-w-0 xl:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="flex min-w-0 flex-col border-b border-white/10 bg-[#0d1624] xl:max-h-[calc(100vh-2rem)] xl:border-b-0 xl:border-r">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 md:px-7 md:py-7">
          <div className="grid gap-7">
            {mode === 'partial' ? (
            <ControlSection eyebrow="01" title="기준 모델">
              <div className="grid grid-cols-3 gap-2.5">
                {aiImageDesignModels.map((model) => {
                  const selected = model.id === selectedModelId

                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        setSelectedModelId(model.id)
                        clearFeedback()
                      }}
                      aria-pressed={selected}
                      disabled={isGenerating}
                      className={`group overflow-hidden rounded-lg border text-left transition focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/20 disabled:opacity-50 ${
                        selected
                          ? 'border-cyan-200/70 bg-cyan-300/10 shadow-[0_0_24px_rgba(34,211,238,0.11)]'
                          : 'border-white/10 bg-white/[0.035] hover:border-white/25'
                      }`}
                    >
                      <span className="relative block aspect-[4/5] overflow-hidden bg-black/30">
                        <NextImage
                          src={model.thumbnailPath}
                          alt=""
                          fill
                          sizes="120px"
                          className="object-cover transition duration-300 group-hover:scale-[1.03]"
                        />
                        {selected ? (
                          <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-cyan-200 text-xs font-black text-[#07111d]">
                            ✓
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate px-2.5 py-2.5 text-xs font-black text-white">
                        {model.name}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-3 break-keep text-xs font-semibold leading-5 text-slate-500">
                {selectedModel.description}
              </p>
            </ControlSection>
            ) : null}

            {mode === 'partial' ? (
              <ControlSection eyebrow="02" title="촬영 구도">
                <div className="grid min-w-0 grid-cols-4 gap-2">
                  {aiImageCompositions.map((composition) => {
                    const selected = composition.id === compositionId

                    return (
                      <button
                        key={composition.id}
                        type="button"
                        onClick={() => selectComposition(composition.id)}
                        aria-pressed={selected}
                        className="group min-w-0 text-center focus:outline-none"
                      >
                        <span
                          className={`relative grid aspect-square w-full place-items-center overflow-hidden rounded-lg border transition ${
                            selected
                              ? 'border-cyan-100 bg-cyan-300/15 shadow-[0_0_20px_rgba(34,211,238,0.16)] ring-2 ring-cyan-300/15'
                              : 'border-white/10 bg-[#080e18] group-hover:border-cyan-300/30 group-hover:bg-cyan-300/[0.06]'
                          }`}
                        >
                          <CompositionSample
                            alt={`${composition.name} 촬영 구도 표본`}
                            compositionId={composition.id}
                            src={composition.thumbnailPath}
                          />
                          {selected ? (
                            <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-cyan-100 text-[9px] font-black text-[#07111d]">
                              ✓
                            </span>
                          ) : null}
                        </span>
                        <span className={`mt-2 block min-h-8 break-keep text-[9px] font-black leading-4 ${
                          selected ? 'text-cyan-100' : 'text-slate-500'
                        }`}>
                          {composition.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div className="mt-2 rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2.5">
                  <p className="text-xs font-black text-white">{selectedComposition.name}</p>
                  <p className="mt-1 text-[10px] font-semibold text-slate-500">
                    {selectedComposition.description}
                  </p>
                </div>
              </ControlSection>
            ) : null}

            {mode === 'partial' ? (
              <ControlSection eyebrow="03" title="촬영 옵션">
                <div className="grid gap-4 rounded-lg border border-white/10 bg-black/15 p-3.5">
                  {selectedComposition.supportsMask ? (
                    <OptionRow label="마스크">
                      {maskOptions.map((option) => (
                        <OptionChip
                          key={option.value}
                          active={maskOption === option.value}
                          label={option.label}
                          onClick={() => {
                            setMaskOption(option.value)
                            clearFeedback()
                          }}
                        />
                      ))}
                    </OptionRow>
                  ) : null}

                  {selectedComposition.supportsEyeState ? (
                    <OptionRow label="눈 상태">
                      {eyeStateOptions.map((option) => (
                        <OptionChip
                          key={option.value}
                          active={eyeState === option.value}
                          label={option.label}
                          onClick={() => {
                            setEyeState(option.value)
                            clearFeedback()
                          }}
                        />
                      ))}
                    </OptionRow>
                  ) : null}

                  {selectedComposition.supportsHandPose ? (
                    <OptionRow label="손 연출">
                      {handPoseOptions.map((option) => (
                        <OptionChip
                          key={option.value}
                          active={handPose === option.value}
                          label={option.label}
                          onClick={() => {
                            setHandPose(option.value)
                            clearFeedback()
                          }}
                        />
                      ))}
                    </OptionRow>
                  ) : null}

                  <OptionRow label="배경">
                    {backgroundOptions
                      .filter((option) =>
                        selectedComposition.allowedBackgrounds.includes(option.value),
                      )
                      .map((option) => (
                        <OptionChip
                          key={option.value}
                          active={background === option.value}
                          label={option.label}
                          onClick={() => {
                            setBackground(option.value)
                            clearFeedback()
                          }}
                        />
                      ))}
                  </OptionRow>
                </div>
              </ControlSection>
            ) : null}

            {mode === 'partial' ? (
              <ControlSection eyebrow="04" title="적용할 영역">
                <div className="grid grid-cols-2 gap-2">
                  {targets.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setTarget(option.value)
                        clearFeedback()
                      }}
                      aria-pressed={target === option.value}
                      className={`rounded-lg border px-3 py-2.5 text-left transition ${
                        target === option.value
                          ? 'border-cyan-200/55 bg-cyan-300/10 text-white'
                          : 'border-white/10 bg-white/[0.025] text-slate-400 hover:border-white/20'
                      }`}
                    >
                      <span className="block text-xs font-black">{option.label}</span>
                      <span className="mt-1 block text-[10px] font-semibold text-slate-500">
                        {option.description}
                      </span>
                    </button>
                  ))}
                </div>
              </ControlSection>
            ) : null}

            <ControlSection
              eyebrow={mode === 'partial' ? '05' : '01'}
              title={mode === 'partial' ? '추가 요청' : '이미지 설명'}
              required={mode === 'prompt'}
            >
              <div className="overflow-hidden rounded-lg border border-white/15 bg-black/20 focus-within:border-cyan-300/45 focus-within:ring-4 focus-within:ring-cyan-300/10">
                <textarea
                  value={prompt}
                  onChange={(event) => {
                    setPrompt(event.target.value.slice(0, maxPromptLength))
                    if (mode === 'prompt') {
                      clearError()
                    } else {
                      clearFeedback()
                    }
                  }}
                  placeholder={
                    mode === 'prompt'
                      ? resultImageUrl
                        ? '현재 결과에서 바꾸고 싶은 내용을 입력해주세요.'
                        : sourceImage
                          ? '업로드한 이미지에서 바꾸고 싶은 내용을 입력해주세요.'
                          : '주체, 행동이나 목적, 배경, 표현 방식을 구체적으로 설명해주세요.'
                      : '선택 영역에 필요한 추가 요청을 입력하세요. 선택 사항입니다.'
                  }
                  rows={5}
                  className="w-full resize-none bg-transparent px-4 py-3 text-sm font-semibold leading-6 text-white outline-none placeholder:text-slate-600"
                />
                <div className="flex justify-end border-t border-white/8 px-3 py-2 text-[10px] font-bold text-slate-600">
                  {prompt.length}/{maxPromptLength}
                </div>
              </div>
              {mode === 'prompt' ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {promptSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        setPrompt(suggestion)
                        clearError()
                      }}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-bold text-slate-400 transition hover:border-cyan-300/30 hover:text-cyan-100"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </ControlSection>

            <ControlSection eyebrow={mode === 'partial' ? '06' : '02'} title="이미지 비율">
              <div className="grid grid-cols-3 gap-2">
                {aspectRatioOptions.map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => {
                      setAspectRatio(ratio)
                      if (mode === 'prompt') {
                        clearError()
                      } else {
                        clearFeedback()
                      }
                    }}
                    aria-pressed={aspectRatio === ratio}
                    className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border text-xs font-black transition ${
                      aspectRatio === ratio
                        ? 'border-white/70 bg-white text-[#07111d]'
                        : 'border-white/10 bg-white/[0.025] text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <RatioIcon ratio={ratio} />
                    {ratio}
                  </button>
                ))}
              </div>
            </ControlSection>

            <ControlSection
              eyebrow={mode === 'partial' ? '07' : '03'}
              title="로고 워터마크"
              help="선택 사항"
            >
              <input
                ref={logoInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={handleLogoInputChange}
                className="sr-only"
              />
              <div className="grid gap-3 rounded-lg border border-white/10 bg-black/15 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-white">결과 이미지에 로고 삽입</p>
                    <p className="mt-1 text-[10px] font-semibold text-slate-500">
                      다운로드와 갤러리 저장 이미지에 반영됩니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsWatermarkEnabled((current) => !current)}
                    disabled={!logoImage}
                    aria-pressed={isWatermarkEnabled}
                    className={`h-7 w-12 rounded-full border p-0.5 transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      isWatermarkEnabled
                        ? 'border-cyan-200/60 bg-cyan-300/25'
                        : 'border-white/10 bg-white/[0.04]'
                    }`}
                  >
                    <span
                      className={`block h-5 w-5 rounded-full bg-white transition ${
                        isWatermarkEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {logoImage ? (
                  <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3 rounded-lg border border-white/8 bg-white/[0.025] p-2.5">
                    <img
                      src={logoImage.previewUrl}
                      alt="로고 미리보기"
                      className="h-12 w-16 rounded-md bg-black/40 object-contain p-1"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-black text-white">
                        {logoImage.file.name}
                      </p>
                      <div className="mt-1.5 flex gap-2">
                        <button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          className="text-[10px] font-black text-cyan-200"
                        >
                          변경
                        </button>
                        <button
                          type="button"
                          onClick={removeLogoImage}
                          className="text-[10px] font-black text-slate-500"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="flex min-h-16 items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.025] px-4 text-xs font-black text-slate-300 transition hover:border-cyan-300/35 hover:text-cyan-100"
                  >
                    로고 이미지 선택
                  </button>
                )}

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-slate-500">로고 위치</p>
                    <p className="text-[10px] font-bold text-slate-600">
                      {watermarkPositions.find((item) => item.value === watermarkPosition)?.label}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-white/8 bg-black/20 p-1.5">
                    {watermarkPositions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setWatermarkPosition(option.value)}
                        aria-label={`로고 위치 ${option.label}`}
                        aria-pressed={watermarkPosition === option.value}
                        className={`grid aspect-square place-items-center rounded-md border transition ${
                          watermarkPosition === option.value
                            ? 'border-cyan-200/70 bg-cyan-300/15 shadow-[0_0_18px_rgba(34,211,238,0.12)]'
                            : 'border-white/8 bg-white/[0.025] hover:border-cyan-300/30'
                        }`}
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-sm ${
                            watermarkPosition === option.value
                              ? 'bg-cyan-100'
                              : 'bg-slate-600'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 rounded-lg border border-white/8 bg-white/[0.025] p-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3">
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[10px] font-black text-slate-500">로고 크기</p>
                        <p className="text-[10px] font-black text-cyan-100">{watermarkSize}%</p>
                      </div>
                      <input
                        type="range"
                        min={8}
                        max={36}
                        step={1}
                        value={watermarkSize}
                        onChange={(event) => setWatermarkSize(Number(event.target.value))}
                        className="w-full accent-cyan-300"
                      />
                    </div>
                    <WatermarkSizePreview
                      logoUrl={logoImage?.previewUrl}
                      position={watermarkPosition}
                      sizePercent={watermarkSize}
                    />
                  </div>
                  <p className="break-keep text-[10px] font-semibold leading-4 text-slate-500">
                    미리보기의 작은 박스가 결과 이미지에서 로고가 차지할 대략적인 크기입니다.
                  </p>
                </div>
              </div>
            </ControlSection>

            <ControlSection
              eyebrow={mode === 'partial' ? '08' : '04'}
              title={mode === 'partial' ? '적용할 사진' : '기준 이미지'}
              required={requiresImage}
              help={mode === 'prompt' ? '선택 사항' : undefined}
            >
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
                className={`overflow-hidden rounded-lg border border-dashed transition ${
                  isDragging
                    ? 'border-cyan-200 bg-cyan-300/10'
                    : 'border-white/15 bg-black/20'
                }`}
              >
                {sourceImage ? (
                  <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3 p-3">
                    <img
                      src={sourceImage.previewUrl}
                      alt="업로드 이미지 미리보기"
                      className="h-20 w-[92px] rounded-md bg-black/30 object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black text-white">
                        {sourceImage.file.name}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold text-slate-500">
                        {(sourceImage.file.size / 1024 / 1024).toFixed(1)}MB · 업로드 준비 완료
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => inputRef.current?.click()}
                          className="text-[10px] font-black text-cyan-200"
                        >
                          변경
                        </button>
                        <button
                          type="button"
                          onClick={removeSourceImage}
                          className="text-[10px] font-black text-slate-500"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="flex min-h-28 w-full items-center justify-center gap-3 px-4 py-5 text-left"
                  >
                    <UploadIcon />
                    <span>
                      <span className="block text-xs font-black text-white">
                        사진을 끌어놓거나 선택
                      </span>
                      <span className="mt-1 block text-[10px] font-semibold text-slate-500">
                        JPG, PNG, WEBP · 최대 15MB
                      </span>
                    </span>
                  </button>
                )}
              </div>
            </ControlSection>

            {sourceImage ? (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-white/[0.025] p-3.5">
                <input
                  type="checkbox"
                  checked={hasConsent}
                  onChange={(event) => setHasConsent(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-cyan-300"
                />
                <span className="break-keep text-[11px] font-semibold leading-5 text-slate-400">
                  사진 사용 권한과 고객의 AI 이미지 처리 동의를 확인했습니다.
                </span>
              </label>
            ) : null}

            <ToolErrorMessage message={errorMessage} log={debugLog} />
          </div>
          </div>

          <GenerationActionBar
            canGenerate={canGenerate}
            isGenerating={isGenerating}
            mode={mode}
            resultImageUrl={resultImageUrl}
            selectedCompositionName={mode === 'partial' ? selectedComposition.name : undefined}
            selectedModelName={mode === 'partial' ? selectedModel.name : undefined}
            onGenerate={generateImage}
            onReset={resetEditor}
          />
        </aside>

        <main className="min-w-0 bg-[#080e18] p-4 md:p-7">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <StudioBadge label={mode === 'partial' ? '모델 적용' : '프롬프트 생성'} />
              {mode === 'partial' ? <StudioBadge label={selectedModel.name} /> : null}
              {mode === 'partial' ? <StudioBadge label={selectedComposition.name} /> : null}
              <StudioBadge label={aspectRatio} />
              {mode === 'prompt' && resultImageUrl ? (
                <StudioBadge label="연속 수정 준비" />
              ) : null}
              {mode === 'partial' ? (
                <StudioBadge label={targets.find((item) => item.value === target)?.label ?? ''} />
              ) : null}
            </div>
            {displayImageUrl ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveCurrentImageToGallery()}
                  className="flex min-h-10 w-fit items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 text-xs font-black text-slate-200 transition hover:border-cyan-300/35 hover:text-cyan-100"
                >
                  <GalleryIcon />
                  갤러리에 저장
                </button>
                <button
                  type="button"
                  onClick={() => downloadImage(displayImageUrl)}
                  className="flex min-h-10 w-fit items-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3.5 text-xs font-black text-cyan-100 transition hover:border-cyan-200/50"
                >
                  <DownloadIcon />
                  다운로드
                </button>
              </div>
            ) : null}
          </div>

          {isGenerating ? (
            <ImageGenerationSkeleton
              aspectRatio={aspectRatio}
              mode={mode}
            />
          ) : (
            <StudioCanvas
              aspectRatio={aspectRatio}
              resultUrl={displayImageUrl}
            />
          )}

          <GalleryPanel
            items={galleryItems}
            onLoad={loadGalleryItem}
            onRemove={removeGalleryItem}
          />
        </main>
      </div>
    </section>
  )
}

function ImageGenerationSkeleton({
  aspectRatio,
  mode,
}: {
  aspectRatio: AiImageAspectRatio
  mode: AiImageGenerationMode
}) {
  return (
    <div className="relative grid min-h-[520px] place-items-center overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_45%),linear-gradient(145deg,#101a29,#070c14)] p-4 md:min-h-[720px] md:p-8">
      <div
        className={`relative grid max-h-[780px] w-full place-items-center overflow-hidden rounded-lg border border-white/10 bg-[#111b29] shadow-[0_28px_80px_rgba(0,0,0,0.4)] ${getAspectRatioFrameClass(aspectRatio)}`}
      >
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/[0.035] via-cyan-300/[0.09] to-fuchsia-300/[0.05]" />
        <div className="absolute inset-0 -translate-x-full animate-[aiva-loading_2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

        <div className="relative z-10 grid max-w-xs place-items-center px-6 text-center">
          <span className="relative grid h-14 w-14 place-items-center rounded-2xl border border-cyan-200/20 bg-[#09131f]/80">
            <span className="absolute inset-2 animate-ping rounded-xl bg-cyan-300/10" />
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-100/20 border-t-cyan-200" />
          </span>
          <p className="mt-5 text-sm font-black text-white">
            {mode === 'partial' ? '모델에 이미지를 적용하고 있어요' : '이미지를 생성하고 있어요'}
          </p>
          <p className="mt-2 break-keep text-xs font-semibold leading-5 text-slate-400">
            {mode === 'partial'
              ? '선택 영역과 모델의 자연스러운 연결을 정리하고 있습니다.'
              : '프롬프트를 분석해 장면과 디테일을 구성하고 있습니다.'}
          </p>
          <div className="mt-5 flex items-center gap-1.5">
            <span className="h-1.5 w-8 animate-pulse rounded-full bg-cyan-200" />
            <span className="h-1.5 w-8 animate-pulse rounded-full bg-cyan-200/40 [animation-delay:250ms]" />
            <span className="h-1.5 w-8 animate-pulse rounded-full bg-white/10 [animation-delay:500ms]" />
          </div>
        </div>

        <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-[#07111d]/70 px-3 py-1.5 text-[10px] font-black text-cyan-100 backdrop-blur">
          AI 생성 중
        </span>
      </div>
    </div>
  )
}

function GenerationActionBar({
  canGenerate,
  isGenerating,
  mode,
  onGenerate,
  onReset,
  resultImageUrl,
  selectedCompositionName,
  selectedModelName,
}: {
  canGenerate: boolean
  isGenerating: boolean
  mode: AiImageGenerationMode
  onGenerate: () => void
  onReset: () => void
  resultImageUrl: string
  selectedCompositionName?: string
  selectedModelName?: string
}) {
  const actionLabel = isGenerating
    ? '이미지 생성 중'
    : mode === 'prompt' && resultImageUrl
      ? '현재 결과 수정하기'
      : 'AI 이미지 생성'

  return (
    <div className="shrink-0 border-t border-white/10 bg-[#0d1624]/98 p-4 shadow-[0_-18px_40px_rgba(0,0,0,0.22)] backdrop-blur md:px-5">
      <div className="mb-3 rounded-lg border border-white/8 bg-black/20 px-3 py-2.5">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-300/65">
          생성 준비
        </p>
        <p className="mt-1 truncate text-xs font-black text-white">
          {mode === 'partial'
            ? `${selectedModelName ?? '모델'} · ${selectedCompositionName ?? '구도'}`
            : resultImageUrl
              ? '현재 결과 이어서 수정'
              : '프롬프트로 새 이미지 생성'}
        </p>
      </div>
      <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
        <button
          type="button"
          onClick={onReset}
          disabled={isGenerating}
          className="min-h-12 rounded-lg border border-white/10 bg-white/[0.04] text-xs font-black text-slate-300 transition hover:border-white/20 disabled:opacity-45"
        >
          초기화
        </button>
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate}
          className="min-h-12 rounded-lg bg-white px-5 text-sm font-black text-[#07111d] transition hover:bg-cyan-50 focus:outline-none focus:ring-4 focus:ring-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  )
}

function OptionRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-black text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function WatermarkSizePreview({
  logoUrl,
  position,
  sizePercent,
}: {
  logoUrl?: string
  position: WatermarkPosition
  sizePercent: number
}) {
  const previewSize = Math.max(14, Math.round(72 * (sizePercent / 100)))

  return (
    <div className="relative aspect-square w-[88px] overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(135deg,#172235,#070d17)]">
      <div className="absolute inset-2 rounded-md border border-dashed border-white/10 bg-cyan-300/[0.03]" />
      <div
        className="absolute grid place-items-center overflow-hidden rounded bg-white/90 p-1 shadow-[0_0_14px_rgba(34,211,238,0.2)]"
        style={{
          ...getWatermarkPreviewStyle(position),
          height: previewSize,
          width: previewSize,
        }}
      >
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="text-[7px] font-black text-[#07111d]">LOGO</span>
        )}
      </div>
    </div>
  )
}

function getWatermarkPreviewStyle(position: WatermarkPosition) {
  const offset = 10

  if (position === 'top-left') {
    return { left: offset, top: offset }
  }
  if (position === 'top-center') {
    return { left: '50%', top: offset, transform: 'translateX(-50%)' }
  }
  if (position === 'top-right') {
    return { right: offset, top: offset }
  }
  if (position === 'middle-left') {
    return { left: offset, top: '50%', transform: 'translateY(-50%)' }
  }
  if (position === 'middle-right') {
    return { right: offset, top: '50%', transform: 'translateY(-50%)' }
  }
  if (position === 'bottom-left') {
    return { bottom: offset, left: offset }
  }
  if (position === 'bottom-center') {
    return { bottom: offset, left: '50%', transform: 'translateX(-50%)' }
  }
  if (position === 'center') {
    return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  }

  return { bottom: offset, right: offset }
}

function OptionChip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md border px-2.5 py-1.5 text-[10px] font-black transition ${
        active
          ? 'border-cyan-200/55 bg-cyan-300/12 text-cyan-50'
          : 'border-white/10 bg-white/[0.025] text-slate-500 hover:border-white/20'
      }`}
    >
      {label}
    </button>
  )
}

function CompositionSample({
  alt,
  compositionId,
  src,
}: {
  alt: string
  compositionId: AiImageCompositionId
  src: string
}) {
  return (
    <span className="relative block h-full w-full overflow-hidden bg-[#080e18]">
      <NextImage
        src={src}
        alt={alt}
        fill
        sizes="90px"
        className={`object-cover ${
          compositionId === 'right-angle' ? '-scale-x-100' : ''
        }`}
      />
      <span className="absolute inset-0 bg-gradient-to-t from-[#07111d]/30 via-transparent to-transparent" />
    </span>
  )
}

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-10 rounded-md px-4 text-xs font-black transition ${
        active ? 'bg-white text-[#07111d]' : 'text-slate-400 hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}

function ControlSection({
  children,
  eyebrow,
  help,
  required = false,
  title,
}: {
  children: ReactNode
  eyebrow: string
  help?: string
  required?: boolean
  title: string
}) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[10px] font-black tracking-[0.15em] text-cyan-300/65">
          {eyebrow}
        </span>
        <h2 className="text-sm font-black text-white">{title}</h2>
        {required ? (
          <span className="rounded-full bg-cyan-300/10 px-2 py-0.5 text-[9px] font-black text-cyan-200">
            필수
          </span>
        ) : null}
        {help ? <span className="text-[10px] font-bold text-slate-600">{help}</span> : null}
      </div>
      {children}
    </section>
  )
}

function StudioCanvas({
  aspectRatio,
  resultUrl,
}: {
  aspectRatio: AiImageAspectRatio
  resultUrl: string
}) {
  return (
    <div className="relative grid min-h-[520px] place-items-center overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_45%),linear-gradient(145deg,#101a29,#070c14)] p-4 md:min-h-[720px] md:p-8">
      {resultUrl ? (
      <div
        className={`relative grid max-h-[780px] w-full place-items-center overflow-hidden rounded-lg border border-cyan-300/30 bg-black/35 shadow-[0_28px_80px_rgba(0,0,0,0.45)] ${getAspectRatioFrameClass(aspectRatio)}`}
      >
        <img
          src={resultUrl}
          alt="AI 생성 결과"
          className="h-full w-full object-contain"
        />
        <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-[#07111d]/80 px-3 py-1.5 text-[10px] font-black text-white backdrop-blur">
          생성 결과
        </span>
      </div>
      ) : (
        <div className="grid max-w-md place-items-center px-6 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-2xl text-cyan-100">
            ✦
          </div>
          <p className="mt-5 text-lg font-black text-white">결과 이미지가 여기에 표시됩니다</p>
          <p className="mt-2 break-keep text-xs font-semibold leading-6 text-slate-500">
            왼쪽에서 설정을 선택하고 AI 이미지 생성을 실행해주세요.
          </p>
        </div>
      )}

    </div>
  )
}

function GalleryPanel({
  items,
  onLoad,
  onRemove,
}: {
  items: GalleryItem[]
  onLoad: (item: GalleryItem) => void
  onRemove: (itemId: string) => void
}) {
  return (
    <section className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-black text-white">로컬 갤러리</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-500">
            브라우저에 최대 {maxGalleryItems}개까지 저장됩니다. 새로고침 후에도 유지됩니다.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-black text-slate-400">
          {items.length}/{maxGalleryItems}
        </span>
      </div>

      {items.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((item) => (
            <article
              key={item.id}
              className="group overflow-hidden rounded-lg border border-white/10 bg-[#07111d]"
            >
              <button
                type="button"
                onClick={() => onLoad(item)}
                className="relative block aspect-square w-full overflow-hidden bg-black/30"
              >
                <img
                  src={item.imageDataUrl}
                  alt="갤러리 이미지"
                  className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                />
                <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[9px] font-black text-white backdrop-blur">
                  불러오기
                </span>
              </button>
              <div className="grid gap-2 p-2.5">
                <p className="truncate text-[10px] font-black text-slate-300">
                  {item.label}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[9px] font-semibold text-slate-600">
                    {formatGalleryDate(item.createdAt)}
                  </p>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="text-[10px] font-black text-slate-500 transition hover:text-rose-200"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-4 grid min-h-28 place-items-center rounded-lg border border-dashed border-white/10 bg-black/15 px-4 text-center">
          <p className="break-keep text-xs font-semibold text-slate-500">
            마음에 드는 결과가 나오면 상단의 갤러리에 저장 버튼을 눌러 보관하세요.
          </p>
        </div>
      )}
    </section>
  )
}

function StudioBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black text-slate-300">
      {label}
    </span>
  )
}

function RatioIcon({ ratio }: { ratio: AiImageAspectRatio }) {
  return (
    <span
      aria-hidden="true"
      className={`block border-2 border-current ${getRatioIconClass(ratio)}`}
    />
  )
}

function getAspectRatioFrameClass(ratio: AiImageAspectRatio) {
  if (ratio === '1:1') {
    return 'max-w-[700px] aspect-square'
  }
  if (ratio === '3:4') {
    return 'max-w-[570px] aspect-[3/4]'
  }
  if (ratio === '4:5') {
    return 'max-w-[600px] aspect-[4/5]'
  }
  if (ratio === '4:3') {
    return 'max-w-[760px] aspect-[4/3]'
  }
  if (ratio === '16:9') {
    return 'max-w-[860px] aspect-video'
  }

  return 'max-w-[430px] aspect-[9/16]'
}

function getRatioIconClass(ratio: AiImageAspectRatio) {
  if (ratio === '1:1') {
    return 'h-3.5 w-3.5'
  }
  if (ratio === '3:4') {
    return 'h-4 w-3'
  }
  if (ratio === '4:5') {
    return 'h-4 w-[13px]'
  }
  if (ratio === '4:3') {
    return 'h-3 w-4'
  }
  if (ratio === '16:9') {
    return 'h-2.5 w-5'
  }

  return 'h-5 w-2.5'
}

function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="h-8 w-8 shrink-0 text-cyan-200"
    >
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
      <path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
    >
      <path d="M12 4v11m0 0 4-4m-4 4-4-4" />
      <path d="M5 17v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" />
    </svg>
  )
}

function GalleryIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
    >
      <path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 17.5z" />
      <path d="m8 15 2.2-2.2a1 1 0 0 1 1.4 0L14 15.2l1-1a1 1 0 0 1 1.4 0L19 16.8" />
      <path d="M9 9.5h.01" />
    </svg>
  )
}

function downloadImage(imageDataUrl: string) {
  const link = document.createElement('a')
  link.href = imageDataUrl
  link.download = `aiva-ai-image-${Date.now()}.png`
  link.click()
}

async function applyLogoWatermark({
  imageDataUrl,
  logoUrl,
  position,
  sizePercent,
}: {
  imageDataUrl: string
  logoUrl: string
  position: WatermarkPosition
  sizePercent: number
}) {
  const [image, logo] = await Promise.all([
    loadImageFromUrl(imageDataUrl),
    loadImageFromUrl(logoUrl),
  ])
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas is not available.')
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  const maxLogoWidth = canvas.width * (sizePercent / 100)
  const logoScale = maxLogoWidth / (logo.naturalWidth || logo.width)
  const logoWidth = Math.max(1, Math.round((logo.naturalWidth || logo.width) * logoScale))
  const logoHeight = Math.max(1, Math.round((logo.naturalHeight || logo.height) * logoScale))
  const padding = Math.max(12, Math.round(canvas.width * 0.035))
  const { x, y } = getWatermarkCoordinates({
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    logoWidth,
    logoHeight,
    padding,
    position,
  })

  context.globalAlpha = 0.9
  context.drawImage(logo, x, y, logoWidth, logoHeight)
  context.globalAlpha = 1

  return canvas.toDataURL('image/png')
}

function getWatermarkCoordinates({
  canvasHeight,
  canvasWidth,
  logoHeight,
  logoWidth,
  padding,
  position,
}: {
  canvasHeight: number
  canvasWidth: number
  logoHeight: number
  logoWidth: number
  padding: number
  position: WatermarkPosition
}) {
  if (position === 'top-left') {
    return { x: padding, y: padding }
  }
  if (position === 'top-center') {
    return { x: Math.round((canvasWidth - logoWidth) / 2), y: padding }
  }
  if (position === 'top-right') {
    return { x: canvasWidth - logoWidth - padding, y: padding }
  }
  if (position === 'middle-left') {
    return { x: padding, y: Math.round((canvasHeight - logoHeight) / 2) }
  }
  if (position === 'middle-right') {
    return {
      x: canvasWidth - logoWidth - padding,
      y: Math.round((canvasHeight - logoHeight) / 2),
    }
  }
  if (position === 'bottom-left') {
    return { x: padding, y: canvasHeight - logoHeight - padding }
  }
  if (position === 'bottom-center') {
    return {
      x: Math.round((canvasWidth - logoWidth) / 2),
      y: canvasHeight - logoHeight - padding,
    }
  }
  if (position === 'center') {
    return {
      x: Math.round((canvasWidth - logoWidth) / 2),
      y: Math.round((canvasHeight - logoHeight) / 2),
    }
  }

  return {
    x: canvasWidth - logoWidth - padding,
    y: canvasHeight - logoHeight - padding,
  }
}

async function compressImageDataUrl(imageDataUrl: string) {
  const image = await loadImageFromUrl(imageDataUrl)
  const maxDimension = 1200
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
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

  return canvas.toDataURL('image/jpeg', 0.86)
}

function loadImageFromUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image decode failed.'))
    image.src = url
  })
}

function readGalleryItems() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(galleryStorageKey)
    const parsed = raw ? JSON.parse(raw) : []

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter(isGalleryItem)
      .slice(0, maxGalleryItems)
  } catch {
    return []
  }
}

function writeGalleryItems(items: GalleryItem[]) {
  window.localStorage.setItem(
    galleryStorageKey,
    JSON.stringify(items.slice(0, maxGalleryItems)),
  )
}

function isGalleryItem(value: unknown): value is GalleryItem {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const item = value as Partial<GalleryItem>

  return (
    typeof item.id === 'string' &&
    typeof item.imageDataUrl === 'string' &&
    typeof item.createdAt === 'number' &&
    (item.mode === 'partial' || item.mode === 'prompt') &&
    typeof item.label === 'string'
  )
}

function formatGalleryDate(value: number) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

async function dataUrlToUploadFile(imageDataUrl: string) {
  const response = await fetch(imageDataUrl)
  const blob = await response.blob()
  const sourceFile = new File([blob], 'previous-result.png', {
    type: blob.type || 'image/png',
  })

  return normalizeImageForUpload(sourceFile)
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
