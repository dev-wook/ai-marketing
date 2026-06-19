import { NextResponse, type NextRequest } from 'next/server'
import { jsonErrorResponse } from '@/lib/api/route-response'
import { findActiveAdminMemberByUsername } from '../server/member-repository'
import { verifyPassword } from '../server/password'
import {
  authSessionCookieName,
  authSessionMaxAgeSeconds,
  createAuthSessionToken,
} from '../server/session'

export async function POST(request: NextRequest) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return jsonErrorResponse({
      status: 400,
      message: '아이디와 비밀번호를 입력해주세요.',
    })
  }

  const username = typeof body === 'object' && body !== null && 'username' in body
    ? String(body.username).trim()
    : ''
  const password = typeof body === 'object' && body !== null && 'password' in body
    ? String(body.password)
    : ''

  if (!username || !password) {
    return jsonErrorResponse({
      status: 400,
      message: '아이디와 비밀번호를 입력해주세요.',
    })
  }

  try {
    const member = await findActiveAdminMemberByUsername(username)

    if (!member) {
      return jsonErrorResponse({
        status: 401,
        message: '아이디 또는 비밀번호가 올바르지 않습니다.',
      })
    }

    const isValidPassword = await verifyPassword({
      password,
      salt: member.passwordSalt,
      hash: member.passwordHash,
    })

    if (!isValidPassword) {
      return jsonErrorResponse({
        status: 401,
        message: '아이디 또는 비밀번호가 올바르지 않습니다.',
      })
    }

    const user = {
      id: member.id,
      username: member.username,
      nickname: member.nickname,
    }
    const response = NextResponse.json({ user })

    response.cookies.set(authSessionCookieName, createAuthSessionToken(user), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: authSessionMaxAgeSeconds,
    })

    return response
  } catch (error) {
    console.error('[auth:login] failed', error)

    return jsonErrorResponse({
      status: 500,
      message: '로그인 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
    })
  }
}
