import type {
  AiImageAspectRatio,
  AiImageBackground,
  AiImageCompositionId,
  AiImageDesignModelId,
  AiImageEditTarget,
  AiImageEyeState,
  AiImageGenerationMode,
  AiImageHandPose,
  AiImageMaskOption,
} from '../types'
import { aiImageCompositions } from '../generation-options'

const modelPrompts: Record<AiImageDesignModelId, string> = {
  'model-a': `
MODEL A IDENTITY: Preserve her exact long natural-black straight hair, elegant oval face,
clear almond-shaped dark-brown eyes, refined facial proportions and calm pure impression.
`,
  'model-b': `
MODEL B IDENTITY: Preserve her exact short chestnut-brown bob with airy bangs,
soft heart-shaped face, bright puppy-like eyes, full cheeks and lovable lively impression.
`,
  'model-c': `
MODEL C IDENTITY: Preserve her exact long layered dark ash-brown hair with soft waves,
small heart-to-oval face, clear warm-brown eyes and fresh sophisticated impression.
`,
}

const targetInstructions: Record<AiImageEditTarget, string> = {
  eyelashes:
    'upper eyelashes only: curl, lift direction, length pattern, density, spacing, grouping and individual strand shape',
  eyebrows: 'eyebrows only: shape, hair direction, density, gradient and color',
  'eye-makeup': 'eye makeup only: eyeshadow, eyeliner and the finish around the eyelids',
  hair: 'hair only: hairstyle, texture, length, volume and color',
  lips: 'lips only: lip color, texture and makeup finish',
  overall: 'the overall beauty styling while preserving the person’s identity and facial structure',
}

const maskPrompts: Record<AiImageMaskOption, string> = {
  none: 'no face mask',
  white: 'a clean white disposable treatment mask covering the nose and mouth',
  black: 'a clean black disposable treatment mask covering the nose and mouth',
}

const eyeStatePrompts: Record<AiImageEyeState, string> = {
  open: 'eyes naturally open with clear catchlights',
  closed: 'eyes naturally and gently closed without facial tension',
}

const handPosePrompts: Record<AiImageHandPose, string> = {
  none: 'no hands touching the face',
  forehead: 'a white-gloved treatment hand gently stabilizing the forehead',
  temple: 'a white-gloved treatment hand gently stabilizing the temple',
}

const backgroundPrompts: Record<AiImageBackground, string> = {
  'bright-studio': 'a clean bright ivory beauty studio background',
  'beauty-salon': 'a softly blurred premium Korean beauty salon background',
  'treatment-bed': 'a clean professional beauty treatment bed environment',
}

export function buildAiImageGenerationPrompt(input: {
  modelId?: AiImageDesignModelId
  mode: AiImageGenerationMode
  target: AiImageEditTarget
  aspectRatio: AiImageAspectRatio
  customPrompt: string
  hasSourceImage: boolean
  compositionId: AiImageCompositionId
  maskOption: AiImageMaskOption
  eyeState: AiImageEyeState
  handPose: AiImageHandPose
  background: AiImageBackground
}) {
  if (input.mode === 'prompt') {
    return `
Create one high-quality image from the following user prompt.

USER PROMPT:
${input.customPrompt}

OUTPUT REQUIREMENTS:
- ${
      input.hasSourceImage
        ? 'The INPUT IMAGE is the current image to edit. Apply the user request to it while preserving all elements the user did not ask to change.'
        : 'Follow the user prompt directly without using a predefined person, model image or composition.'
    }
- Output aspect ratio: ${input.aspectRatio}.
- Produce one finished image, not a collage.
- Do not add text, logos or watermarks unless the user explicitly requests text.
- Keep anatomy, lighting and visual details coherent and natural.
`.trim()
  }

  if (!input.modelId) {
    throw new Error('A design model is required for partial image editing.')
  }

  const composition = aiImageCompositions.find((item) => item.id === input.compositionId)

  if (!composition) {
    throw new Error('A valid composition is required for partial image editing.')
  }

  const shared = `
Create one polished, photorealistic beauty portfolio image.
IMAGE 1 is the MODEL IDENTITY IMAGE. Preserve the exact same fictional person and her
recognizable facial identity while changing the camera composition as requested below.
The requested output aspect ratio is ${input.aspectRatio}.
Never add text, logos, watermarks, duplicated facial features or anatomical distortions.
${modelPrompts[input.modelId]}

CAMERA AND STAGING:
- Composition: ${composition.prompt}.
- Eye state: ${eyeStatePrompts[input.eyeState]}.
- Mask: ${maskPrompts[input.maskOption]}.
- Treatment staging: ${handPosePrompts[input.handPose]}.
- Background: ${backgroundPrompts[input.background]}.
`.trim()

  return `${shared}

IMAGE 2 is the SOURCE IMAGE. Use it only as a visual reference for:
${targetInstructions[input.target]}.

CRITICAL EDITING RULES:
- Transfer only the selected target from IMAGE 2 to IMAGE 1 and adapt it naturally to IMAGE 1.
- The final result must remain recognizably the exact same person as IMAGE 1.
- Preserve IMAGE 1 facial identity, bone structure, skin tone, hair identity and every area
  outside the selected target, while applying the explicitly selected camera and staging options.
- Do not copy identity, face shape, skin, background or composition from IMAGE 2.
- Do not make unrelated beauty corrections.
${input.customPrompt ? `Additional request: ${input.customPrompt}` : ''}
`.trim()
}
