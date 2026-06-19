import { NextResponse } from 'next/server'
import { authSessionCookieName } from '../server/session'

export async function POST() {
  const response = NextResponse.json({ ok: true })

  response.cookies.set(authSessionCookieName, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })

  return response
}
