type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
}

type GeminiErrorBody = {
  error?: {
    code?: number
    message?: string
    status?: string
    details?: Array<{
      '@type'?: string
      retryDelay?: string
      violations?: Array<{
        quotaId?: string
        quotaMetric?: string
        quotaDimensions?: Record<string, string>
        quotaValue?: string
      }>
    }>
  }
}

export type GeminiErrorMetadata = {
  model: string
  status: number
  statusText: string
  retryDelayMs?: number
  retryDelay?: string
  quotaId?: string
  quotaMetric?: string
  quotaValue?: string
  quotaDimensions?: Record<string, string>
  quotaScope?: 'daily' | 'minute' | 'token' | 'unknown'
  canRetrySameModel: boolean
  canTryFallbackModel: boolean
}

export type GeminiLocalRateLimitMetadata = {
  status: 429
  quotaScope: 'minute'
  quotaLimit: number
  retryAfterMs: number
  availableAt: string
  message: string
}

export class GeminiApiError extends Error {
  status: number
  statusText: string
  body: string
  model: string

  constructor(input: {
    status: number
    statusText: string
    body: string
    message: string
    model: string
  }) {
    super(input.message)
    this.name = 'GeminiApiError'
    this.status = input.status
    this.statusText = input.statusText
    this.body = input.body
    this.model = input.model
  }
}

export class GeminiRateLimitError extends Error {
  metadata: GeminiLocalRateLimitMetadata

  constructor(metadata: GeminiLocalRateLimitMetadata) {
    super(metadata.message)
    this.name = 'GeminiRateLimitError'
    this.metadata = metadata
  }
}

const defaultGeminiTextModel = 'gemini-3.5-flash'
const defaultGeminiFallbackTextModels = ['gemini-2.5-flash-lite']
const retryableGeminiStatuses = new Set([429, 500, 503])
const maxRetryDelayMs = 5000
const maxGeminiAttemptsPerModel = 3
const geminiMinuteLimit = parsePositiveInteger(process.env.GEMINI_REQUESTS_PER_MINUTE, 8)
const geminiMinuteWindowMs = 60 * 1000
const geminiRequestTimestamps: number[] = []
let geminiCooldownUntil = 0

export async function generateGeminiText(prompt: string, useGoogleSearch = false) {
  const apiKey = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_TEXT_MODEL ?? defaultGeminiTextModel

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.')
  }

  return requestGeminiTextWithFallback({
    apiKey,
    models: getGeminiModelCandidates(model),
    prompt,
    useGoogleSearch,
  })
}

async function requestGeminiTextWithFallback({
  apiKey,
  models,
  prompt,
  useGoogleSearch,
}: {
  apiKey: string
  models: string[]
  prompt: string
  useGoogleSearch: boolean
}) {
  let lastError: unknown

  for (const model of models) {
    try {
      return await requestGeminiText({
        apiKey,
        model,
        prompt,
        useGoogleSearch,
      })
    } catch (error) {
      lastError = error

      if (!(error instanceof GeminiApiError) || !shouldTryNextModel(error)) {
        throw error
      }

      console.warn('Gemini model quota exhausted, trying fallback model', {
        fromModel: model,
        nextModel: models[models.indexOf(model) + 1],
      })
    }
  }

  throw lastError
}

async function requestGeminiText({
  apiKey,
  model,
  prompt,
  useGoogleSearch,
}: {
  apiKey: string
  model: string
  prompt: string
  useGoogleSearch: boolean
}) {
  let lastError: GeminiApiError | null = null

  for (let attempt = 1; attempt <= maxGeminiAttemptsPerModel; attempt += 1) {
    try {
      return await requestGeminiTextOnce({
        apiKey,
        model,
        prompt,
        useGoogleSearch,
      })
    } catch (error) {
      if (!(error instanceof GeminiApiError)) {
        throw error
      }

      lastError = error

      if (!shouldRetryGeminiError(error) || attempt === maxGeminiAttemptsPerModel) {
        throw error
      }

      const delayMs = getRetryDelayMs(error, attempt)

      console.warn('Gemini API retry scheduled', {
        attempt,
        delayMs,
        model,
        status: error.status,
      })

      await sleep(delayMs)
    }
  }

  throw lastError ?? new Error('Gemini API request failed.')
}

async function requestGeminiTextOnce({
  apiKey,
  model,
  prompt,
  useGoogleSearch,
}: {
  apiKey: string
  model: string
  prompt: string
  useGoogleSearch: boolean
}) {
  rememberGeminiRequestOrThrow()

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
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
    const errorBody = await response.text()
    const apiError = new GeminiApiError({
      status: response.status,
      statusText: response.statusText,
      body: errorBody,
      message: `Gemini API request failed with status ${response.status}`,
      model,
    })

    if (response.status === 429) {
      rememberGeminiCooldown(apiError)
    }

    console.error('Gemini API error', {
      status: response.status,
      statusText: response.statusText,
      model,
      useGoogleSearch,
      body: safelyParseJson(errorBody),
    })

    throw apiError
  }

  const data = (await response.json()) as GeminiGenerateContentResponse

  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join('\n') ?? ''
  )
}

export function getGeminiLocalRateLimitMetadata() {
  const retryAfterMs = getGeminiLocalRetryAfterMs(Date.now())

  if (retryAfterMs <= 0) {
    return null
  }

  return createGeminiLocalRateLimitMetadata(retryAfterMs)
}

function getGeminiModelCandidates(primaryModel: string) {
  const fallbackModels =
    process.env.GEMINI_FALLBACK_TEXT_MODELS?.split(',')
      .map((model) => model.trim())
      .filter(Boolean) ?? defaultGeminiFallbackTextModels

  return Array.from(new Set([primaryModel, ...fallbackModels]))
}

function shouldRetryGeminiError(error: GeminiApiError) {
  if (!retryableGeminiStatuses.has(error.status)) {
    return false
  }

  if (error.status === 429) {
    return !isDailyQuotaError(error) && Boolean(getRetryInfo(error).retryDelayMs)
  }

  return true
}

function shouldTryNextModel(error: GeminiApiError) {
  return error.status === 429 && (isModelQuotaError(error) || isDailyQuotaError(error))
}

function isDailyQuotaError(error: GeminiApiError) {
  const body = parseGeminiErrorBody(error.body)

  return (
    body.error?.details?.some((detail) =>
      detail.violations?.some((violation) => violation.quotaId?.includes('PerDay')),
    ) ?? false
  )
}

function isModelQuotaError(error: GeminiApiError) {
  const body = parseGeminiErrorBody(error.body)

  return (
    body.error?.status === 'RESOURCE_EXHAUSTED' &&
    (body.error.details?.some((detail) =>
      detail.violations?.some((violation) => Boolean(violation.quotaDimensions?.model)),
    ) ??
      false)
  )
}

export function getGeminiErrorMetadata(error: GeminiApiError): GeminiErrorMetadata {
  const retryInfo = getRetryInfo(error)
  const violation = getPrimaryQuotaViolation(error)

  return {
    model: error.model,
    status: error.status,
    statusText: error.statusText,
    retryDelayMs: retryInfo.retryDelayMs,
    retryDelay: retryInfo.retryDelay,
    quotaId: violation?.quotaId,
    quotaMetric: violation?.quotaMetric,
    quotaValue: violation?.quotaValue,
    quotaDimensions: violation?.quotaDimensions,
    quotaScope: getQuotaScope(violation),
    canRetrySameModel: shouldRetryGeminiError(error),
    canTryFallbackModel: shouldTryNextModel(error),
  }
}

function getRetryDelayMs(error: GeminiApiError, attempt: number) {
  const retryDelayMs = getRetryInfo(error).retryDelayMs ?? 0
  const fallbackDelayMs = 750 * 2 ** (attempt - 1)

  return Math.min(Math.max(retryDelayMs, fallbackDelayMs), maxRetryDelayMs)
}

function rememberGeminiRequestOrThrow() {
  const now = Date.now()
  const retryAfterMs = getGeminiLocalRetryAfterMs(now)

  if (retryAfterMs > 0) {
    throw new GeminiRateLimitError(createGeminiLocalRateLimitMetadata(retryAfterMs))
  }

  geminiRequestTimestamps.push(now)
}

function rememberGeminiCooldown(error: GeminiApiError) {
  const retryAfterMs = getRetryInfo(error).retryDelayMs

  if (retryAfterMs && retryAfterMs > 0) {
    geminiCooldownUntil = Math.max(geminiCooldownUntil, Date.now() + retryAfterMs)
  }
}

function getGeminiLocalRetryAfterMs(now: number) {
  while (
    geminiRequestTimestamps.length > 0 &&
    now - geminiRequestTimestamps[0] >= geminiMinuteWindowMs
  ) {
    geminiRequestTimestamps.shift()
  }

  const windowRetryAfterMs =
    geminiRequestTimestamps.length >= geminiMinuteLimit
      ? geminiMinuteWindowMs - (now - geminiRequestTimestamps[0])
      : 0
  const cooldownRetryAfterMs = Math.max(0, geminiCooldownUntil - now)

  return Math.ceil(Math.max(windowRetryAfterMs, cooldownRetryAfterMs))
}

function createGeminiLocalRateLimitMetadata(retryAfterMs: number): GeminiLocalRateLimitMetadata {
  const availableAt = new Date(Date.now() + retryAfterMs).toISOString()

  return {
    status: 429,
    quotaScope: 'minute',
    quotaLimit: geminiMinuteLimit,
    retryAfterMs,
    availableAt,
    message: `Gemini API 호출이 일시적으로 제한되었습니다. 약 ${formatRetryAfter(retryAfterMs)} 후 다시 이용할 수 있습니다.`,
  }
}

function getRetryInfo(error: GeminiApiError) {
  const body = parseGeminiErrorBody(error.body)
  const retryDelay = body.error?.details
    ?.map((detail) => detail.retryDelay)
    .find((value): value is string => Boolean(value))
  const retryDelayMs = retryDelay ? parseRetryDelayMs(retryDelay) : undefined

  return { retryDelay, retryDelayMs }
}

function getPrimaryQuotaViolation(error: GeminiApiError) {
  const body = parseGeminiErrorBody(error.body)

  return body.error?.details
    ?.flatMap((detail) => detail.violations ?? [])
    .find((violation) => violation.quotaId || violation.quotaMetric)
}

function getQuotaScope(violation?: {
  quotaId?: string
  quotaMetric?: string
}): GeminiErrorMetadata['quotaScope'] {
  const quotaText = `${violation?.quotaId ?? ''} ${violation?.quotaMetric ?? ''}`.toLowerCase()

  if (!quotaText.trim()) {
    return undefined
  }

  if (quotaText.includes('perday') || quotaText.includes('per_day')) {
    return 'daily'
  }

  if (quotaText.includes('perminute') || quotaText.includes('per_minute')) {
    return 'minute'
  }

  if (quotaText.includes('token')) {
    return 'token'
  }

  return 'unknown'
}

function parseRetryDelayMs(value: string) {
  const seconds = Number(value.replace(/s$/, ''))

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0
  }

  return Math.ceil(seconds * 1000)
}

function formatRetryAfter(value: number) {
  const seconds = Math.max(1, Math.ceil(value / 1000))

  if (seconds < 60) {
    return `${seconds}초`
  }

  const minutes = Math.ceil(seconds / 60)

  return `${minutes}분`
}

function parseGeminiErrorBody(value: string): GeminiErrorBody {
  try {
    return JSON.parse(value) as GeminiErrorBody
  } catch {
    return {}
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function safelyParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
