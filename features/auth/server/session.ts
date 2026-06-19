import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'
import type { AuthUser } from '../types'
import { authSessionCookieName, authSessionMaxAgeSeconds } from './session-constants'

export { authSessionCookieName, authSessionMaxAgeSeconds }

type SessionPayload = AuthUser & {
  expiresAt: number
}

function getSessionSecret() {
  return (
    process.env.AUTH_SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.GEMINI_API_KEY ||
    'aiva-local-development-session-secret'
  )
}

function toBase64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4)

  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8')
}

function sign(payload: string) {
  return toBase64Url(createHmac('sha256', getSessionSecret()).update(payload).digest())
}

export function createAuthSessionToken(user: AuthUser) {
  const payload: SessionPayload = {
    ...user,
    expiresAt: Date.now() + authSessionMaxAgeSeconds * 1000,
  }
  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const signature = sign(encodedPayload)

  return `${encodedPayload}.${signature}`
}

export function verifyAuthSessionToken(token?: string | null): AuthUser | null {
  if (!token) {
    return null
  }

  const [encodedPayload, signature] = token.split('.')

  if (!encodedPayload || !signature) {
    return null
  }

  const expectedSignature = sign(encodedPayload)
  const provided = Buffer.from(signature)
  const expected = Buffer.from(expectedSignature)

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as SessionPayload

    if (!payload.id || !payload.username || !payload.nickname || payload.expiresAt < Date.now()) {
      return null
    }

    return {
      id: payload.id,
      username: payload.username,
      nickname: payload.nickname,
    }
  } catch {
    return null
  }
}

export function getAuthUserFromRequest(request: NextRequest) {
  return verifyAuthSessionToken(request.cookies.get(authSessionCookieName)?.value)
}
