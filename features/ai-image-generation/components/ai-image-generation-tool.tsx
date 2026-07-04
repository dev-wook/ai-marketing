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
import type {
  AiImageAspectRatio,
  AiImageDesignModelId,
  AiImageEditTarget,
  AiImageGenerationMode,
  AiImageGenerationResponse,
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
  '밝은 자연광의 고급 뷰티 화보',
  '정면 구도와 밝은 스튜디오 배경',
  '피부 질감은 자연스럽고 선명하게',
]

type SourceImage = {
  file: File
  previewUrl: string
}

export function AiImageGenerationTool() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<AiImageGenerationMode>('partial')
  const [selectedModelId, setSelectedModelId] =
    useState<AiImageDesignModelId>('model-a')
  const [target, setTarget] = useState<AiImageEditTarget>('eyelashes')
  const [aspectRatio, setAspectRatio] = useState<AiImageAspectRatio>('1:1')
  const [prompt, setPrompt] = useState('')
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

  const clearFeedback = () => {
    setErrorMessage('')
    setDebugLog('')
    setResultImageUrl('')
  }

  const clearError = () => {
    setErrorMessage('')
    setDebugLog('')
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

  const resetEditor = () => {
    setMode('partial')
    setSelectedModelId('model-a')
    setTarget('eyelashes')
    setAspectRatio('1:1')
    setPrompt('')
    removeSourceImage()
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
        <aside className="min-w-0 border-b border-white/10 bg-[#0d1624] xl:border-b-0 xl:border-r">
          <div className="grid gap-7 p-5 md:p-7">
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
              <ControlSection eyebrow="02" title="적용할 영역">
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
              eyebrow={mode === 'partial' ? '03' : '01'}
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
                          : '새로 만들 이미지의 분위기, 구도, 배경을 설명해주세요.'
                      : '선택 영역에 필요한 추가 요청을 입력하세요. 선택 사항입니다.'
                  }
                  rows={5}
                  className="w-full resize-none bg-transparent px-4 py-3 text-sm font-semibold leading-6 text-white outline-none placeholder:text-slate-600"
                />
                <div className="flex justify-end border-t border-white/8 px-3 py-2 text-[10px] font-bold text-slate-600">
                  {prompt.length}/{maxPromptLength}
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {promptSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setPrompt(suggestion)
                      if (mode === 'prompt') {
                        clearError()
                      } else {
                        clearFeedback()
                      }
                    }}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-bold text-slate-400 transition hover:border-cyan-300/30 hover:text-cyan-100"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </ControlSection>

            <ControlSection eyebrow={mode === 'partial' ? '04' : '02'} title="이미지 비율">
              <div className="grid grid-cols-3 gap-2">
                {(['1:1', '3:4', '4:5'] as AiImageAspectRatio[]).map((ratio) => (
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
              eyebrow={mode === 'partial' ? '05' : '03'}
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

          <div className="sticky bottom-0 grid grid-cols-[96px_minmax(0,1fr)] gap-2 border-t border-white/10 bg-[#0d1624]/95 p-5 backdrop-blur md:px-7">
            <button
              type="button"
              onClick={resetEditor}
              disabled={isGenerating}
              className="min-h-13 rounded-lg border border-white/10 bg-white/[0.04] text-xs font-black text-slate-300 transition hover:border-white/20 disabled:opacity-45"
            >
              초기화
            </button>
            <button
              type="button"
              onClick={generateImage}
              disabled={!canGenerate}
              className="min-h-13 rounded-lg bg-white px-5 text-sm font-black text-[#07111d] transition hover:bg-cyan-50 focus:outline-none focus:ring-4 focus:ring-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isGenerating
                ? '이미지 생성 중'
                : mode === 'prompt' && resultImageUrl
                  ? '현재 결과 수정하기'
                  : 'AI 이미지 생성'}
            </button>
          </div>
        </aside>

        <main className="min-w-0 bg-[#080e18] p-4 md:p-7">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <StudioBadge label={mode === 'partial' ? '모델 적용' : '프롬프트 생성'} />
              {mode === 'partial' ? <StudioBadge label={selectedModel.name} /> : null}
              <StudioBadge label={aspectRatio} />
              {mode === 'prompt' && resultImageUrl ? (
                <StudioBadge label="연속 수정 준비" />
              ) : null}
              {mode === 'partial' ? (
                <StudioBadge label={targets.find((item) => item.value === target)?.label ?? ''} />
              ) : null}
            </div>
            {resultImageUrl ? (
              <button
                type="button"
                onClick={() => downloadImage(resultImageUrl)}
                className="flex min-h-10 w-fit items-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3.5 text-xs font-black text-cyan-100 transition hover:border-cyan-200/50"
              >
                <DownloadIcon />
                결과 저장
              </button>
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
              modelName={mode === 'partial' ? selectedModel.name : ''}
              referenceUrl={mode === 'partial' ? selectedModel.thumbnailPath : ''}
              resultUrl={resultImageUrl}
              sourceUrl={sourceImage?.previewUrl ?? ''}
            />
          )}
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
        className={`relative grid max-h-[780px] w-full place-items-center overflow-hidden rounded-lg border border-white/10 bg-[#111b29] shadow-[0_28px_80px_rgba(0,0,0,0.4)] ${
          aspectRatio === '1:1'
            ? 'max-w-[700px] aspect-square'
            : aspectRatio === '3:4'
              ? 'max-w-[570px] aspect-[3/4]'
              : 'max-w-[600px] aspect-[4/5]'
        }`}
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
    <section>
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
  modelName,
  referenceUrl,
  resultUrl,
  sourceUrl,
}: {
  aspectRatio: AiImageAspectRatio
  modelName: string
  referenceUrl: string
  resultUrl: string
  sourceUrl: string
}) {
  const displayUrl = resultUrl || referenceUrl

  return (
    <div className="relative grid min-h-[520px] place-items-center overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_45%),linear-gradient(145deg,#101a29,#070c14)] p-4 md:min-h-[720px] md:p-8">
      {displayUrl ? (
      <div
        className={`relative grid max-h-[780px] w-full place-items-center overflow-hidden rounded-lg border bg-black/35 shadow-[0_28px_80px_rgba(0,0,0,0.45)] ${
          resultUrl ? 'border-cyan-300/30' : 'border-white/10'
        } ${
          aspectRatio === '1:1'
            ? 'max-w-[700px] aspect-square'
            : aspectRatio === '3:4'
              ? 'max-w-[570px] aspect-[3/4]'
              : 'max-w-[600px] aspect-[4/5]'
        }`}
      >
        <img
          src={displayUrl}
          alt={resultUrl ? 'AI 생성 결과' : `${modelName} 기준 이미지`}
          className="h-full w-full object-contain"
        />
        <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-[#07111d]/80 px-3 py-1.5 text-[10px] font-black text-white backdrop-blur">
          {resultUrl ? '생성 결과' : '기준 모델 미리보기'}
        </span>
      </div>
      ) : (
        <div className="grid max-w-md place-items-center px-6 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-2xl text-cyan-100">
            ✦
          </div>
          <p className="mt-5 text-lg font-black text-white">프롬프트로 이미지를 생성하세요</p>
          <p className="mt-2 break-keep text-xs font-semibold leading-6 text-slate-500">
            이 모드에서는 모델 이미지나 업로드 사진을 사용하지 않습니다. 입력한 설명만으로
            새로운 이미지를 생성합니다.
          </p>
        </div>
      )}

      {sourceUrl ? (
        <figure className="absolute bottom-5 left-5 overflow-hidden rounded-lg border border-white/15 bg-[#07111d]/90 p-2 shadow-xl backdrop-blur md:bottom-7 md:left-7">
          <img src={sourceUrl} alt="참고 사진" className="h-20 w-20 rounded-md object-cover md:h-28 md:w-28" />
          <figcaption className="mt-2 text-center text-[9px] font-black text-slate-400">
            참고 사진
          </figcaption>
        </figure>
      ) : null}

    </div>
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
      className={`block border-2 border-current ${
        ratio === '1:1' ? 'h-3.5 w-3.5' : ratio === '3:4' ? 'h-4 w-3' : 'h-4 w-[13px]'
      }`}
    />
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

function downloadImage(imageDataUrl: string) {
  const link = document.createElement('a')
  link.href = imageDataUrl
  link.download = `aiva-ai-image-${Date.now()}.png`
  link.click()
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
