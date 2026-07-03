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
