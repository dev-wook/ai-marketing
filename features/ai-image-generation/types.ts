export type AiImageCategoryCode = 'eyelash'

export type AiImageDesignModelId = 'model-a' | 'model-b' | 'model-c'

export type AiImageGenerationMode = 'prompt' | 'partial'

export type AiImageEditTarget =
  | 'eyelashes'
  | 'eyebrows'
  | 'eye-makeup'
  | 'hair'
  | 'lips'
  | 'overall'

export type AiImageAspectRatio = '1:1' | '3:4' | '4:5'

export type AiImageCompositionId =
  | 'front'
  | 'left-angle'
  | 'right-angle'
  | 'bed-front'
  | 'bed-angle'
  | 'eyes-closeup'
  | 'single-eye-closeup'

export type AiImageMaskOption = 'none' | 'white' | 'black'

export type AiImageEyeState = 'open' | 'closed'

export type AiImageHandPose = 'none' | 'forehead' | 'temple'

export type AiImageBackground = 'bright-studio' | 'beauty-salon' | 'treatment-bed'

export type AiImageComposition = {
  id: AiImageCompositionId
  name: string
  description: string
  thumbnailPath: string
  prompt: string
  supportsMask: boolean
  supportsEyeState: boolean
  supportsHandPose: boolean
  allowedBackgrounds: AiImageBackground[]
}

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
