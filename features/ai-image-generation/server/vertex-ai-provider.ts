import { getVercelOidcToken } from '@vercel/oidc'
import { ExternalAccountClient } from 'google-auth-library'
import {
  buildImageRequestParts,
  extractImageDataUrl,
  ImageProviderRequestError,
  type ImageProvider,
  type ImageResponse,
} from './image-provider'

const retryableStatuses = new Set([429, 500, 502, 503, 504])

export function createVertexAiProvider(): ImageProvider {
  const config = getVertexAiConfig()

  return {
    id: 'vertex-ai',
    defaultModels: ['gemini-3.1-flash-image', 'gemini-2.5-flash-image'],
    async requestImage(input) {
      try {
        const authClient = ExternalAccountClient.fromJSON({
          type: 'external_account',
          audience: `//iam.googleapis.com/projects/${config.projectNumber}/locations/global/workloadIdentityPools/${config.poolId}/providers/${config.providerId}`,
          subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
          token_url: 'https://sts.googleapis.com/v1/token',
          service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${config.serviceAccountEmail}:generateAccessToken`,
          subject_token_supplier: {
            getSubjectToken: () => getVercelOidcToken(),
          },
        })

        if (!authClient) {
          throw new Error('Could not create the Google external account client.')
        }

        const accessToken = (await authClient.getAccessToken()).token

        if (!accessToken) {
          throw new Error('Google access token was not issued.')
        }

        const response = await fetch(
          `https://aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${config.location}/publishers/google/models/${input.model}:generateContent`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: buildImageRequestParts(input) }],
              generationConfig: {
                responseModalities: ['IMAGE'],
              },
            }),
          },
        )

        if (!response.ok) {
          const body = await response.text()

          throw new ImageProviderRequestError(
            'vertex-ai',
            input.model,
            response.status,
            body,
            retryableStatuses.has(response.status) || response.status === 404,
          )
        }

        const data = (await response.json()) as ImageResponse
        const imageDataUrl = extractImageDataUrl(data)

        if (!imageDataUrl) {
          throw new ImageProviderRequestError(
            'vertex-ai',
            input.model,
            502,
            'Image response part was missing.',
            true,
          )
        }

        return imageDataUrl
      } catch (error) {
        if (error instanceof ImageProviderRequestError) {
          throw error
        }

        const status = 500
        const debug = error instanceof Error ? error.message : String(error)

        console.error('Vertex AI image API error', {
          model: input.model,
          status,
          debug,
        })

        throw new ImageProviderRequestError(
          'vertex-ai',
          input.model,
          status,
          debug,
          true,
        )
      }
    },
  }
}

function getVertexAiConfig() {
  const config = {
    projectId: process.env.GCP_PROJECT_ID,
    projectNumber: process.env.GCP_PROJECT_NUMBER,
    serviceAccountEmail: process.env.GCP_SERVICE_ACCOUNT_EMAIL,
    poolId: process.env.GCP_WORKLOAD_IDENTITY_POOL_ID,
    providerId: process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID,
    location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
  }
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missing.length > 0) {
    throw new Error(`Missing Vertex AI configuration: ${missing.join(', ')}`)
  }

  return config as {
    projectId: string
    projectNumber: string
    serviceAccountEmail: string
    poolId: string
    providerId: string
    location: string
  }
}
