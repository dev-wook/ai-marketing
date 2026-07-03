import type { AiImageDesignModelId } from '../types'

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

const preservationPrompt = `
Create one photorealistic eyelash portfolio image using two input images.

IMAGE 1 is the MODEL IMAGE and is the base of the final result.
IMAGE 2 is the TREATMENT SOURCE IMAGE and is used only as an eyelash-style reference.

Transfer only the visible upper-eyelash treatment characteristics from IMAGE 2 to IMAGE 1:
lash curl, lift direction, length pattern, density, spacing, grouping and individual strand shape.
Adapt those eyelashes naturally to the eye geometry of the person in IMAGE 1.

CRITICAL PRESERVATION RULES:
- The final result must remain the same person and photograph as IMAGE 1.
- Preserve IMAGE 1 identity, face, eye shape, iris color, eyebrows, skin texture, hair, hands,
  clothing, expression, makeup, background, lighting, camera angle, crop and aspect ratio.
- Do not copy the face, eye shape, iris, eyebrow, skin, makeup, hair, background or composition
  from IMAGE 2.
- Do not beautify or regenerate the face in IMAGE 1.
- Do not add text, logos, watermarks, false-lash bands, eyeliner or unrelated makeup.
- Change only the upper eyelashes in IMAGE 1.
`

export function buildEyelashGenerationPrompt(modelId: AiImageDesignModelId) {
  return `${preservationPrompt}\n${modelPrompts[modelId]}`.trim()
}
