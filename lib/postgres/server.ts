import { Pool } from 'pg'

let pool: Pool | null = null

export function getPostgresPool() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not configured.')
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 3,
      ssl: {
        rejectUnauthorized: false,
      },
    })
  }

  return pool
}
