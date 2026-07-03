import type { AiImageDesignModel } from './types'

export const aiImageDesignModels: AiImageDesignModel[] = [
  {
    id: 'model-a',
    categoryCode: 'eyelash',
    name: '모델 A',
    description: '한쪽 눈과 눈썹을 크게 담고 흰 장갑이 함께 보이는 밝은 클로즈업 모델',
    thumbnailPath: '/ai-image-generation/clinical-lift.jpg',
  },
  {
    id: 'model-b',
    categoryCode: 'eyelash',
    name: '모델 B',
    description: '브라운 롱헤어와 부드러운 사선 얼굴 구도가 돋보이는 인물 모델',
    thumbnailPath: '/ai-image-generation/sharp-curl.jpg',
  },
  {
    id: 'model-c',
    categoryCode: 'eyelash',
    name: '모델 C',
    description: '시스루뱅 헤어와 정면에 가까운 자연스러운 얼굴 구도의 인물 모델',
    thumbnailPath: '/ai-image-generation/idol-lash.jpg',
  },
]
