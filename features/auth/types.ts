export type AuthUser = {
  id: number
  username: string
  nickname: string
}

export type LoginResponse = {
  user: AuthUser
}

export type SessionResponse = {
  authenticated: boolean
  user: AuthUser | null
}
