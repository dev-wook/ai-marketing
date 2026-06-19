import { getPostgresPool } from '@/lib/postgres/server'

export type AdminMemberRecord = {
  id: number
  username: string
  passwordSalt: string
  passwordHash: string
  nickname: string
}

type AdminMemberRow = {
  id: string | number
  username: string
  password_salt: string
  password_hash: string
  nickname: string
}

export async function findActiveAdminMemberByUsername(
  username: string,
): Promise<AdminMemberRecord | null> {
  const pool = getPostgresPool()
  const result = await pool.query<AdminMemberRow>(
    `
      select id, username, password_salt, password_hash, nickname
      from public.admin_members
      where username = $1
        and is_deleted = false
      limit 1
    `,
    [username],
  )

  const row = result.rows[0]

  if (!row) {
    return null
  }

  return {
    id: Number(row.id),
    username: row.username,
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
    nickname: row.nickname,
  }
}
