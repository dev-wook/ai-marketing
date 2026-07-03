export type AiImageCategoryCode = 'eyelash'

export type AiImageDesignModelId = 'model-a' | 'model-b' | 'model-c'

export type AiImageDesignModel = {
  id: AiImageDesignModelId
  categoryCode: AiImageCategoryCode
  name: string
  description: string
  thumbnailPath: string
}

export type AiImageGenerationResponse = {
  imageDataUrl: string
}

export type AiImageUsageResponse = {
  trackingAvailable: boolean
  periodLabel: string
  generationCount: number
  estimatedCostKrw: number
  monthlyBudgetKrw: number
  usageRate: number
  modelUsage: Array<{
    model: 'primary' | 'fallback'
    count: number
  }>
  billingConsoleUrl: string
}
