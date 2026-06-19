import { NextResponse, type NextRequest } from 'next/server'
import { authSessionCookieName } from '@/features/auth/server/session-constants'

const publicPathPrefixes = [
  '/api/',
  '/_next/',
  '/favicon.ico',
  '/icon.png',
  '/apple-touch-icon.png',
  '/manifest.webmanifest',
  '/web-app-icon-',
  '/maskable-icon-',
  '/aiva-logo.png',
]

function isPublicPath(pathname: string) {
  return publicPathPrefixes.some((prefix) => pathname.startsWith(prefix))
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const hasSession = Boolean(request.cookies.get(authSessionCookieName)?.value)

  if (pathname === '/login') {
    if (hasSession) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    return NextResponse.next()
  }

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)

    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!.*\\..*).*)'],
}
