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
  model: string
  quotaScope: 'daily' | 'minute'
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
const defaultRealtimeGeminiModels = ['gemini-3.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.1-flash-lite']
const defaultBenchmarkGeminiModels = ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3.5-flash']
const defaultGeminiFallbackTextModels = ['gemini-2.5-flash-lite', 'gemini-3.1-flash-lite']
const retryableGeminiStatuses = new Set([429, 500, 503])
const maxRetryDelayMs = 5000
const maxGeminiAttemptsPerModel = 3
const geminiMinuteWindowMs = 60 * 1000
const geminiDailyWindowMs = 24 * 60 * 60 * 1000
const geminiModelUsage = new Map<
  string,
  {
    requestTimestamps: number[]
    dailyCount: number
    dailyWindowStartedAt: number
    cooldownUntil: number
  }
>()

type GeminiTask = 'default' | 'realtime-diagnosis' | 'benchmark-calibration'

type GeminiTextOptions = {
  useGoogleSearch?: boolean
  task?: GeminiTask
  modelCandidates?: string[]
}

type GeminiModelQuota = {
  dailyLimit: number
  minuteLimit: number
}

const geminiModelQuotas: Record<string, GeminiModelQuota> = {
  'gemini-3.5-flash': {
    dailyLimit: parsePositiveInteger(process.env.GEMINI_3_5_FLASH_DAILY_LIMIT, 20),
    minuteLimit: parsePositiveInteger(process.env.GEMINI_3_5_FLASH_REQUESTS_PER_MINUTE, 5),
  },
  'gemini-3.1-flash-lite': {
    dailyLimit: parsePositiveInteger(process.env.GEMINI_3_1_FLASH_LITE_DAILY_LIMIT, 500),
    minuteLimit: parsePositiveInteger(process.env.GEMINI_3_1_FLASH_LITE_REQUESTS_PER_MINUTE, 15),
  },
  'gemini-2.5-flash-lite': {
    dailyLimit: parsePositiveInteger(process.env.GEMINI_2_5_FLASH_LITE_DAILY_LIMIT, 20),
    minuteLimit: parsePositiveInteger(process.env.GEMINI_2_5_FLASH_LITE_REQUESTS_PER_MINUTE, 10),
  },
}

export async function generateGeminiText(
  prompt: string,
  optionsOrUseGoogleSearch: GeminiTextOptions | boolean = false,
) {
  const apiKey = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_TEXT_MODEL ?? defaultGeminiTextModel
  const options =
    typeof optionsOrUseGoogleSearch === 'boolean'
      ? { useGoogleSearch: optionsOrUseGoogleSearch }
      : optionsOrUseGoogleSearch

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.')
  }

  return requestGeminiTextWithFallback({
    apiKey,
    models: getGeminiModelCandidates({
      primaryModel: model,
      task: options.task ?? 'default',
      overrideModels: options.modelCandidates,
    }),
    prompt,
    useGoogleSearch: options.useGoogleSearch ?? false,
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

      if (
        error instanceof GeminiRateLimitError &&
        error.metadata.quotaScope === 'daily' &&
        models.indexOf(model) < models.length - 1
      ) {
        console.warn('Gemini local daily quota exhausted, trying fallback model', {
          fromModel: model,
          nextModel: models[models.indexOf(model) + 1],
        })
        continue
      }

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
  rememberGeminiRequestOrThrow(model)

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
  const model = process.env.GEMINI_TEXT_MODEL ?? defaultGeminiTextModel
  const retryAfterMs = Math.max(
    getGeminiLocalDailyRetryAfterMs(model, Date.now()),
    getGeminiLocalMinuteRetryAfterMs(model, Date.now()),
  )

  if (retryAfterMs <= 0) {
    return null
  }

  return createGeminiLocalRateLimitMetadata({
    model,
    quotaScope: getGeminiLocalDailyRetryAfterMs(model, Date.now()) > 0 ? 'daily' : 'minute',
    retryAfterMs,
  })
}

function getGeminiModelCandidates({
  overrideModels,
  primaryModel,
  task,
}: {
  primaryModel: string
  task: GeminiTask
  overrideModels?: string[]
}) {
  if (overrideModels?.length) {
    return Array.from(new Set(overrideModels))
  }

  if (task === 'benchmark-calibration') {
    return parseModelList(process.env.GEMINI_BENCHMARK_TEXT_MODELS, defaultBenchmarkGeminiModels)
  }

  if (task === 'realtime-diagnosis') {
    return parseModelList(process.env.GEMINI_REALTIME_TEXT_MODELS, defaultRealtimeGeminiModels)
  }

  const fallbackModels =
    process.env.GEMINI_FALLBACK_TEXT_MODELS?.split(',')
      .map((model) => model.trim())
      .filter(Boolean) ?? defaultGeminiFallbackTextModels

  return Array.from(new Set([primaryModel, ...fallbackModels]))
}

function parseModelList(value: string | undefined, fallback: string[]) {
  const models = value
    ?.split(',')
    .map((model) => model.trim())
    .filter(Boolean)

  return Array.from(new Set(models?.length ? models : fallback))
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
  return (
    (error.status === 429 && (isModelQuotaError(error) || isDailyQuotaError(error))) ||
    isModelUnavailableError(error)
  )
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

function isModelUnavailableError(error: GeminiApiError) {
  if (error.status !== 400 && error.status !== 404) {
    return false
  }

  const body = parseGeminiErrorBody(error.body)
  const message = body.error?.message ?? error.body

  return /model|not found|not supported|unsupported|is not found|not available/i.test(message)
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

function rememberGeminiRequestOrThrow(model: string) {
  const now = Date.now()
  const dailyRetryAfterMs = getGeminiLocalDailyRetryAfterMs(model, now)

  if (dailyRetryAfterMs > 0) {
    throw new GeminiRateLimitError(
      createGeminiLocalRateLimitMetadata({
        model,
        quotaScope: 'daily',
        retryAfterMs: dailyRetryAfterMs,
      }),
    )
  }

  const retryAfterMs = getGeminiLocalMinuteRetryAfterMs(model, now)

  if (retryAfterMs > 0) {
    throw new GeminiRateLimitError(
      createGeminiLocalRateLimitMetadata({
        model,
        quotaScope: 'minute',
        retryAfterMs,
      }),
    )
  }

  const usage = getGeminiUsage(model, now)
  usage.requestTimestamps.push(now)
  usage.dailyCount += 1
}

function rememberGeminiCooldown(error: GeminiApiError) {
  const retryAfterMs = getRetryInfo(error).retryDelayMs

  if (retryAfterMs && retryAfterMs > 0) {
    const usage = getGeminiUsage(error.model, Date.now())

    usage.cooldownUntil = Math.max(usage.cooldownUntil, Date.now() + retryAfterMs)
  }
}

function getGeminiLocalDailyRetryAfterMs(model: string, now: number) {
  const quota = getGeminiModelQuota(model)
  const usage = getGeminiUsage(model, now)

  return usage.dailyCount >= quota.dailyLimit
    ? geminiDailyWindowMs - (now - usage.dailyWindowStartedAt)
    : 0
}

function getGeminiLocalMinuteRetryAfterMs(model: string, now: number) {
  const quota = getGeminiModelQuota(model)
  const usage = getGeminiUsage(model, now)

  while (
    usage.requestTimestamps.length > 0 &&
    now - usage.requestTimestamps[0] >= geminiMinuteWindowMs
  ) {
    usage.requestTimestamps.shift()
  }

  const windowRetryAfterMs =
    usage.requestTimestamps.length >= quota.minuteLimit
      ? geminiMinuteWindowMs - (now - usage.requestTimestamps[0])
      : 0
  const cooldownRetryAfterMs = Math.max(0, usage.cooldownUntil - now)

  return Math.ceil(Math.max(windowRetryAfterMs, cooldownRetryAfterMs))
}

function createGeminiLocalRateLimitMetadata({
  model,
  quotaScope,
  retryAfterMs,
}: {
  model: string
  quotaScope: GeminiLocalRateLimitMetadata['quotaScope']
  retryAfterMs: number
}): GeminiLocalRateLimitMetadata {
  const quota = getGeminiModelQuota(model)
  const quotaLimit = quotaScope === 'daily' ? quota.dailyLimit : quota.minuteLimit
  const availableAt = new Date(Date.now() + retryAfterMs).toISOString()
  const scopeLabel = quotaScope === 'daily' ? '일일' : '분당'

  return {
    status: 429,
    model,
    quotaScope,
    quotaLimit,
    retryAfterMs,
    availableAt,
    message: `Gemini ${model} ${scopeLabel} 호출 한도에 도달했습니다. 약 ${formatRetryAfter(retryAfterMs)} 후 다시 이용할 수 있습니다.`,
  }
}

function getGeminiUsage(model: string, now: number) {
  const current = geminiModelUsage.get(model)

  if (current && now - current.dailyWindowStartedAt < geminiDailyWindowMs) {
    return current
  }

  const next = {
    requestTimestamps: current?.requestTimestamps ?? [],
    dailyCount: 0,
    dailyWindowStartedAt: now,
    cooldownUntil: 0,
  }

  geminiModelUsage.set(model, next)

  return next
}

function getGeminiModelQuota(model: string) {
  return (
    geminiModelQuotas[model] ?? {
      dailyLimit: parsePositiveInteger(process.env.GEMINI_DEFAULT_DAILY_LIMIT, 20),
      minuteLimit: parsePositiveInteger(process.env.GEMINI_REQUESTS_PER_MINUTE, 5),
    }
  )
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
