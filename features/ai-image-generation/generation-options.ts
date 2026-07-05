import type {
  AiImageBackground,
  AiImageComposition,
  AiImageEyeState,
  AiImageHandPose,
  AiImageMaskOption,
} from './types'

export const aiImageCompositions: AiImageComposition[] = [
  {
    id: 'front',
    name: '정면 얼굴',
    description: '얼굴 전체가 보이는 정면 구도',
    thumbnailPath: '/ai-image-generation/composition-front-ai-v2.png',
    prompt: 'upright, front-facing full-face beauty portrait, looking directly at the camera',
    supportsMask: true,
    supportsEyeState: true,
    supportsHandPose: false,
    allowedBackgrounds: ['bright-studio', 'beauty-salon'],
  },
  {
    id: 'left-angle',
    name: '좌측 사선',
    description: '얼굴을 왼쪽으로 30도 회전',
    thumbnailPath: '/ai-image-generation/composition-left-angle-ai-v2.png',
    prompt: 'upright three-quarter portrait, face turned 30 degrees to the subject’s left',
    supportsMask: true,
    supportsEyeState: true,
    supportsHandPose: false,
    allowedBackgrounds: ['bright-studio', 'beauty-salon'],
  },
  {
    id: 'right-angle',
    name: '우측 사선',
    description: '얼굴을 오른쪽으로 30도 회전',
    thumbnailPath: '/ai-image-generation/composition-right-angle-ai-v2.png',
    prompt: 'upright three-quarter portrait, face turned 30 degrees to the subject’s right',
    supportsMask: true,
    supportsEyeState: true,
    supportsHandPose: false,
    allowedBackgrounds: ['bright-studio', 'beauty-salon'],
  },
  {
    id: 'bed-front',
    name: '시술 베드 정면',
    description: '누운 상태를 위에서 촬영',
    thumbnailPath: '/ai-image-generation/composition-bed-front-ai-v2.png',
    prompt: 'lying naturally on a beauty treatment bed, photographed from directly above',
    supportsMask: true,
    supportsEyeState: true,
    supportsHandPose: true,
    allowedBackgrounds: ['treatment-bed'],
  },
  {
    id: 'bed-angle',
    name: '시술 베드 사선',
    description: '누운 얼굴을 사선 위에서 촬영',
    thumbnailPath: '/ai-image-generation/composition-bed-angle-ai-v2.png',
    prompt: 'lying on a beauty treatment bed, photographed from a soft diagonal overhead angle',
    supportsMask: true,
    supportsEyeState: true,
    supportsHandPose: true,
    allowedBackgrounds: ['treatment-bed'],
  },
  {
    id: 'eyes-closeup',
    name: '양쪽 눈 클로즈업',
    description: '눈과 눈썹 중심의 확대 구도',
    thumbnailPath: '/ai-image-generation/composition-eyes-closeup-ai-v2.png',
    prompt: 'tight symmetrical macro crop showing both eyes and eyebrows, no lower face visible',
    supportsMask: false,
    supportsEyeState: true,
    supportsHandPose: true,
    allowedBackgrounds: ['bright-studio', 'beauty-salon', 'treatment-bed'],
  },
  {
    id: 'single-eye-closeup',
    name: '한쪽 눈 클로즈업',
    description: '한쪽 눈과 눈썹을 크게 촬영',
    thumbnailPath: '/ai-image-generation/composition-single-eye-ai-v2.png',
    prompt: 'extreme macro crop of one eye and eyebrow with precise beauty photography detail',
    supportsMask: false,
    supportsEyeState: true,
    supportsHandPose: true,
    allowedBackgrounds: ['bright-studio', 'beauty-salon', 'treatment-bed'],
  },
]

export const maskOptions: Array<{ value: AiImageMaskOption; label: string }> = [
  { value: 'none', label: '없음' },
  { value: 'white', label: '흰색' },
  { value: 'black', label: '검은색' },
]

export const eyeStateOptions: Array<{ value: AiImageEyeState; label: string }> = [
  { value: 'open', label: '눈 뜸' },
  { value: 'closed', label: '눈 감음' },
]

export const handPoseOptions: Array<{ value: AiImageHandPose; label: string }> = [
  { value: 'none', label: '연출 없음' },
  { value: 'forehead', label: '이마 고정' },
  { value: 'temple', label: '관자놀이 고정' },
]

export const backgroundOptions: Array<{ value: AiImageBackground; label: string }> = [
  { value: 'bright-studio', label: '밝은 스튜디오' },
  { value: 'beauty-salon', label: '뷰티 살롱' },
  { value: 'treatment-bed', label: '시술 베드' },
]
