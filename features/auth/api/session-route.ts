import { NextResponse, type NextRequest } from 'next/server'
import { getAuthUserFromRequest } from '../server/session'

export async function GET(request: NextRequest) {
  const user = getAuthUserFromRequest(request)

  return NextResponse.json({
    authenticated: Boolean(user),
    user,
  })
}
