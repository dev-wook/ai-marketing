import type {
  AiImageAspectRatio,
  AiImageDesignModelId,
  AiImageEditTarget,
  AiImageGenerationMode,
} from '../types'

const modelPrompts: Record<AiImageDesignModelId, string> = {
  'model-a': `
For MODEL IMAGE A, preserve the extreme close-up framing of one eye and eyebrow,
the white-gloved hand, bright background, porcelain skin texture, camera angle,
eye direction, catchlight and every visible facial detail.
`,
  'model-b': `
For MODEL IMAGE B, preserve the three-quarter face angle, brown long hair,
soft warm portrait lighting, expression, skin texture, makeup, background,
camera crop and every visible facial detail.
`,
  'model-c': `
For MODEL IMAGE C, preserve the near-front face angle, see-through bangs,
soft brown hair, natural daylight, expression, skin texture, makeup, background,
camera crop and every visible facial detail.
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

export function buildAiImageGenerationPrompt(input: {
  modelId?: AiImageDesignModelId
  mode: AiImageGenerationMode
  target: AiImageEditTarget
  aspectRatio: AiImageAspectRatio
  customPrompt: string
  hasSourceImage: boolean
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

  const shared = `
Create one polished, photorealistic beauty portfolio image.
IMAGE 1 is the selected MODEL IMAGE and defines the base person and visual composition.
The requested output aspect ratio is ${input.aspectRatio}.
Never add text, logos, watermarks, duplicated facial features or anatomical distortions.
${modelPrompts[input.modelId]}
`.trim()

  return `${shared}

IMAGE 2 is the SOURCE IMAGE. Use it only as a visual reference for:
${targetInstructions[input.target]}.

CRITICAL EDITING RULES:
- Transfer only the selected target from IMAGE 2 to IMAGE 1 and adapt it naturally to IMAGE 1.
- The final result must remain the same person as IMAGE 1.
- Preserve IMAGE 1 facial identity, bone structure, expression, camera angle, crop, lighting,
  background, clothing and every area outside the selected target.
- Do not copy identity, face shape, skin, background or composition from IMAGE 2.
- Do not make unrelated beauty corrections.
${input.customPrompt ? `Additional request: ${input.customPrompt}` : ''}
`.trim()
}
